import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKit } from "../kit/load-kit.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { checkReferenceIntegrity } from "../kit/reference-integrity.js";
import { isPorted } from "../kit/skill-lint.js";
import { checkMatrixDrift } from "../providers/matrix-drift.js";
import { scoreDescriptions, type CollisionAllowlistEntry } from "../kit/description-collision.js";
import { findUnresolvedSkillReferences } from "../kit/skill-crossrefs.js";
import { buildSkillIndex, checkCrossSkillReferences } from "../kit/cross-skill-references.js";
import { matchesSkillFilter } from "../kit/skill-filter.js";
import { compileGraph, PORTABLE_GRAPH_CAPABILITY_CONTRACT } from "../graph/compile-graph.js";
import { graphRegistryForKit } from "../graph/kit-graph-registry.js";

// `ariadnev validate` — lint the kit source without installing it. Wraps the
// same loadKit lint the installer runs, then adds reference-integrity
// (dangling + orphan) which loadKit does not check. Read-only; CI-able.

/**
 * Names declared in `kit/skills-pending-port.json`. Missing or malformed file =
 * no allowances, which is the safe direction: the check goes back to strict.
 */
export function pendingPortNames(kitRoot: string): string[] {
  try {
    const raw = readFileSync(join(kitRoot, "skills-pending-port.json"), "utf8");
    const parsed = JSON.parse(raw) as { pending?: unknown };
    if (!Array.isArray(parsed.pending)) return [];
    return parsed.pending.filter((name): name is string => typeof name === "string");
  } catch {
    return [];
  }
}

/** The files a sibling skill may legitimately be pointed at: its SKILL.md, its
 *  references, and its scripts. Names only — the cross-skill checker compares
 *  paths, and reading 105 skills' file contents for that would be waste. */
function skillFileNames(skillDir: string): string[] {
  const names = ["SKILL.md"];
  for (const sub of ["references", "scripts"]) {
    const dir = join(skillDir, sub);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile()) names.push(`${sub}/${entry.name}`);
    }
  }
  return names;
}

export interface ValidateFinding {
  skill: string;
  kind:
    | "lint"
    | "dangling"
    | "orphan"
    | "skillref"
    | "cross-dangling"
    | "cross-shape"
    | "missing-skill"
    | "matrix"
    | "collision"
    | "graph";
  message: string;
  /** "warn" findings surface but do not fail validation. Default: "error". */
  level?: "warn" | "error";
}

export interface ValidateResult {
  ok: boolean;
  findings: ValidateFinding[];
  counts: { skills: number; agents: number; hooks: number };
  summary: string;
}

export interface ValidateOpts {
  /** Override kit source root (tests / packaging). Default: resolve from module. */
  kitRoot?: string;
  /** Also check the README provider matrix is in sync (CI gate). */
  check?: boolean;
  /** Override README path (tests). Default: repo README relative to this module. */
  readmePath?: string;
  /** Restrict per-skill checks to these skill names (accepts "scout" or
   * "av:scout"). Used by `av eval --skill`. Undefined = whole kit. */
  skillFilter?: string[];
  /**
   * Promote reference-integrity findings (orphan, dangling) to errors even for
   * ported skills. Deliberately narrow: size and style stay warnings for ported
   * content, so this gate does not block the next port of a long upstream skill.
   */
  strict?: boolean;
}

// `--check` is a CI/dev gate run from the repo root, so resolve README against
// cwd — robust whether this runs from src (tsx/bun), the bundled dist, or the
// binary. Outside a checkout the file is absent and --check reports that.
function defaultReadmePath(): string {
  return join(process.cwd(), "README.md");
}

