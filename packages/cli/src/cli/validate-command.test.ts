import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pendingPortNames, runValidate } from "./validate-command.js";
import { resolveKitRoot } from "../kit/load-kit.js";

const GOOD_FRONTMATTER = `---
name: av:foo
description: Use this fixture skill to exercise the validate command reference check.
---

# Foo

## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`;

function writeSkill(kitRoot: string, body: string, refs: Record<string, string> = {}): void {
  const dir = join(kitRoot, "skills", "foo");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), body);
  const names = Object.keys(refs);
  if (names.length > 0) {
    mkdirSync(join(dir, "references"), { recursive: true });
    for (const [name, content] of Object.entries(refs)) {
      writeFileSync(join(dir, "references", name), content);
    }
  }
}

function writeInvalidWorkflow(kitRoot: string): void {
  const workflows = join(kitRoot, "workflows");
  const schemaDir = join(workflows, "schema");
  mkdirSync(schemaDir, { recursive: true });
  const realSchema = join(resolveKitRoot(process.cwd()), "workflows", "schema", "workflow.schema.json");
  writeFileSync(join(schemaDir, "workflow.schema.json"), readFileSync(realSchema, "utf8"));
  const node = (id: string, type: "function" | "terminal", ref: string) => ({
    id,
    type,
    handler: { kind: type, ref },
    state: { reads: [], writes: [] },
    authority: { capabilities: [], effect: "none", approval: "none", idempotency: "none" },
    proof: { requires: [], produces: [] },
    timeoutMs: 1000,
    retry: { maxAttempts: 1, backoffMs: 0, on: [] },
    redaction: { input: "internal", output: "internal", logs: "metadata-only" },
  });
  writeFileSync(join(workflows, "invalid-recovery.json"), JSON.stringify({
    schemaVersion: 1,
    id: "invalid-recovery",
    title: "Invalid recovery fixture",
    description: "A valid graph document with a compiler-level recovery defect.",
    versions: { graph: "1.0.0", skills: "1.0.0", policy: "1.0.0", evaluator: "behavioral-v1" },
    entry: "start",
    state: { fields: [] },
    nodes: [node("start", "function", "normalize-request"), node("complete", "terminal", "success")],
    edges: [{ id: "start-ok", from: "start", to: "complete", type: "success" }],
  }));
}

describe("runValidate", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ariadnev-validate-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("passes clean on the real kit", () => {
    const result = runValidate({ kitRoot: resolveKitRoot(process.cwd()) });
    if (!result.ok) throw new Error(`real kit not clean:\n${result.summary}`);
    expect(result.ok).toBe(true);
    expect(result.counts.skills).toBeGreaterThan(0);
  });

  it("flags an orphan reference (exists but unlinked)", () => {
    writeSkill(tmp, `${GOOD_FRONTMATTER}\nNo links here.\n`, { "orphan.md": "# Orphan\n" });
    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ skill: "foo", kind: "orphan" }),
    );
  });

  it("passes when the reference is linked", () => {
    writeSkill(tmp, `${GOOD_FRONTMATTER}\nSee references/used.md.\n`, { "used.md": "# Used\n" });
    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(true);
  });

  it("flags a dangling reference (linked but missing)", () => {
    writeSkill(tmp, `${GOOD_FRONTMATTER}\nSee references/gone.md.\n`);
    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ skill: "foo", kind: "dangling" }),
    );
  });

  it("flags an unresolved av skill reference under kind skillref", () => {
    writeSkill(tmp, `${GOOD_FRONTMATTER}\nUse av:missing.\n`);
    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ skill: "foo", kind: "skillref", message: expect.stringContaining("av:missing") }),
    );
  });

  it("checks av skill references inside linked reference files", () => {
    writeSkill(tmp, `${GOOD_FRONTMATTER}\nSee references/used.md.\n`, {
      "used.md": "# Used\n\nContinue with av:missing.\n",
    });
    const result = runValidate({ kitRoot: tmp });
    expect(result.findings).toContainEqual(
      expect.objectContaining({ kind: "skillref", message: expect.stringContaining("references/used.md") }),
    );
  });

  it("reports a lint error as a single (kit) finding and fails", () => {
    // name mismatch → loadKit throws KitValidationError
    writeSkill(tmp, `---\nname: av:wrong\ndescription: A fixture whose name does not match its directory slug value.\n---\n\n# Foo\n`);
    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(false);
    expect(result.findings[0].kind).toBe("lint");
  });

  it("includes stable graph compiler findings in aggregate validation", () => {
    writeSkill(tmp, GOOD_FRONTMATTER);
    writeInvalidWorkflow(tmp);
    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({
      skill: "workflow:invalid-recovery",
      kind: "graph",
      message: expect.stringContaining("graph.recovery.failure-edge-missing"),
    }));
  });

});

describe("pending-port allowances", () => {
  const kitRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..", "kit");

  it("never lists a skill that has already been ported", () => {
    // The list exists to cover a port in progress. A name that stayed on it
    // after its skill landed would silently keep a real broken reference
    // invisible, so the list has to shrink as the port lands.
    const pending = pendingPortNames(kitRoot);
    const shipped = new Set(
      readdirSync(join(kitRoot, "skills"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    );
    const stale = pending.filter((name) => shipped.has(name));
    expect(stale, "remove these from kit/skills-pending-port.json").toEqual([]);
  });

  it("falls back to strict checking when the file is absent or broken", () => {
    expect(pendingPortNames(join(kitRoot, "does-not-exist"))).toEqual([]);
  });
});
