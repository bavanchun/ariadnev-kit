import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  runUpdate,
  isNewerVersion,
  parseLatestTag,
  assetNameFor,
  expectedSha,
  type UpdateDeps,
  type UpdateHandlerOpts,
} from "./update-command.js";
import { isValidVersion } from "./update-version.js";

describe("isValidVersion", () => {
  it("accepts an exact x.y.z version", () => {
    expect(isValidVersion("1.2.3")).toBe(true);
    expect(isValidVersion("0.0.0")).toBe(true);
    expect(isValidVersion("10.20.300")).toBe(true);
  });
  it("rejects anything that isn't exactly x.y.z", () => {
    expect(isValidVersion("1.0")).toBe(false);
    expect(isValidVersion("1.0.0.0")).toBe(false);
    expect(isValidVersion("v1.0.0")).toBe(false);
    expect(isValidVersion("latest")).toBe(false);
    expect(isValidVersion("^1.0.0")).toBe(false);
    expect(isValidVersion("~1.0.0")).toBe(false);
    expect(isValidVersion(">=1.0.0")).toBe(false);
    expect(isValidVersion("1.0.0-beta")).toBe(false);
    expect(isValidVersion("1.0.0+build.1")).toBe(false);
    expect(isValidVersion("")).toBe(false);
    expect(isValidVersion("1.0.0\n")).toBe(false);
    expect(isValidVersion("1.0.0; rm -rf /")).toBe(false);
    expect(isValidVersion("1.0.0/../../etc")).toBe(false);
  });
});

describe("parseLatestTag", () => {
  it("strips the ariadnev@ prefix", () => {
    expect(parseLatestTag("ariadnev@0.5.0")).toBe("0.5.0");
  });
  it("tolerates a bare version or a leading v", () => {
    expect(parseLatestTag("0.5.0")).toBe("0.5.0");
    expect(parseLatestTag("v0.5.0")).toBe("0.5.0");
  });
});

describe("assetNameFor", () => {
  it("maps supported platform/arch pairs", () => {
    expect(assetNameFor("darwin", "arm64")).toBe("ariadnev-darwin-arm64");
    expect(assetNameFor("darwin", "x64")).toBe("ariadnev-darwin-x64");
    expect(assetNameFor("linux", "arm64")).toBe("ariadnev-linux-arm64");
    expect(assetNameFor("linux", "x64")).toBe("ariadnev-linux-x64");
    expect(assetNameFor("win32", "x64")).toBe("ariadnev-windows-x64.exe");
  });
  it("returns null for unsupported combos", () => {
    expect(assetNameFor("win32", "arm64")).toBeNull();
    expect(assetNameFor("freebsd" as NodeJS.Platform, "x64")).toBeNull();
    expect(assetNameFor("linux", "ia32")).toBeNull();
  });
});

describe("expectedSha", () => {
  it("finds the sha for an exact asset name", () => {
    const body = "aaa  ariadnev-linux-x64\nbbb  ariadnev-darwin-arm64\n";
    expect(expectedSha(body, "ariadnev-darwin-arm64")).toBe("bbb");
    expect(expectedSha(body, "ariadnev-windows-x64.exe")).toBeNull();
  });
});