// Justified-similar pairs live in `<kitRoot>/collision-allowlist.json` — a flat
// array of {a,b,reason}. Absent or malformed ⇒ empty (fail-open: the gate just
// keeps flagging). Entries missing a non-empty reason are ignored so no pair is
// silenced without a rationale.
export function loadCollisionAllowlist(kitRoot: string): CollisionAllowlistEntry[] {
  const path = join(kitRoot, "collision-allowlist.json");
  if (!existsSync(path)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is CollisionAllowlistEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as CollisionAllowlistEntry).a === "string" &&
        typeof (e as CollisionAllowlistEntry).b === "string" &&
        typeof (e as CollisionAllowlistEntry).reason === "string" &&
        (e as CollisionAllowlistEntry).reason.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function renderSummary(findings: ValidateFinding[], counts: ValidateResult["counts"]): string {
  const header = `ariadnev validate — ${counts.skills} skills, ${counts.agents} agents, ${counts.hooks} hooks`;
  if (findings.length === 0) return `${header}\n  all checks passed`;
  const lines = [header];
  for (const f of findings) {
    const tag = (f.level ?? "error") === "warn" ? "warn:" : "";
    lines.push(`  [${tag}${f.kind}] ${f.skill}: ${f.message}`);
  }
  const errors = findings.filter((f) => (f.level ?? "error") === "error").length;
  const warns = findings.length - errors;
  lines.push(`  ${errors} error(s), ${warns} warning(s)`);
  return lines.join("\n");
}

/** Validate the kit source. Returns a structured result + rendered summary. */
export function runValidate(opts: ValidateOpts = {}): ValidateResult {
  const root = opts.kitRoot ?? getKitRoot(dirname(fileURLToPath(import.meta.url)));

  let kit;
  try {
    kit = loadKit(root);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const findings: ValidateFinding[] = [{ skill: "(kit)", kind: "lint", message }];
    const counts = { skills: 0, agents: 0, hooks: 0 };
    return { ok: false, findings, counts, summary: renderSummary(findings, counts) };
  }

  const findings: ValidateFinding[] = [];
  const skillsToCheck = opts.skillFilter
    ? kit.skills.filter((s) => matchesSkillFilter(s.name, opts.skillFilter!))
    : kit.skills;
  for (const requested of opts.skillFilter ?? []) {
    if (!kit.skills.some((skill) => matchesSkillFilter(skill.name, [requested]))) {
      findings.push({ skill: requested, kind: "missing-skill", message: "skill not found in kit" });
    }
  }
  // A skill already ported can reference one whose port lands in a later wave.
  // That is a scheduling fact, not a broken link, and reporting it as an error
  // would make `validate` red for the whole port — which trains everyone to
  // ignore it. A name on neither list is still an error, so a genuine typo or a
  // reference to something that exists nowhere is caught exactly as before.
  const knownSkillNames = [...kit.skills.map((skill) => skill.name), ...pendingPortNames(kit.root)];
  const pendingNames = pendingPortNames(kit.root);

  // Built from every skill, in its own pass, deliberately. `skillsToCheck` is
  // filtered by --skill (and `av eval --skill <name>` passes that filter), so an
  // index built inside the loop below would hold one entry and report every
  // cross-skill link as unknown-skill. The index is kit-wide; the findings are
  // filtered.
  const skillIndex = buildSkillIndex(
    kit.skills.map((skill) => ({ name: skill.name, files: skillFileNames(dirname(skill.sourcePath)) })),
  );

  for (const skill of skillsToCheck) {
    const refsDir = join(dirname(skill.sourcePath), "references");
    const referenceFiles = existsSync(refsDir)
      ? readdirSync(refsDir)
          .filter((f) => f.endsWith(".md"))
          .map((file) => ({
            name: `references/${file}`,
            content: readFileSync(join(refsDir, file), "utf8"),
          }))
      : [];
    const names = referenceFiles.map((file) => file.name);
    const { dangling, orphans } = checkReferenceIntegrity(skill.body, names);
    for (const d of dangling) {
      findings.push({ skill: skill.name, kind: "dangling", message: `links ${d} but it does not exist` });
    }
    for (const o of orphans) {
      // A pointer to a file that does not exist stays an error for everyone: the
      // model follows it and gets nothing. A file nobody points at is different
      // — in ported content it is upstream's editorial choice, and 22 of them
      // arrived in the first wave. Reporting the fact is useful; failing the
      // build over content we chose to copy verbatim is not. Once the inherited
      // backlog is cleared, --strict removes that grace so a new one cannot land.
      findings.push({
        skill: skill.name,
        kind: "orphan",
        level: isPorted(skill) && !opts.strict ? "warn" : "error",
        message: `${o} exists but is never linked from SKILL.md`,
      });
    }
    const unresolved = findUnresolvedSkillReferences(
      [
        { source: skill.sourcePath, content: skill.body },
        ...referenceFiles.map((file) => ({
          source: join(dirname(skill.sourcePath), file.name),
          content: file.content,
        })),
      ],
      knownSkillNames,
    );
    for (const ref of unresolved) {
      findings.push({
        skill: skill.name,
        kind: "skillref",
        message: `${ref.source} references unknown skill ${ref.reference}`,
      });
    }

    for (const cross of checkCrossSkillReferences(
      [
        { source: `${skill.name}/SKILL.md`, content: skill.body },
        ...referenceFiles.map((file) => ({ source: `${skill.name}/${file.name}`, content: file.content })),
      ],
      skillIndex,
      pendingNames,
    )) {
      findings.push({
        skill: skill.name,
        kind: cross.reason === "bad-shape" ? "cross-shape" : "cross-dangling",
        // An unprefixed link resolves today and only breaks once installed dirs
        // carry the prefix, so it warns until that lands. A stale root or a
        // wrong depth is broken right now.
        level: cross.shape === "unprefixed" ? "warn" : "error",
        message: `${cross.source} links ${cross.raw} — ${cross.detail}`,
      });
    }
  }

  const graphRegistry = graphRegistryForKit(kit);
  for (const workflow of kit.workflows) {
    const compiled = compileGraph(workflow.graph, graphRegistry, PORTABLE_GRAPH_CAPABILITY_CONTRACT);
    for (const graphFinding of compiled.findings) {
      const witness = graphFinding.path ? ` [path: ${graphFinding.path.join(" -> ")}]` : "";
      findings.push({
        skill: `workflow:${workflow.name}`,
        kind: "graph",
        level: graphFinding.severity === "error" ? "error" : "warn",
        message: `${graphFinding.id}: ${graphFinding.message}${witness}`,
      });
    }
  }

  // Cross-skill description confusability (routing-collision guard).
  const collisions = scoreDescriptions(
    kit.skills.map((s) => ({ name: s.name, description: String(s.frontmatter.description ?? "") })),
    loadCollisionAllowlist(root),
  );
  for (const c of collisions) {
    findings.push({
      skill: `${c.a} ~ ${c.b}`,
      kind: "collision",
      level: c.level,
      message: `descriptions ${(c.score * 100).toFixed(0)}% similar — routing may be ambiguous`,
    });
  }

  if (opts.check) {
    const readmePath = opts.readmePath ?? defaultReadmePath();
    const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : null;
    if (readme === null) {
      findings.push({ skill: "(matrix)", kind: "matrix", message: `README not found at ${readmePath} — --check needs the source tree` });
    } else {
      const drift = checkMatrixDrift(readme);
      if (!drift.ok) findings.push({ skill: "(matrix)", kind: "matrix", message: drift.message });
    }
  }

  const counts = { skills: kit.skills.length, agents: kit.agents.length, hooks: kit.hooks.length };
  // Warnings surface but don't fail; only error-level findings break the gate.
  const ok = !findings.some((f) => (f.level ?? "error") === "error");
  return { ok, findings, counts, summary: renderSummary(findings, counts) };
}
