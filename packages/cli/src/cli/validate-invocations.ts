// Feeding kit files to the av-invocation lint. The lint itself is pure; this is
// the fs half, kept out of `validate-command.ts` so that file stays about
// assembling findings.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { lintAvInvocations, type CommandSurface } from "../kit/av-invocation-lint.js";
import { lintScriptAvInvocations } from "../kit/av-invocation-scripts.js";

/** Scripts a skill can ship and a runtime can execute. Anything else in
 *  `scripts/` is data. */
const SCRIPT_FILE = /\.(?:cjs|mjs|js|sh|bash|zsh|py)$/;

export interface InvocationSource {
  /** How the finding names the file, e.g. `cook/references/plan-state.md`. */
  name: string;
  content: string;
  /** Scripts get the call-site rules; prose gets the code-context rules. */
  script?: boolean;
}

export interface InvocationHit {
  source: string;
  line: number;
  severity: "error" | "warning";
  message: string;
}

/**
 * One entry in `kit/av-invocation-allowlist.json`: a phantom invocation that is
 * known, deliberate, and waiting on a decision this lint cannot make.
 *
 * The authoring bar is enforced separately, so this list only quarantines
 * citations whose CLI contract is awaiting a documented decision.
 *
 * `skill` holds every hit in one skill; `path` holds one file and is the
 * narrower form to prefer. Either way `reason` is required and has to say what
 * decision is outstanding — an entry without one is ignored, so nothing is
 * silenced by accident.
 */
export interface AvInvocationAllowlistEntry {
  skill?: string;
  path?: string;
  reason: string;
}

/**
 * Shrink-only ceiling on `kit/av-invocation-allowlist.json`. The two entries it
 * ships are the `plans-kanban` skill and one file inside `coding-level`, both
 * waiting on a content decision this lint cannot make. A third entry means the
 * list is growing, and a growing quarantine turns into the old blanket
 * exemption with extra steps.
 *
 * Lower this when an entry is deleted after its content decision lands. Never
 * raise it: an addition worth making is worth an outstanding decision spelled
 * out in a review comment first. `--strict` fails the gate when the current
 * list exceeds this number.
 */
export const MAX_INVOCATION_ALLOWLIST_ENTRIES = 2;

/** Absent or malformed ⇒ empty, which is the safe direction: the gate goes back
 *  to reporting every phantom as an error. */
export function loadAvInvocationAllowlist(kitRoot: string): AvInvocationAllowlistEntry[] {
  const path = join(kitRoot, "av-invocation-allowlist.json");
  if (!existsSync(path)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is AvInvocationAllowlistEntry => {
      if (typeof entry !== "object" || entry === null) return false;
      const candidate = entry as AvInvocationAllowlistEntry;
      const named = typeof candidate.skill === "string" || typeof candidate.path === "string";
      return named && typeof candidate.reason === "string" && candidate.reason.trim().length > 0;
    });
  } catch {
    return [];
  }
}

/** Does the allowlist hold this hit? `path` is compared exactly against the
 *  source name the lint reports, so an entry cannot widen by accident. */
export function isAllowlisted(
  allowlist: AvInvocationAllowlistEntry[],
  skill: string,
  source: string,
): boolean {
  return allowlist.some((entry) => entry.skill === skill || entry.path === source);
}

export function scanInvocations(sources: InvocationSource[], surface: CommandSurface): InvocationHit[] {
  const hits: InvocationHit[] = [];
  for (const source of sources) {
    const findings = source.script
      ? lintScriptAvInvocations(source.content, surface, source.name)
      : lintAvInvocations(source.content, surface);
    for (const finding of findings) {
      hits.push({ source: source.name, line: finding.line, severity: finding.severity, message: finding.message });
    }
  }
  return hits;
}

export interface SkillScripts {
  sources: InvocationSource[];
  /** Scripts present on disk that could not be read. */
  unreadable: { name: string; reason: string }[];
}

/** Every script under a skill's `scripts/`, recursively — real skills nest
 *  `scripts/lib`, and the installer copies the whole tree. */
export function readSkillScripts(skillDir: string): SkillScripts {
  const root = join(skillDir, "scripts");
  const sources: InvocationSource[] = [];
  const unreadable: SkillScripts["unreadable"] = [];
  const walk = (dir: string, prefix: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const name = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(path, name);
        continue;
      }
      if (!SCRIPT_FILE.test(entry.name)) continue;
      // Reported, not skipped in silence: the installer copies the file either
      // way, so "unreadable" is a fact about the kit rather than a reason to
      // call the skill clean. Every other fs read in `validate` is guarded the
      // same way; an EACCES here used to abort the command from inside one
      // skill's loop iteration.
      try {
        sources.push({ name, content: readFileSync(path, "utf8"), script: true });
      } catch (error) {
        unreadable.push({ name, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  };
  walk(root, "scripts");
  return { sources, unreadable };
}
