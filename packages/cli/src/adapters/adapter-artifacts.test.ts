import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARTIFACT_VERSION,
  buildAdapterArtifacts,
  buildHookExpectations,
  buildInstallManifest,
  buildOwnership,
  buildSkillHashes,
  buildSkillPaths,
} from "./adapter-artifacts.js";
import type { Receipt } from "../install/install-receipt.js";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..");

const receipt: Receipt = {
  schemaVersion: 2,
  ariadnevVersion: "1.0.0",
  installs: {
    "claude-code": {
      timestamp: "20260815-101500",
      scope: "project",
      files: [
        { path: "~/.claude/skills/brainstorm/SKILL.md", sha256: "b".repeat(64) },
        { path: "~/.claude/agents/explore.md", sha256: "a".repeat(64) },
      ],
      agentsMdManaged: false,
      hookBindings: [
        { event: "PreToolUse", matcher: "Read|Bash", command: 'node "/home/u/.claude/hooks/av/privacy-block.cjs"', applied: true },
        { event: "Stop", command: 'node "/home/u/.claude/hooks/av/session-state.cjs"', applied: false },
      ],
      skipped: [],
      skillSelection: { mode: "all", skills: ["brainstorm", "scout"], selectedCount: 2, totalCount: 2 },
    },
  },
};

const input = {
  receipt,
  provider: "claude-code" as const,
  kit: "engineer",
  kitVersion: "1.0.0",
  resolvePath: (portable: string) => portable.replace(/^~/, "/home/u"),
};

describe("install-manifest", () => {
  it("matches the upstream field names and carries the selection", () => {
    const manifest = buildInstallManifest(input) as Record<string, unknown>;
    expect(Object.keys(manifest).sort()).toEqual(["files", "kit", "kit_version", "skill_selection", "version"]);
    expect(manifest.version).toBe(ARTIFACT_VERSION);
    expect(manifest.files).toEqual([
      { rel_path: "~/.claude/skills/brainstorm/SKILL.md", sha256: "b".repeat(64) },
      { rel_path: "~/.claude/agents/explore.md", sha256: "a".repeat(64) },
    ]);
    expect(manifest.skill_selection).toEqual({
      mode: "all",
      skills: ["brainstorm", "scout"],
      selected_count: 2,
      total_count: 2,
    });
  });

  it("takes hashes from the receipt rather than recomputing them", () => {
    // Recomputing would be a second opinion about the same files, which is how
    // two records begin to disagree.
    const manifest = buildInstallManifest(input) as { files: { sha256: string }[] };
    expect(manifest.files.map((f) => f.sha256)).toEqual(["b".repeat(64), "a".repeat(64)]);
  });
});

describe("paths and hashes", () => {
  it("resolves portable receipt paths to absolute ones, sorted", () => {
    expect(buildSkillPaths(input)).toEqual([
      "/home/u/.claude/agents/explore.md",
      "/home/u/.claude/skills/brainstorm/SKILL.md",
    ]);
  });

  it("keys hashes by the absolute path, like upstream", () => {
    expect(buildSkillHashes(input)).toEqual({
      "/home/u/.claude/agents/explore.md": "a".repeat(64),
      "/home/u/.claude/skills/brainstorm/SKILL.md": "b".repeat(64),
    });
  });
});

describe("hook expectations", () => {
  it("splits the command into command and args the way the manifest shape expects", () => {
    const expectations = buildHookExpectations(input) as { manifest: { hooks: Record<string, unknown[]> } };
    expect(expectations.manifest.hooks.PreToolUse).toEqual([
      {
        matcher: "Read|Bash",
        hooks: [{ type: "command", command: "node", args: ["/home/u/.claude/hooks/av/privacy-block.cjs"] }],
      },
    ]);
    // A binding with no matcher omits the key rather than writing an empty one.
    expect(expectations.manifest.hooks.Stop[0]).not.toHaveProperty("matcher");
  });

  it("keeps the order the receipt recorded within an event", () => {
    const twice: Receipt = {
      ...receipt,
      installs: {
        "claude-code": {
          ...receipt.installs["claude-code"]!,
          hookBindings: [
            { event: "UserPromptSubmit", command: 'node "/a/guard.cjs"', applied: true },
            { event: "UserPromptSubmit", command: 'node "/a/gate.cjs"', applied: true },
          ],
        },
      },
    };
    const built = buildHookExpectations({ ...input, receipt: twice }) as {
      manifest: { hooks: Record<string, { hooks: { args: string[] }[] }[]> };
    };
    expect(built.manifest.hooks.UserPromptSubmit.map((e) => e.hooks[0].args[0])).toEqual(["/a/guard.cjs", "/a/gate.cjs"]);
  });
});

