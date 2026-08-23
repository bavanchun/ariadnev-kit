import { readdirSync, existsSync, readFileSync } from "node:fs";
import { jsonEnvelope } from "./json-envelope.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadKit, exemptSkillNames } from "../kit/load-kit.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { checkReferenceIntegrity } from "../kit/reference-integrity.js";
import { checkMatrixDrift } from "../providers/matrix-drift.js";
import { scoreDescriptions, type CollisionAllowlistEntry } from "../kit/description-collision.js";
import { findUnresolvedSkillReferences } from "../kit/skill-crossrefs.js";
import { buildSkillIndex, checkCrossSkillReferences } from "../kit/cross-skill-references.js";
import { matchesSkillFilter } from "../kit/skill-filter.js";
import { compileGraph, PORTABLE_GRAPH_CAPABILITY_CONTRACT } from "../graph/compile-graph.js";
import { graphRegistryForKit } from "../graph/kit-graph-registry.js";
import type { CommandSurface } from "../kit/av-invocation-lint.js";
import { readSkillScripts, scanInvocations } from "./validate-invocations.js";

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
 *  paths, and reading 105 skills' file contents for that would be waste.
 *
 *  Recursive, because real skills nest their scripts — `plans-kanban/scripts/lib`,
 *  `design/scripts/logo`, `watzup/scripts/lib`. A flat listing here would make
 *  the checker report a link to a file that is sitting right there. */
function skillFileNames(skillDir: string): string[] {
  const names = ["SKILL.md"];
  const walk = (dir: string, prefix: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else names.push(rel);
    }
  };
  for (const sub of ["references", "scripts"]) walk(join(skillDir, sub), sub);
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
    | "graph"
    | "av-invocation";
  message: string;
  /** "warn" findings surface but do not fail validation. Default: "error". */
  level?: "warn" | "error";
}

export const VALIDATE_SCHEMA_VERSION = 1;