describe("runUpdate", () => {
  let sandbox: string;
  let root: string;
  const bin = new Uint8Array([1, 2, 3, 4]);
  const binSha = createHash("sha256").update(bin).digest("hex");

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "ariadnev-update-"));
    root = join(sandbox, "proj");
    mkdirSync(root, { recursive: true });
  });
  afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

  function writeReceipt(version: string) {
    mkdirSync(join(root, ".ariadnev"), { recursive: true });
    writeFileSync(join(root, ".ariadnev", "receipt.json"), JSON.stringify({ ariadnevVersion: version }));
  }

  function baseOpts(over: Partial<UpdateHandlerOpts> = {}): UpdateHandlerOpts {
    return {
      home: sandbox,
      cwd: root,
      scope: "project",
      currentVersion: "0.5.0",
      execPath: join(sandbox, "ariadnev"),
      isBinary: true,
      checkOnly: false,
      to: null,
      platform: "darwin",
      arch: "arm64",
      ...over,
    };
  }

  function deps(over: Partial<UpdateDeps> = {}): UpdateDeps & { replaced: { path: string; bytes: Uint8Array }[] } {
    const replaced: { path: string; bytes: Uint8Array }[] = [];
    return {
      fetchLatestVersion: async () => "0.6.0",
      fetchPinnedVersion: async () => null,
      downloadBinary: async () => bin,
      downloadText: async () => `${binSha}  ariadnev-darwin-arm64\n`,
      replaceBinary: (path, bytes) => replaced.push({ path, bytes }),
      replaced,
      ...over,
    };
  }

  it("reports offline and does not download", async () => {
    const d = deps({ fetchLatestVersion: async () => null });
    const res = await runUpdate(baseOpts(), d);
    expect(res.summary).toContain("could not check");
    expect(d.replaced).toHaveLength(0);
  });

  it("reports up to date when not newer", async () => {
    const d = deps({ fetchLatestVersion: async () => "0.5.0" });
    const res = await runUpdate(baseOpts(), d);
    expect(res.summary).toContain("up to date");
    expect(d.replaced).toHaveLength(0);
  });

  it("self-updates the binary when a newer version verifies", async () => {
    const d = deps();
    const res = await runUpdate(baseOpts(), d);
    expect(res.summary).toContain("updated 0.5.0 -> 0.6.0");
    expect(d.replaced).toHaveLength(1);
    expect(d.replaced[0].bytes).toEqual(bin);
  });

  it("does NOT replace on a checksum mismatch (fail-closed)", async () => {
    const d = deps({ downloadText: async () => "deadbeef  ariadnev-darwin-arm64\n" });
    const res = await runUpdate(baseOpts(), d);
    expect(res.summary).toContain("checksum mismatch");
    expect(res.summary).toContain("NOT replaced");
    expect(d.replaced).toHaveLength(0);
  });

  it("--check only reports, never replaces", async () => {
    const d = deps();
    const res = await runUpdate(baseOpts({ checkOnly: true }), d);
    expect(res.summary).toContain("update available: 0.5.0 -> 0.6.0");
    expect(res.summary).toContain("ariadnev update");
    expect(d.replaced).toHaveLength(0);
  });

  it("guides to the curl installer when not running as the binary", async () => {
    const d = deps();
    const res = await runUpdate(baseOpts({ isBinary: false }), d);
    expect(res.summary).toContain("ariadnev.com/install");
    expect(d.replaced).toHaveLength(0);
  });

  it("reports (no replace) when the download fails", async () => {
    const d = deps({ downloadBinary: async () => null });
    const res = await runUpdate(baseOpts(), d);
    expect(res.summary).toContain("could not download");
    expect(d.replaced).toHaveLength(0);
  });

  it("notes when the receipt version differs from the running CLI", async () => {
    writeReceipt("0.4.0");
    const d = deps({ fetchLatestVersion: async () => "0.5.0" });
    const res = await runUpdate(baseOpts(), d);
    expect(res.summary).toContain("receipt was written by 0.4.0");
  });

  describe("--to (pinned)", () => {
    it("installs the exact pinned version and verifies its checksum", async () => {
      const d = deps({ fetchPinnedVersion: async () => "1.0.0" });
      const res = await runUpdate(baseOpts({ to: "1.0.0" }), d);
      expect(res.exitCode).toBe(0);
      expect(res.summary).toContain("0.5.0 -> 1.0.0");
      expect(d.replaced).toHaveLength(1);
      expect(d.replaced[0].bytes).toEqual(bin);
    });

    it("fails closed on an unknown pinned version (edge 404) and leaves the binary unchanged", async () => {
      const d = deps({ fetchPinnedVersion: async () => null });
      const res = await runUpdate(baseOpts({ to: "9.9.9" }), d);
      expect(res.exitCode).not.toBe(0);
      expect(res.summary.toLowerCase()).toContain("not found");
      expect(d.replaced).toHaveLength(0);
    });

    it("does not verify or install on a checksum mismatch for a pinned version", async () => {
      const d = deps({
        fetchPinnedVersion: async () => "1.0.0",
        downloadText: async () => "deadbeef  ariadnev-darwin-arm64\n",
      });
      const res = await runUpdate(baseOpts({ to: "1.0.0" }), d);
      expect(res.summary).toContain("checksum mismatch");
      expect(res.summary).toContain("NOT replaced");
      expect(d.replaced).toHaveLength(0);
    });

    it("rejects a malformed version before any network call", async () => {
      const calls: string[] = [];
      const d = deps({
        fetchLatestVersion: async () => {
          calls.push("fetchLatestVersion");
          return "0.6.0";
        },
        fetchPinnedVersion: async (v: string) => {
          calls.push(`fetchPinnedVersion:${v}`);
          return v;
        },
        downloadBinary: async (url: string) => {
          calls.push(`downloadBinary:${url}`);
          return bin;
        },
        downloadText: async (url: string) => {
          calls.push(`downloadText:${url}`);
          return `${binSha}  ariadnev-darwin-arm64\n`;
        },
      });
      for (const bad of ["1.0", "v1.0.0", "latest", "^1.0.0", "1.0.0-beta", "1.0.0; rm -rf /"]) {
        const res = await runUpdate(baseOpts({ to: bad }), d);
        expect(res.exitCode).not.toBe(0);
        expect(res.summary.toLowerCase()).toContain("invalid version");
      }
      expect(calls).toHaveLength(0);
      expect(d.replaced).toHaveLength(0);
    });

    it("--to with --check reports the pinned target without installing", async () => {
      const d = deps({ fetchPinnedVersion: async () => "1.0.0" });
      const res = await runUpdate(baseOpts({ to: "1.0.0", checkOnly: true }), d);
      expect(res.exitCode).toBe(0);
      expect(res.summary).toContain("0.5.0 -> 1.0.0");
      expect(d.replaced).toHaveLength(0);
    });

    it("passes the version as a query param on both the version and download requests", async () => {
      const seen: string[] = [];
      const d = deps({
        fetchPinnedVersion: async (v: string) => {
          seen.push(`version:${v}`);
          return v;
        },
        downloadBinary: async (url: string) => {
          seen.push(`binary:${url}`);
          return bin;
        },
        downloadText: async (url: string) => {
          seen.push(`text:${url}`);
          return `${binSha}  ariadnev-darwin-arm64\n`;
        },
      });
      await runUpdate(baseOpts({ to: "1.0.0" }), d);
      expect(seen[0]).toBe("version:1.0.0");
      expect(seen.some((s) => s.startsWith("binary:") && s.includes("?version=1.0.0"))).toBe(true);
      expect(seen.some((s) => s.startsWith("text:") && s.includes("?version=1.0.0"))).toBe(true);
    });
  });
});

describe("isNewerVersion", () => {
  it("compares numerically", () => {
    expect(isNewerVersion("0.10.0", "0.9.0")).toBe(true);
    expect(isNewerVersion("0.5.0", "0.5.0")).toBe(false);
    expect(isNewerVersion("0.4.0", "0.5.0")).toBe(false);
  });
});