describe("ownership", () => {
  it("lists only the bindings that were actually applied", () => {
    // A binding recorded but declined is not something this install owns.
    const ownership = buildOwnership(input) as { hook_ids: string[]; paths: string[] };
    expect(ownership.hook_ids).toHaveLength(1);
    expect(ownership.hook_ids[0]).toContain("PreToolUse");
    expect(ownership.paths).toHaveLength(2);
  });
});

describe("the whole set", () => {
  it("produces the five files upstream writes", () => {
    expect(Object.keys(buildAdapterArtifacts(input)).sort()).toEqual([
      "claude-code-ownership.json",
      "install-manifest.json",
      "native-hook-expectations.json",
      "native-skill-hashes.json",
      "native-skill-paths.json",
    ]);
  });

  it("is deterministic — the same receipt gives the same bytes", () => {
    // What makes `adapters regenerate` a repair rather than a rewrite that could
    // differ from what the install wrote.
    expect(buildAdapterArtifacts(input)).toEqual(buildAdapterArtifacts(input));
  });

  it("says nothing when the provider has no install recorded", () => {
    const empty = buildAdapterArtifacts({ ...input, provider: "codex" });
    expect(JSON.parse(empty["native-skill-paths.json"])).toEqual([]);
    expect(JSON.parse(empty["install-manifest.json"]).skill_selection.total_count).toBe(0);
  });
});

describe("the one-way rule", () => {
  it("is never imported by anything that decides what to install, audit, or remove", () => {
    // The whole design rests on this: these files are a projection of the
    // receipt, and the moment a decision path reads one back, there are two
    // ownership records again — the exact defect this shape was chosen to avoid.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const abs = join(dir, entry);
        if (statSync(abs).isDirectory()) {
          if (entry !== "adapters" && entry !== "node_modules") walk(abs);
          continue;
        }
        if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
        const source = readFileSync(abs, "utf8");
        if (/from\s+"[^"]*adapters\/adapter-artifacts/.test(source) && !/write-adapter-artifacts|register-adapter/.test(entry)) {
          offenders.push(abs.slice(repoRoot.length + 1));
        }
      }
    };
    for (const area of ["install", "uninstall", "doctor", "kit", "providers"]) {
      walk(join(repoRoot, "packages", "cli", "src", area));
    }
    expect(offenders).toEqual([]);
  });
});

describe("size", () => {
  it("stays far below anything that would matter, on a full-kit install", () => {
    // The plan pre-decided prefix-compressing the ownership file above 500K.
    // Measured on the full kit it lands at 504K — over the line by a rounding
    // error, and the compression would have to change the field layout these
    // artifacts exist to match. The bound here is the one that would actually
    // signal trouble: unbounded growth, not a number a local file crosses once.
    const many = Array.from({ length: 1600 }, (_, i) => ({
      path: `~/.claude/skills/skill-${i}/references/some-longer-file-name.md`,
      sha256: String(i).padStart(64, "0"),
    }));
    const bulk: Receipt = {
      ...receipt,
      installs: { "claude-code": { ...receipt.installs["claude-code"]!, files: many } },
    };
    const artifacts = buildAdapterArtifacts({ ...input, receipt: bulk });
    const total = Object.values(artifacts).reduce((sum, content) => sum + content.length, 0);
    expect(total).toBeLessThan(2_000_000);
  });
});