export interface ValidateResult {
  ok: boolean;
  findings: ValidateFinding[];
  counts: { skills: number; agents: number; hooks: number };
  /**
   * Lint findings `kit/skills-lint-exempt.json` held back from erroring. Until
   * ADR 0013 these went onto `Kit.warnings` and no command read them, so
   * "downgraded to a warning" meant "discarded" — and the exemption's whole
   * defence is that the cost stays in view. Carried in full for programmatic
   * consumers; the summary prints only the count.
   */
  heldFindings: string[];
  /**
   * Lint findings that hold for every skill regardless of the exemption list
   * (today: the duplicate-heading heuristic). Kept apart from `heldFindings`
   * because these are not a backlog and clearing the exemption list will not
   * reduce them.
   */
  warnings: string[];
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
    * Promote the reference-orphan finding to an error even for a skill on
    * `kit/skills-lint-exempt.json`. Deliberately narrow: size and style stay
    * held for listed skills, so this gate does not block work on a long ported
    * skill. (Dangling was always an error and is unaffected.)
    */
  strict?: boolean;
  /** Emit the machine envelope instead of the text report. */
  json?: boolean;
  /**
   * The live command tree, for the av-invocation check.
   *
   * Passed in rather than built here on purpose. `cli/command-surface.ts` reads
   * the tree by calling the `register*` functions, and `register-quality-commands`
   * imports this module — building it here closed
   * command-surface → register-quality-commands → validate-command → command-surface.
   * ESM tolerates that cycle; a bundler reordering the modules need not, and the
   * failure would be a `buildProgram` that is undefined at import time. The
   * registration layer owns both halves, so it supplies the surface. Omitted
   * means the check does not run — for a unit test asking about something else.
   */
  surface?: CommandSurface;
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

function renderSummary(
  findings: ValidateFinding[],
  counts: ValidateResult["counts"],
  heldFindings: string[] = [],
  warnings: string[] = [],
): string {
  const header = `ariadnev validate — ${counts.skills} skills, ${counts.agents} agents, ${counts.hooks} hooks`;
  // Counts, not the hundreds of lines behind them — the text is on the result
  // object. Two separate numbers because they mean different things: the held
  // count is the exemption backlog and is meant to reach zero, the warning count
  // holds for every skill and never will. One combined number was worse than no
  // number: it overstated the backlog and could not have reached zero.
  const extra: string[] = [];
  if (heldFindings.length > 0) {
    extra.push(`  ${heldFindings.length} finding(s) held by kit/skills-lint-exempt.json`);
  }
  if (warnings.length > 0) extra.push(`  ${warnings.length} warning(s)`);
  if (findings.length === 0) return [header, "  all checks passed", ...extra].join("\n");
  const lines = [header];
  for (const f of findings) {
    const tag = (f.level ?? "error") === "warn" ? "warn:" : "";
    lines.push(`  [${tag}${f.kind}] ${f.skill}: ${f.message}`);
  }
  const errors = findings.filter((f) => (f.level ?? "error") === "error").length;
  const warns = findings.length - errors;
  lines.push(`  ${errors} error(s), ${warns} warning(s)`);
  lines.push(...extra);
  return lines.join("\n");
}

/** Validate the kit source. Returns a structured result + rendered summary. */
/**
 * The machine form carries `heldFindings` in full, where the text report prints
 * only the count. The exemption list's whole defence is that its cost stays
 * countable, and a consumer that can only see the number cannot help shrink it.
 */
function envelopeFor(
  ok: boolean,
  findings: ValidateFinding[],
  counts: ValidateResult["counts"],
  heldFindings: string[],
  warnings: string[],
): string {
  return jsonEnvelope(VALIDATE_SCHEMA_VERSION, "validate.kit", { ok, counts, findings, heldFindings, warnings });
}

export function runValidate(opts: ValidateOpts = {}): ValidateResult {
  const root = opts.kitRoot ?? getKitRoot(dirname(fileURLToPath(import.meta.url)));

  let kit;
  try {
    kit = loadKit(root);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const findings: ValidateFinding[] = [{ skill: "(kit)", kind: "lint", message }];
    const counts = { skills: 0, agents: 0, hooks: 0 };
    return {
      ok: false,
      findings,
      counts,
      heldFindings: [],
      warnings: [],
      summary: opts.json
        ? envelopeFor(false, findings, counts, [], [])
        : renderSummary(findings, counts),
    };
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
  const pendingNames = pendingPortNames(kit.root);
  const exemptNames = exemptSkillNames(kit.root);
  const knownSkillNames = [...kit.skills.map((skill) => skill.name), ...pendingNames];

  // Built from every skill, in its own pass, deliberately. `skillsToCheck` is
  // filtered by --skill (and `av eval --skill <name>` passes that filter), so an
  // index built inside the loop below would hold one entry and report every
  // cross-skill link as unknown-skill. The index is kit-wide; the findings are
  // filtered.
  const skillIndex = buildSkillIndex(
    kit.skills.map((skill) => ({ name: skill.name, files: skillFileNames(dirname(skill.sourcePath)) })),
  );

  const surface = opts.surface;

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
        level: exemptNames.has(skill.name) && !opts.strict ? "warn" : "error",
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
        // Installed skill dirs carry the `av-` prefix now, so an unprefixed
        // link is broken on disk exactly like a stale root or a wrong depth.
        // It warned while the two halves were shipping apart; that staging is
        // over and a warning would just be a broken link nobody reads.
        level: "error",
        message: `${cross.source} links ${cross.raw} — ${cross.detail}`,
      });
    }

    for (const hit of surface === undefined ? [] : scanInvocations(
      [
        { name: `${skill.name}/SKILL.md`, content: skill.raw },
        ...referenceFiles.map((file) => ({ name: `${skill.name}/${file.name}`, content: file.content })),
        ...readSkillScripts(dirname(skill.sourcePath)).map((script) => ({
          ...script,
          name: `${skill.name}/${script.name}`,
        })),
      ],
      surface,
    )) {
      findings.push({
        skill: skill.name,
        kind: "av-invocation",
        // An exempt skill degrades to a warning the way its lint findings do —
        // unconditionally, not only when --strict is off. `plans-kanban` cites a
        // dashboard the upstream kit had and this CLI does not; whether that skill
        // should exist at all is a content decision, and --strict promoting the
        // finding would block every unrelated change until someone made it.
        level: hit.severity === "warning" || exemptNames.has(skill.name) ? "warn" : "error",
        message: `${hit.source}:${hit.line} ${hit.message}`,
      });
    }
  }

  // Agents cite the CLI too, and nothing exempts them — there is no ported-agent
  // backlog to hold. Skipped under --skill, which asks about one skill.
  if (opts.skillFilter === undefined && surface !== undefined) {
    for (const agent of kit.agents) {
      for (const hit of scanInvocations([{ name: `agents/${agent.name}.md`, content: agent.raw }], surface)) {
        findings.push({
          skill: `agent:${agent.name}`,
          kind: "av-invocation",
          level: hit.severity === "warning" ? "warn" : "error",
          message: `${hit.source}:${hit.line} ${hit.message}`,
        });
      }
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
  // Copied, not aliased: `ValidateResult` is handed to callers and must not be
  // a live window onto the Kit's arrays.
  const heldFindings = [...kit.held];
  const warnings = [...kit.warnings];
  return {
    ok,
    findings,
    counts,
    heldFindings,
    warnings,
    summary: opts.json
      ? envelopeFor(ok, findings, counts, heldFindings, warnings)
      : renderSummary(findings, counts, heldFindings, warnings),
  };
}
