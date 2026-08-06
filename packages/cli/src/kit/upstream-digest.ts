import { createHash } from "node:crypto";

export interface UpstreamDigestEntry {
  path: string;
  content: Uint8Array;
}

function normalizeRelativePath(input: string): string {
  const normalized = input.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error(`upstream digest path must not be absolute: ${input}`);
  }
  const segments = normalized.split("/");
  if (segments.includes("..")) {
    throw new Error(`upstream digest path must not contain parent traversal: ${input}`);
  }
  if (segments.some((segment) => segment.length === 0 || segment === ".")) {
    throw new Error(`upstream digest path is ambiguous: ${input}`);
  }
  return segments.join("/");
}

function uint64(value: number): Buffer {
  const frame = Buffer.allocUnsafe(8);
  frame.writeBigUInt64BE(BigInt(value));
  return frame;
}

/** Hash normalized paths and raw bytes using unsigned 64-bit big-endian frames. */
export function canonicalUpstreamDigest(entries: UpstreamDigestEntry[]): string {
  const normalized = entries.map((entry) => ({
    path: normalizeRelativePath(entry.path),
    content: entry.content,
  }));
  normalized.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));

  const seen = new Set<string>();
  const hash = createHash("sha256");
  for (const entry of normalized) {
    if (seen.has(entry.path)) throw new Error(`duplicate upstream digest path: ${entry.path}`);
    seen.add(entry.path);
    const pathBytes = Buffer.from(entry.path, "utf8");
    const contentBytes = Buffer.from(entry.content);
    hash.update(uint64(pathBytes.length));
    hash.update(pathBytes);
    hash.update(uint64(contentBytes.length));
    hash.update(contentBytes);
  }
  return `sha256:${hash.digest("hex")}`;
}
