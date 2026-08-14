import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { DocsBundleDigest } from "./docs-bundle-types.js";
import { maximumTarBytes, validateArchiveLimits } from "./docs-bundle-archive-limits.js";

const SAFE_PATH = /^[A-Za-z0-9._/-]+$/;
const GZIP_FRAMING_ALLOWANCE = 4096;

export function normalizeArchivePath(value: string): string {
  const path = value.replace(/\\/g, "/");
  if (!path || path.startsWith("/") || path.endsWith("/") || path.includes("//")) throw new Error(`path must be a safe relative file path: ${value}`);
  if (!SAFE_PATH.test(path) || path.split("/").some((part) => part === "." || part === ".." || part.length === 0)) {
    throw new Error(`path must be a safe relative file path: ${value}`);
  }
  return path;
}

function parseOctal(header: Buffer, start: number, length: number, label: string): number {
  const raw = header.subarray(start, start + length).toString("ascii");
  if (/[^0-7\0 ]/.test(raw)) throw new Error(`malformed tar ${label}`);
  const trimmed = raw.replace(/\0.*$/, "").trim();
  const value = trimmed === "" ? 0 : Number.parseInt(trimmed, 8);
  if (!Number.isSafeInteger(value)) throw new Error(`malformed tar ${label}`);
  return value;
}

function textField(header: Buffer, start: number, length: number, label: string): string {
  const field = header.subarray(start, start + length);
  const zero = field.indexOf(0);
  if (zero !== -1 && !field.subarray(zero).every((value) => value === 0)) throw new Error(`malformed tar ${label}`);
  return field.subarray(0, zero === -1 ? field.length : zero).toString("utf8");
}

function validateHeaderChecksum(header: Buffer): void {
  const expected = parseOctal(header, 148, 8, "header checksum");
  const copy = Buffer.from(header);
  Buffer.from("        ", "ascii").copy(copy, 148);
  const actual = copy.reduce((sum, byte) => sum + byte, 0);
  if (actual !== expected) throw new Error("invalid tar header checksum");
}

function isZeroBlock(block: Buffer): boolean {
  return block.every((value) => value === 0);
}

function digest(content: Buffer): DocsBundleDigest {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function readValidatedArchive(
  archive: Buffer,
  limits: { maxFiles?: number; maxBytesPerFile?: number; maxTotalBytes?: number } = {},
): Array<{ path: string; content: Buffer; digest: DocsBundleDigest }> {
  const { maxFiles, maxBytesPerFile, maxTotalBytes } = validateArchiveLimits(limits);
  const maxTarBytes = maximumTarBytes({ maxFiles, maxBytesPerFile, maxTotalBytes });
  if (archive.byteLength > maxTarBytes + GZIP_FRAMING_ALLOWANCE) throw new Error(`archive exceeds compressed byte limit: ${archive.byteLength}`);
  if (archive.byteLength < 18 || archive[0] !== 0x1f || archive[1] !== 0x8b || archive[2] !== 8 || archive[3] !== 0) {
    throw new Error("archive must use canonical gzip framing");
  }
  if (archive[8] !== 2 || archive[9] !== 255) throw new Error("archive must use canonical gzip metadata");
  const gzipMtime = archive.readUInt32LE(4);
  const tar = gunzipSync(archive, { maxOutputLength: maxTarBytes });
  const entries: Array<{ path: string; content: Buffer; digest: DocsBundleDigest }> = [];
  const seen = new Set<string>();
  let offset = 0;
  let totalBytes = 0;
  let archiveMtime: number | undefined;
  while (offset < tar.length) {
    if (offset + 512 > tar.length) throw new Error("truncated tar header");
    const header = tar.subarray(offset, offset + 512);
    if (isZeroBlock(header)) {
      if (offset + 1024 > tar.length || !isZeroBlock(tar.subarray(offset + 512, offset + 1024))) throw new Error("truncated tar terminator");
      if (offset + 1024 !== tar.length) throw new Error("trailing data after tar terminator");
      return entries;
    }
    validateHeaderChecksum(header);
    const type = String.fromCharCode(header[156] ?? 0).replace(/\0/g, "");
    if (type !== "" && type !== "0") throw new Error(`unsupported archive entry type: ${type}`);
    const mode = parseOctal(header, 100, 8, "mode");
    const uid = parseOctal(header, 108, 8, "uid");
    const gid = parseOctal(header, 116, 8, "gid");
    const mtime = parseOctal(header, 136, 12, "mtime");
    if (mode !== 0o644) throw new Error(`unsafe archive mode: ${mode.toString(8)}`);
    if (uid !== 0) throw new Error(`unsafe archive uid: ${uid}`);
    if (gid !== 0) throw new Error(`unsafe archive gid: ${gid}`);
    if (!Number.isSafeInteger(mtime) || mtime < 0) throw new Error(`unsafe archive mtime: ${mtime}`);
    archiveMtime ??= mtime;
    if (mtime !== archiveMtime || mtime !== gzipMtime) throw new Error("archive entries and gzip header must share one mtime");
    if (textField(header, 257, 6, "magic") !== "ustar" || textField(header, 263, 2, "version") !== "00") {
      throw new Error("archive must use canonical ustar headers");
    }
    if (textField(header, 265, 32, "owner") !== "root" || textField(header, 297, 32, "group") !== "root") {
      throw new Error("archive must use canonical owner metadata");
    }
    const name = textField(header, 0, 100, "name");
    const prefix = textField(header, 345, 155, "prefix");
    const path = normalizeArchivePath(prefix ? `${prefix}/${name}` : name);
    if (seen.has(path)) throw new Error(`duplicate archive path: ${path}`);
    seen.add(path);
    const size = parseOctal(header, 124, 12, "size");
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`malformed tar size for ${path}`);
    if (size > maxBytesPerFile) throw new Error(`entry exceeds per-file byte limit: ${path}`);
    totalBytes += size;
    if (totalBytes > maxTotalBytes) throw new Error(`archive exceeds total byte limit: ${totalBytes}`);
    if (entries.length + 1 > maxFiles) throw new Error(`file count exceeds ${maxFiles}`);
    const start = offset + 512;
    const end = start + size;
    if (end > tar.length) throw new Error(`archive member exceeds tar length: ${path}`);
    const content = tar.subarray(start, end);
    entries.push({ path, content, digest: digest(content) });
    const nextOffset = start + Math.ceil(size / 512) * 512;
    if (!tar.subarray(end, nextOffset).every((value) => value === 0)) throw new Error(`archive member has non-zero padding: ${path}`);
    offset = nextOffset;
  }
  throw new Error("missing tar terminator");
}
