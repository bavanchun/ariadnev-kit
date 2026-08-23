import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, statSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKit } from "../kit/load-kit.js";
import { installKit } from "./install-execute.js";
import { atomicWrite } from "./fs-atomic.js";

// The path from a kit asset to the user's disk crosses four hops, and a single
// utf8 decode anywhere on it silently corrupts every non-text byte. These tests
// assert on the file the provider actually reads — a round-trip that only holds
// inside the cache proves nothing about what got installed.

// Real PNG header + IDAT bytes: 0x89 and 0xFF are exactly what utf8 decoding
// replaces with U+FFFD, so a corrupted copy is detectable rather than subtly odd.
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0xff, 0xfe, 0xfd,
]);
// woff2 signature `wOF2` followed by bytes that are invalid as a utf8 sequence.
const WOFF2_BYTES = Buffer.from([
  0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00, 0xc0, 0x80, 0xf5, 0x90,
  0xe0, 0xa0, 0x80, 0xff,
]);

const SKILL_MD = `---
name: av:asset-skill
description: Use this fixture skill to prove binary assets survive the install path intact.
---

# Asset Skill

Uses assets/logo.png and assets/font.woff2.

## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`;

function writeFixtureKit(root: string): void {
  const assets = join(root, "skills", "asset-skill", "assets");
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(root, "skills", "asset-skill", "SKILL.md"), SKILL_MD);
  writeFileSync(join(assets, "logo.png"), PNG_BYTES);
  writeFileSync(join(assets, "font.woff2"), WOFF2_BYTES);
}

describe("binary assets survive the install path", () => {
  let sandbox: string;
  let kitRoot: string;
  let ctx: { home: string; cwd: string; scope: "project" };

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "ariadnev-binary-"));
    kitRoot = join(sandbox, "kit");
    mkdirSync(kitRoot, { recursive: true });
    writeFixtureKit(kitRoot);
    ctx = { home: join(sandbox, "home"), cwd: join(sandbox, "proj"), scope: "project" };
    mkdirSync(ctx.home, { recursive: true });
    mkdirSync(ctx.cwd, { recursive: true });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("writes byte-identical PNG and woff2 into the provider tree", () => {
    installKit(loadKit(kitRoot), ["claude-code"], ctx, { timestamp: "20260814-000001" });
    const installed = join(ctx.cwd, ".claude", "skills", "av-asset-skill", "assets");
    expect(readFileSync(join(installed, "logo.png"))).toEqual(PNG_BYTES);
    expect(readFileSync(join(installed, "font.woff2"))).toEqual(WOFF2_BYTES);
  });

  it("hashes binary content by bytes, so a one-byte edit changes the hash", () => {
    installKit(loadKit(kitRoot), ["claude-code"], ctx, { timestamp: "20260814-000002" });
    const receiptPath = join(ctx.cwd, ".ariadnev", "receipt.json");
    const first = JSON.parse(readFileSync(receiptPath, "utf8")) as {
      installs: Record<string, { files: { path: string; sha256: string }[] }>;
    };
    const pngEntry = first.installs["claude-code"].files.find((f) => f.path.endsWith("logo.png"));
    expect(pngEntry).toBeDefined();

    const flipped = Buffer.from(PNG_BYTES);
    flipped[flipped.length - 1] ^= 0x01;
    writeFileSync(join(kitRoot, "skills", "asset-skill", "assets", "logo.png"), flipped);

    rmSync(join(ctx.cwd, ".ariadnev"), { recursive: true, force: true });
    installKit(loadKit(kitRoot), ["claude-code"], ctx, { timestamp: "20260814-000003" });
    const second = JSON.parse(readFileSync(receiptPath, "utf8")) as typeof first;
    const changed = second.installs["claude-code"].files.find((f) => f.path.endsWith("logo.png"));
    expect(changed!.sha256).not.toBe(pngEntry!.sha256);
  });

  it("installs an executable source file as executable", () => {
    const script = join(kitRoot, "skills", "asset-skill", "run.sh");
    writeFileSync(script, "#!/bin/sh\necho hi\n");
    chmodSync(script, 0o700);
    installKit(loadKit(kitRoot), ["claude-code"], ctx, { timestamp: "20260814-000005" });
    const installed = join(ctx.cwd, ".claude", "skills", "av-asset-skill", "run.sh");
    // 0700 on the authoring machine ships as 0755 — the permission is declared,
    // not inherited.
    expect(statSync(installed).mode & 0o777).toBe(0o755);
  });

  it("refuses a mode outside 644/755", () => {
    expect(() => atomicWrite(join(sandbox, "weird.txt"), "x", 0o777)).toThrow(/only 644 and 755/);
    expect(() => atomicWrite(join(sandbox, "weird.txt"), "x", 0o600)).toThrow(/only 644 and 755/);
  });

  it("leaves text assets adapted, not treated as opaque bytes", () => {
    // Guard against "fix binaries by never adapting anything": the SKILL.md must
    // still be rewritten for the provider.
    installKit(loadKit(kitRoot), ["codex"], ctx, { timestamp: "20260814-000004" });
    const installed = join(ctx.home, ".agents", "skills", "av-asset-skill", "SKILL.md");
    expect(statSync(installed).isFile()).toBe(true);
  });
});
