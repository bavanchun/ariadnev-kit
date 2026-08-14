import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { normalizeArchivePath, readValidatedArchive } from "./docs-bundle-archive-reader.js";
import { validateArchiveLimits } from "./docs-bundle-archive-limits.js";
import type { DocsBundleDigest, DocsBundleFileEntry } from "./docs-bundle-types.js";

function digest(content: Buffer): DocsBundleDigest {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function asOctal(value: number, width: number): Buffer {
  return Buffer.from(`${value.toString(8).padStart(width - 2, "0")}\0 `, "ascii");
}

function asString(value: string, width: number): Buffer {
  const buffer = Buffer.alloc(width, 0);
  Buffer.from(value, "utf8").copy(buffer, 0, 0, Math.min(width, Buffer.byteLength(value)));
  return buffer;
}

function splitTarPath(path: string): { name: string; prefix: string } {
  if (Buffer.byteLength(path) <= 100) return { name: path, prefix: "" };
  const index = path.lastIndexOf("/");
  if (index <= 0) throw new Error(`tar path exceeds header limits: ${path}`);
  const prefix = path.slice(0, index);
  const name = path.slice(index + 1);
  if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) throw new Error(`tar path exceeds header limits: ${path}`);
  return { name, prefix };
}

function tarHeader(path: string, size: number, mtime: number): Buffer {
  const { name, prefix } = splitTarPath(path);
  const header = Buffer.alloc(512, 0);
  asString(name, 100).copy(header, 0);
  asOctal(0o644, 8).copy(header, 100);
  asOctal(0, 8).copy(header, 108);
  asOctal(0, 8).copy(header, 116);
  asOctal(size, 12).copy(header, 124);
  asOctal(mtime, 12).copy(header, 136);
  Buffer.from("        ", "ascii").copy(header, 148);
  header[156] = "0".charCodeAt(0);
  Buffer.from("ustar\0", "ascii").copy(header, 257);
  Buffer.from("00", "ascii").copy(header, 263);
  asString("root", 32).copy(header, 265);
  asString("root", 32).copy(header, 297);
  asString(prefix, 155).copy(header, 345);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  asOctal(checksum, 8).copy(header, 148);
  return header;
}

function normalizeEntry(entry: DocsBundleFileEntry) {
  const path = normalizeArchivePath(entry.path);
  const content = Buffer.from(entry.content.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  return { path, content, digest: digest(content) };
}

export function createDeterministicArchive(
  files: DocsBundleFileEntry[],
  options: { gzipMtime: number; tarMtime: number; maxFiles?: number; maxBytesPerFile?: number; maxTotalBytes?: number },
) {
  for (const [label, value] of [["gzipMtime", options.gzipMtime], ["tarMtime", options.tarMtime]] as const) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) throw new Error(`${label} must be a canonical uint32 timestamp`);
  }
  if (options.gzipMtime !== options.tarMtime) throw new Error("gzip and tar mtimes must match");
  const { maxFiles, maxBytesPerFile, maxTotalBytes } = validateArchiveLimits({
    maxFiles: options.maxFiles,
    maxBytesPerFile: options.maxBytesPerFile,
    maxTotalBytes: options.maxTotalBytes,
  });
  if (files.length === 0) throw new Error("archive requires at least one file");
  if (files.length > maxFiles) throw new Error(`file count exceeds ${maxFiles}`);
  let inputBytes = 0;
  const inputPaths = new Set<string>();
  for (const file of files) {
    const path = normalizeArchivePath(file.path);
    if (inputPaths.has(path)) throw new Error(`duplicate archive path: ${path}`);
    inputPaths.add(path);
    if (file.content.byteLength > maxBytesPerFile) throw new Error(`entry exceeds per-file byte limit: ${path}`);
    inputBytes += file.content.byteLength;
    if (inputBytes > maxTotalBytes) throw new Error(`archive exceeds total byte limit: ${inputBytes}`);
  }
  const normalized = files.map(normalizeEntry).sort((left, right) => left.path.localeCompare(right.path));
  const seen = new Set<string>();
  let totalBytes = 0;
  const chunks: Buffer[] = [];
  for (const entry of normalized) {
    if (seen.has(entry.path)) throw new Error(`duplicate archive path: ${entry.path}`);
    seen.add(entry.path);
    if (entry.content.byteLength > maxBytesPerFile) throw new Error(`entry exceeds per-file byte limit: ${entry.path}`);
    totalBytes += entry.content.byteLength;
    if (totalBytes > maxTotalBytes) throw new Error(`archive exceeds total byte limit: ${totalBytes}`);
    chunks.push(tarHeader(entry.path, entry.content.byteLength, options.tarMtime), entry.content);
    const remainder = entry.content.byteLength % 512;
    if (remainder !== 0) chunks.push(Buffer.alloc(512 - remainder, 0));
  }
  chunks.push(Buffer.alloc(1024, 0));
  const tar = Buffer.concat(chunks);
  const archive = gzipSync(tar, { level: 9 });
  archive.writeUInt32LE(options.gzipMtime, 4);
  archive[8] = 2;
  archive[9] = 255;
  return { archive, digest: digest(archive), fileCount: normalized.length, totalBytes };
}

export function extractArchiveMember(archive: Buffer, targetPath: string): Buffer {
  const normalizedTarget = normalizeArchivePath(targetPath);
  const entry = readValidatedArchive(archive).find((candidate) => candidate.path === normalizedTarget);
  if (entry) return entry.content;
  throw new Error(`archive member not found: ${targetPath}`);
}
