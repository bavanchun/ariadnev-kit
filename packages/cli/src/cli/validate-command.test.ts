import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pendingPortNames, runValidate } from "./validate-command.js";
import { loadAvInvocationAllowlist, MAX_INVOCATION_ALLOWLIST_ENTRIES } from "./validate-invocations.js";
import { commandSurface } from "./command-surface.js";
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

/** Descriptions that share no vocabulary. Two fixtures whose descriptions differ
 *  only by the skill name score 75% on the routing-collision check and fail the
 *  run for a reason that has nothing to do with links. */
const FIXTURE_DESCRIPTIONS: Record<string, string> = {
  bar: "Use when emitting an outbound cross-skill path from a body under test.",
  baz: "Invoke as the destination holding one document that others are pointed at.",
};

/** A second fixture skill, so cross-skill links have somewhere to point. */
function writeSkillNamed(
  kitRoot: string,
  name: string,
  body: string,
  refs: Record<string, string> = {},
): void {
  const dir = join(kitRoot, "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---
name: av:${name}
description: ${FIXTURE_DESCRIPTIONS[name] ?? `Use this ${name} fixture skill in validate tests.`}
---

# ${name}

${body}

## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`,
  );
  if (Object.keys(refs).length > 0) {
    mkdirSync(join(dir, "references"), { recursive: true });
    for (const [refName, content] of Object.entries(refs)) {
      writeFileSync(join(dir, "references", refName), content);
    }
  }
}

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

// Same fixture, but carrying the `ported` origin every upstream-copied skill
// declares. That flag is what downgrades an orphan to a warning, so it is the
// only shape in which `--strict` has anything to promote.
const PORTED_FRONTMATTER = `---
name: av:foo
description: Use this fixture skill to exercise the validate command reference check.
metadata:
  origin: ported
  author: upstream
---

# Foo

## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`;

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

  it("reports no held findings after the authoring bar is fully enforced", () => {
    const result = runValidate({ kitRoot: resolveKitRoot(process.cwd()) });
    expect(result.heldFindings).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.summary).toContain(`${result.warnings.length} warning(s)`);
  });

  it("returns no held findings for a clean fixture", () => {
    writeSkill(tmp, `${GOOD_FRONTMATTER}\nNo links here.\n`);
    const result = runValidate({ kitRoot: tmp });
    expect(result.heldFindings).toEqual([]);
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

  // The map-scope trap. `skillsToCheck` is filtered by --skill, and
  // `av eval --skill <name>` passes that filter, so a skill index built inside
  // the loop would hold exactly one entry and report every cross-skill link as
  // unknown-skill. Both cases below must behave identically.
  it("resolves a cross-skill link under a --skill filter", () => {
    writeSkillNamed(tmp, "bar", "See `../av-baz/references/thing.md`.\n");
    writeSkillNamed(tmp, "baz", "See references/thing.md.\n", { "thing.md": "# Thing\n" });

    const unfiltered = runValidate({ kitRoot: tmp });
    const filtered = runValidate({ kitRoot: tmp, skillFilter: ["bar"] });

    for (const result of [unfiltered, filtered]) {
      expect(result.findings.filter((f) => f.kind === "cross-dangling")).toEqual([]);
    }
    expect(filtered.findings.some((f) => f.skill === "bar" && f.kind === "cross-shape")).toBe(false);
  });

  it("fails an unprefixed cross-skill link even though the target exists in the kit", () => {
    // Existence in the kit calls this fine, and it is not: installed directories
    // carry the av- prefix, so this path resolves in the checkout the author is
    // looking at and nowhere the reader will ever be. That gap is the whole
    // reason shape is a rule separate from existence.
    writeSkillNamed(tmp, "bar", "See `../baz/references/thing.md`.\n");
    writeSkillNamed(tmp, "baz", "See references/thing.md.\n", { "thing.md": "# Thing\n" });

    const result = runValidate({ kitRoot: tmp });
    expect(result.findings).toContainEqual(
      expect.objectContaining({ skill: "bar", kind: "cross-shape", level: "error" }),
    );
    expect(result.ok).toBe(false);
  });

  it("fails on a cross-skill link to a file that does not exist", () => {
    writeSkillNamed(tmp, "bar", "See `../av-baz/references/ghost.md`.\n");
    writeSkillNamed(tmp, "baz", "See references/thing.md.\n", { "thing.md": "# Thing\n" });

    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ skill: "bar", kind: "cross-dangling" }),
    );
  });

  it("catches a cross-skill link written only inside a reference file", () => {
    writeSkillNamed(tmp, "bar", "See references/local.md.\n", {
      "local.md": "See `../../av-baz/references/ghost.md`.\n",
    });
    writeSkillNamed(tmp, "baz", "See references/thing.md.\n", { "thing.md": "# Thing\n" });

    const result = runValidate({ kitRoot: tmp });
    expect(result.findings).toContainEqual(
      expect.objectContaining({ skill: "bar", kind: "cross-dangling" }),
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

describe("runValidate --strict", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ariadnev-validate-strict-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("reports a ported skill's orphan as an error by default", () => {
    writeSkill(tmp, `${PORTED_FRONTMATTER}\nNo links here.\n`, { "orphan.md": "# Orphan\n" });
    const result = runValidate({ kitRoot: tmp });
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ skill: "foo", kind: "orphan", level: "error" }),
    );
  });

  it("promotes that orphan to an error and fails", () => {
    writeSkill(tmp, `${PORTED_FRONTMATTER}\nNo links here.\n`, { "orphan.md": "# Orphan\n" });
    const result = runValidate({ kitRoot: tmp, strict: true });
    expect(result.ok).toBe(false);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ skill: "foo", kind: "orphan", level: "error" }),
    );
  });

  it("still passes a clean tree", () => {
    writeSkill(tmp, `${PORTED_FRONTMATTER}\nSee references/used.md.\n`, { "used.md": "# Used\n" });
    const result = runValidate({ kitRoot: tmp, strict: true });
    expect(result.ok).toBe(true);
  });

  it("promotes reference findings only, leaving other warning kinds alone", () => {
    // Deliberate scope: promoting every warning would be free today (all 89 are
    // orphans) and would block the next port of a long upstream skill later.
    writeSkill(tmp, `${PORTED_FRONTMATTER}\nSee references/used.md.\n`, { "used.md": "# Used\n" });
    writeInvalidWorkflow(tmp);
    const lenient = runValidate({ kitRoot: tmp });
    const strict = runValidate({ kitRoot: tmp, strict: true });
    const levelsOf = (r: ReturnType<typeof runValidate>) =>
      r.findings.filter((f) => f.kind !== "orphan" && f.kind !== "dangling").map((f) => `${f.kind}:${f.level ?? "error"}`);
    expect(levelsOf(strict)).toEqual(levelsOf(lenient));
  });
});

