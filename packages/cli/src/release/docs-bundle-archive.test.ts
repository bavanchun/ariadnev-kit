import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { gzipTar, tarEntry } from "./docs-bundle-archive-test-helpers.js";
import { createDeterministicArchive, extractArchiveMember } from "./docs-bundle-archive.js";
import { readValidatedArchive } from "./docs-bundle-archive-reader.js";

function readTarEntries(buffer: Buffer): Array<{ path: string; mode: string; mtime: string; type: string; data: Buffer }> {
  const entries: Array<{ path: string; mode: string; mtime: string; type: string; data: Buffer }> = [];
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const path = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(header.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim() || "0", 8);
    const mode = header.subarray(100, 108).toString("utf8").replace(/\0.*$/, "");
    const mtime = header.subarray(136, 148).toString("utf8").replace(/\0.*$/, "");
    const type = header.subarray(156, 157).toString("utf8");
    const start = offset + 512;
    const end = start + size;
    entries.push({ path, mode, mtime, type, data: buffer.subarray(start, end) });
    offset = start + Math.ceil(size / 512) * 512;
  }
  return entries;
}

describe("deterministic docs bundle archive", () => {
  it("produces byte-identical tar.gz output for the same logical files", () => {
    const left = createDeterministicArchive(
      [
        { path: "reference/zeta.txt", content: Buffer.from("zeta\n", "utf8") },
        { path: "reference/alpha.txt", content: Buffer.from("alpha\r\n", "utf8") },
      ],
      { gzipMtime: 1_754_611_200, tarMtime: 1_754_611_200 },
    );
    const right = createDeterministicArchive(
      [
        { path: "reference/alpha.txt", content: Buffer.from("alpha\n", "utf8") },
        { path: "reference/zeta.txt", content: Buffer.from("zeta\n", "utf8") },
      ],
      { gzipMtime: 1_754_611_200, tarMtime: 1_754_611_200 },
    );

    expect(left.archive.equals(right.archive)).toBe(true);
    expect(left.digest).toBe(right.digest);
    const entries = readTarEntries(gunzipSync(left.archive));
    expect(entries.map((entry) => entry.path)).toEqual(["reference/alpha.txt", "reference/zeta.txt"]);
    expect(entries.every((entry) => entry.type === "0")).toBe(true);
    expect(entries.every((entry) => entry.mode.endsWith("644"))).toBe(true);
    expect(new Set(entries.map((entry) => entry.mtime))).toEqual(new Set(["15045237000"]));
    expect(entries[0]?.data.toString("utf8")).toBe("alpha\n");
  });

  it("accepts the canonical epoch-zero timestamp", () => {
    expect(() => createDeterministicArchive([{ path: "epoch.txt", content: Buffer.from("x") }], {
      gzipMtime: 0,
      tarMtime: 0,
    })).not.toThrow();
  });

  it("extracts canonical members and rejects unsafe paths or bounds violations", () => {
    const archive = createDeterministicArchive([{ path: "safe/file.txt", content: Buffer.from("ok\n", "utf8") }], {
      gzipMtime: 1_754_611_200,
      tarMtime: 1_754_611_200,
    });
    expect(extractArchiveMember(archive.archive, "safe/file.txt").toString("utf8")).toBe("ok\n");

    expect(() => createDeterministicArchive([{ path: "../escape.txt", content: Buffer.from("x", "utf8") }], {
      gzipMtime: 1,
      tarMtime: 1,
    })).toThrow(/safe relative/i);
    expect(() => createDeterministicArchive([{ path: "/abs.txt", content: Buffer.from("x", "utf8") }], {
      gzipMtime: 1,
      tarMtime: 1,
    })).toThrow(/safe relative/i);
    expect(() => createDeterministicArchive([{ path: "dup.txt", content: Buffer.from("x", "utf8") }, { path: "dup.txt", content: Buffer.from("y", "utf8") }], {
      gzipMtime: 1,
      tarMtime: 1,
    })).toThrow(/duplicate/i);
    expect(() => createDeterministicArchive([{ path: "huge.txt", content: Buffer.alloc(513 * 1024, 0x61) }], {
      gzipMtime: 1,
      tarMtime: 1,
      maxBytesPerFile: 512 * 1024,
    })).toThrow(/per-file/i);
    expect(() => createDeterministicArchive([{ path: "a.txt", content: Buffer.alloc(4, 0x61) }, { path: "b.txt", content: Buffer.alloc(4, 0x62) }], {
      gzipMtime: 1,
      tarMtime: 1,
      maxFiles: 1,
    })).toThrow(/file count/i);
  });

  it("rejects tar path overflow instead of truncating distinct paths", () => {
    const prefix = "a".repeat(156);
    expect(() => createDeterministicArchive([{ path: `${prefix}/file.txt`, content: Buffer.from("x", "utf8") }], {
      gzipMtime: 1,
      tarMtime: 1,
    })).toThrow(/header limits/i);
  });

  it("validates the full tar stream before returning an early member", () => {
    const archive = gzipTar([
      tarEntry({ path: "safe/file.txt", content: Buffer.from("ok\n", "utf8") }),
      tarEntry({ path: "safe/file.txt", content: Buffer.from("dup\n", "utf8") }),
    ]);
    expect(() => extractArchiveMember(archive, "safe/file.txt")).toThrow(/duplicate archive path/i);
  });

  it("rejects unsafe tar metadata, malformed headers, and trailing data", () => {
    expect(() => extractArchiveMember(gzipTar([tarEntry({ path: "unsafe-link", type: "2" })]), "unsafe-link")).toThrow(/unsupported archive entry type/i);
    expect(() => extractArchiveMember(gzipTar([tarEntry({ path: "bad-mode.txt", mode: 0o777 })]), "bad-mode.txt")).toThrow(/unsafe archive mode/i);
    expect(() => extractArchiveMember(gzipTar([tarEntry({ path: "bad-uid.txt", uid: 1 })]), "bad-uid.txt")).toThrow(/unsafe archive uid/i);
    expect(() => extractArchiveMember(gzipTar([tarEntry({ path: "bad-size.txt", sizeText: "not-octal\0 " })]), "bad-size.txt")).toThrow(/malformed tar size/i);
    expect(() => extractArchiveMember(gzipTar([tarEntry({ path: "bad-checksum.txt", checksumText: "000000\0 " })]), "bad-checksum.txt")).toThrow(/invalid tar header checksum/i);
    expect(() => extractArchiveMember(gzipTar([tarEntry({ path: "bad-owner.txt", owner: "nobody" })]), "bad-owner.txt")).toThrow(/owner metadata/i);
    expect(() => extractArchiveMember(gzipTar([tarEntry({ path: "bad-trailer.txt" })], Buffer.from("x", "utf8")), "bad-trailer.txt")).toThrow(/trailing data/i);
  });

  it("rejects truncated content and compressed size inflation", () => {
    const truncated = gzipTar([tarEntry({ path: "truncated.txt", content: Buffer.from("1234", "utf8"), sizeText: "00000000010\0 " })]);
    expect(() => extractArchiveMember(truncated.subarray(0, truncated.length - 2), "truncated.txt")).toThrow();

    const inflated = createDeterministicArchive([{ path: "huge.bin", content: Buffer.alloc(64, 0x61) }], {
      gzipMtime: 1,
      tarMtime: 1,
      maxTotalBytes: 64,
    });
    expect(() => extractArchiveMember(inflated.archive, "huge.bin")).not.toThrow();
  });

  it("rejects non-canonical gzip metadata, timestamp drift, and member padding", () => {
    const canonical = createDeterministicArchive([{ path: "safe.txt", content: Buffer.from("x") }], { gzipMtime: 1, tarMtime: 1 });
    const badGzip = Buffer.from(canonical.archive);
    badGzip[9] = 3;
    expect(() => extractArchiveMember(badGzip, "safe.txt")).toThrow(/gzip metadata/i);
    const badMtime = Buffer.from(canonical.archive);
    badMtime.writeUInt32LE(2, 4);
    expect(() => extractArchiveMember(badMtime, "safe.txt")).toThrow(/share one mtime/i);
    const padded = tarEntry({ path: "bad-padding.txt", content: Buffer.from("x") });
    padded[padded.length - 1] = 1;
    expect(() => extractArchiveMember(gzipTar([padded]), "bad-padding.txt")).toThrow(/non-zero padding/i);
    expect(() => createDeterministicArchive([{ path: "safe.txt", content: Buffer.from("x") }], { gzipMtime: 1, tarMtime: 2 })).toThrow(/mtimes must match/i);
  });

  it.each([Number.NaN, Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid configurable writer and reader bounds: %s",
    (invalid) => {
      const file = { path: "safe.txt", content: Buffer.from("x") };
      expect(() => createDeterministicArchive([file], { gzipMtime: 1, tarMtime: 1, maxFiles: invalid })).toThrow(/positive safe integer/i);
      expect(() => readValidatedArchive(Buffer.alloc(0), { maxTotalBytes: invalid })).toThrow(/positive safe integer/i);
    },
  );

  it("rejects hard-ceiling and cross-bound configurations before archive work", () => {
    const file = { path: "safe.txt", content: Buffer.from("x") };
    expect(() => createDeterministicArchive([file], {
      gzipMtime: 1,
      tarMtime: 1,
      maxFiles: 4097,
    })).toThrow(/no greater than/i);
    expect(() => readValidatedArchive(Buffer.alloc(0), {
      maxBytesPerFile: 2,
      maxTotalBytes: 1,
    })).toThrow(/must not exceed/i);
  });
});
