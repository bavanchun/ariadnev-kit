import { gzipSync } from "node:zlib";

function octal(value: number, width: number): Buffer {
  return Buffer.from(`${value.toString(8).padStart(width - 2, "0")}\0 `, "ascii");
}

function text(value: string, width: number): Buffer {
  const buffer = Buffer.alloc(width, 0);
  Buffer.from(value, "utf8").copy(buffer, 0, 0, Math.min(width, Buffer.byteLength(value)));
  return buffer;
}

export function tarEntry(input: {
  path: string;
  content?: Buffer;
  type?: string;
  mode?: number;
  uid?: number;
  gid?: number;
  mtime?: number;
  owner?: string;
  group?: string;
  sizeText?: string;
  checksumText?: string;
}): Buffer {
  const content = input.content ?? Buffer.alloc(0);
  const parts = input.path.split("/");
  const name = parts.pop() ?? "";
  const prefix = parts.join("/");
  const header = Buffer.alloc(512, 0);
  text(name, 100).copy(header, 0);
  octal(input.mode ?? 0o644, 8).copy(header, 100);
  octal(input.uid ?? 0, 8).copy(header, 108);
  octal(input.gid ?? 0, 8).copy(header, 116);
  (input.sizeText ? Buffer.from(input.sizeText, "ascii") : octal(content.byteLength, 12)).copy(header, 124);
  octal(input.mtime ?? 1, 12).copy(header, 136);
  Buffer.from("        ", "ascii").copy(header, 148);
  header[156] = (input.type ?? "0").charCodeAt(0);
  Buffer.from("ustar\0", "ascii").copy(header, 257);
  Buffer.from("00", "ascii").copy(header, 263);
  text(input.owner ?? "root", 32).copy(header, 265);
  text(input.group ?? "root", 32).copy(header, 297);
  text(prefix, 155).copy(header, 345);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  Buffer.from(input.checksumText ?? `${checksum.toString(8).padStart(6, "0")}\0 `, "ascii").copy(header, 148);
  const remainder = content.byteLength % 512;
  return Buffer.concat([header, content, remainder === 0 ? Buffer.alloc(0) : Buffer.alloc(512 - remainder, 0)]);
}

export function gzipTar(parts: Buffer[], trailing = Buffer.alloc(0), mtime = 1): Buffer {
  const archive = gzipSync(Buffer.concat([...parts, Buffer.alloc(1024, 0), trailing]), { level: 9 });
  archive.writeUInt32LE(mtime, 4);
  archive[8] = 2;
  archive[9] = 255;
  return archive;
}