describe("kit-wide reference integrity", () => {
  // The belt to --strict's braces: this fails in `pnpm test`, before CI is
  // reached. It reads kit/skills at runtime, so a skill added later is covered
  // without touching this file.
  it("ships no orphan or dangling reference in any skill", () => {
    const result = runValidate({ kitRoot: resolveKitRoot(process.cwd()), strict: true, surface: commandSurface() });
    const referenceFindings = result.findings.filter(
      (f) => f.kind === "orphan" || f.kind === "dangling",
    );
    expect(
      referenceFindings.map((f) => `${f.skill}: ${f.message}`),
      "link the file where the body needs it, index it under ## References with a purpose line, or delete it",
    ).toEqual([]);
  });
});

describe("pending-port allowances", () => {
  const kitRoot = resolveKitRoot(process.cwd());

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

/**
 * The av-invocation gate. The 105 skills arrived from the upstream kit with a
 * bare binary rename, and three human passes found prose (and one script) citing
 * commands this CLI never registered. The fixtures below seed exactly the
 * phantoms those passes found.
 */
describe("av-invocation findings", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ariadnev-invocation-"));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function seed(
    body: string,
    extras: { refs?: Record<string, string>; scripts?: Record<string, string>; exempt?: boolean } = {},
  ): void {
    const dir = join(tmp, "skills", "foo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), GOOD_FRONTMATTER.replace("# Foo\n", `# Foo\n\n${body}\n`));
    for (const [name, content] of Object.entries(extras.refs ?? {})) {
      mkdirSync(join(dir, "references"), { recursive: true });
      writeFileSync(join(dir, "references", name), content);
    }
    for (const [name, content] of Object.entries(extras.scripts ?? {})) {
      mkdirSync(join(dir, "scripts"), { recursive: true });
      writeFileSync(join(dir, "scripts", name), content);
    }
    // The invocation allowlist is the list that actually holds invocation
    // hits — the two lists shrink for unrelated reasons, see ADR 0013.
    if (extras.exempt) {
      writeFileSync(
        join(tmp, "av-invocation-allowlist.json"),
        JSON.stringify([{ skill: "foo", reason: "Fixture holding the seeded phantom for the exempt-stays-warn test." }]),
      );
    }
  }

  const invocations = (strict = false) =>
    runValidate({ kitRoot: tmp, strict, surface: commandSurface() })
      .findings.filter((f) => f.kind === "av-invocation");

  it("errors on a phantom subcommand in SKILL.md, at the file's own line number", () => {
    seed("Scaffold it with `av plan create`.");
    const found = invocations();
    expect(found).toHaveLength(1);
    expect(found[0].level ?? "error").toBe("error");
    expect(found[0].skill).toBe("foo");
    expect(found[0].message).toContain("foo/SKILL.md:");
    expect(found[0].message).toContain("av plan create");
    // The line has to point into the file, frontmatter included — a body-relative
    // number sends the reader fourteen lines short of the defect.
    const line = Number(/SKILL\.md:(\d+)/.exec(found[0].message)![1]);
    expect(readFileSync(join(tmp, "skills", "foo", "SKILL.md"), "utf8").split("\n")[line - 1]).toContain(
      "av plan create",
    );
  });

  it("warns, not errors, on a phantom flag", () => {
    seed("Link it with `av plan update --linked-pr 42`.");
    expect(invocations()).toMatchObject([{ level: "warn", skill: "foo" }]);
    expect(invocations()[0].message).toContain("--linked-pr");
  });

  it("errors on a phantom the skill's script spawns at runtime", () => {
    seed("Nothing here.", {
      scripts: { "open.cjs": "const child = spawn(akBin(), ['config', 'start', '--port']);\n" },
    });
    expect(invocations()).toMatchObject([
      { level: "error", skill: "foo", message: expect.stringContaining("foo/scripts/open.cjs:1") },
    ]);
  });

  it("reads reference files too", () => {
    seed("See [notes](references/notes.md).", { refs: { "notes.md": "Run `av plan add-phase 2`.\n" } });
    expect(invocations()).toMatchObject([
      { level: "error", message: expect.stringContaining("foo/references/notes.md:1") },
    ]);
  });

  /**
   * Exempt skills degrade to warnings unconditionally — `--strict` does not
   * promote them the way it promotes an orphan. `plans-kanban` documents a
   * dashboard the upstream kit had and this CLI does not; whether that skill should
   * exist at all is a content decision, and blocking every unrelated change
   * until someone makes it is how a gate gets switched off.
   */
  it("holds an exempt skill's findings at warn, even under --strict", () => {
    seed("Start it with `av config start --port 3456`.", { exempt: true });
    expect(invocations()).toMatchObject([{ level: "warn" }]);
    expect(invocations(true)).toMatchObject([{ level: "warn" }]);
    expect(runValidate({ kitRoot: tmp, strict: true }).ok).toBe(true);
  });

  it("says nothing about prose that names a command's absence", () => {
    seed(
      [
        "There is no `av plan create` command.",
        "Do not invent an `av plan create` or",
        "`av plan translate` command; neither exists.",
        "`av plan` stores no `--linked-pr` flag.",
        "`av config start` does not exist.",
      ].join("\n\n"),
    );
    expect(invocations()).toEqual([]);
  });

  it("says nothing about the registered surface", () => {
    seed("Run `av plan use <name>`, then `av plan show --json`, then `av validate --strict`.");
    expect(invocations()).toEqual([]);
  });

  /**
   * The three files that already got this right are the ones a careless matcher
   * punishes hardest: each spells out, in backticks, a command that does not
   * exist. A finding here means the negation rules regressed.
   */
  it("leaves the kit's own correct denials alone", () => {
    const clean = ["plan-i18n/SKILL.md", "plan/SKILL.md", "cook/references/plan-state-files-first.md"];
    const found = runValidate({ kitRoot: resolveKitRoot(process.cwd()), surface: commandSurface() })
      .findings.filter((f) => f.kind === "av-invocation")
      .map((f) => f.message);
    for (const file of clean) expect(found.filter((m) => m.startsWith(file))).toEqual([]);
  });

  it("keeps the real kit clean under --strict", () => {
    const result = runValidate({ kitRoot: resolveKitRoot(process.cwd()), strict: true });
    const errors = result.findings.filter((f) => f.kind === "av-invocation" && (f.level ?? "error") === "error");
    expect(errors, "a new phantom invocation landed in a skill that is not exempt").toEqual([]);
  });
});

describe("av-invocation allowlist ratchet", () => {
  const kitRoot = resolveKitRoot(process.cwd());

  /**
   * The shrink-only rule on `kit/av-invocation-allowlist.json`. `plans-kanban`
   * and one file in `coding-level` are the two entries the list ships with;
   * adding a third quietly turns the quarantine into the old blanket exemption.
   *
   * Lower `MAX_INVOCATION_ALLOWLIST_ENTRIES` when an entry is removed. Do not
   * raise it: a new phantom worth quarantining is worth a review comment naming
   * the outstanding decision first, and if the file grew silently the reviewer
   * has to see this test fail to know it happened.
   */
  it("never lets the allowlist grow past the committed ceiling", () => {
    const entries = loadAvInvocationAllowlist(kitRoot);
    expect(entries.length).toBeLessThanOrEqual(MAX_INVOCATION_ALLOWLIST_ENTRIES);
  });

  it("every entry names an outstanding decision in its reason", () => {
    // A silent silencer defeats the whole point of the list. `loadAvInvocationAllowlist`
    // already drops entries with an empty reason; this test also refuses one
    // whose reason is too short to plausibly say what the decision is.
    const short = loadAvInvocationAllowlist(kitRoot).filter((e) => (e.reason ?? "").trim().length < 40);
    expect(short, "each av-invocation-allowlist entry must name the decision it is waiting on").toEqual([]);
  });

  it("--strict fails when a fixture kit exceeds the ceiling", async () => {
    // A temp kit whose allowlist has one more entry than the ceiling permits.
    const tmp = mkdtempSync(join(tmpdir(), "ariadnev-allowlist-"));
    try {
      const dir = join(tmp, "skills", "foo");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), GOOD_FRONTMATTER.replace("# Foo\n", "# Foo\n\nNothing here.\n"));
      const bloated = Array.from({ length: MAX_INVOCATION_ALLOWLIST_ENTRIES + 1 }, (_, i) => ({
        path: `foo/references/pad-${i}.md`,
        reason: `Padding entry ${i} — outstanding decision this test asserts the strict gate rejects.`,
      }));
      writeFileSync(join(tmp, "av-invocation-allowlist.json"), JSON.stringify(bloated));
      const result = runValidate({ kitRoot: tmp, strict: true, surface: commandSurface() });
      expect(result.ok).toBe(false);
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          kind: "av-invocation",
          skill: "(kit)",
          message: expect.stringContaining("ceiling"),
        }),
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("non-strict does not fail on a bloated allowlist — the ratchet is a strict-only gate", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ariadnev-allowlist-lax-"));
    try {
      const dir = join(tmp, "skills", "foo");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), GOOD_FRONTMATTER.replace("# Foo\n", "# Foo\n\nNothing here.\n"));
      const bloated = Array.from({ length: MAX_INVOCATION_ALLOWLIST_ENTRIES + 1 }, (_, i) => ({
        path: `foo/references/pad-${i}.md`,
        reason: `Padding entry ${i} — outstanding decision the strict gate would reject if enabled.`,
      }));
      writeFileSync(join(tmp, "av-invocation-allowlist.json"), JSON.stringify(bloated));
      const result = runValidate({ kitRoot: tmp, surface: commandSurface() });
      const ratchetHits = result.findings.filter(
        (f) => f.kind === "av-invocation" && f.skill === "(kit)",
      );
      expect(ratchetHits).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
