// `av eval` — cost-tiered skill-quality gate. Tier-1 (static, $0) reuses
// runValidate and always runs. Tier-3 (LLM judge) runs only when an eval command
// is configured; the judge runner is injected so unit tests never spawn.

import { spawnSync } from "node:child_process";
import { jsonEnvelope } from "./json-envelope.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runValidate } from "./validate-command.js";
import type { CommandSurface } from "../kit/av-invocation-lint.js";
import { loadKit } from "../kit/load-kit.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { matchesSkillFilter } from "../kit/skill-filter.js";
import { extractJudgeJson, overall, flagged } from "../eval/parse-judge.js";
import { coral, teal, amber, faint, symbols, type StyleOpts } from "../ui/style.js";

export interface EvalDeps {
  /** Run the configured judge over one prompt, returning its raw reply. */
  runJudge(prompt: string): string;
}

export interface EvalOpts {
  /** The configured judge command (ARIADNEV_EVAL_CMD). Absent → tier-3 skipped. */
  evalCmd?: string;
  /** Restrict both tiers to one skill (bare or av:-prefixed). */
  skill?: string;
  kitRoot?: string;
  color?: boolean;
  /** Injected judge runner; required to actually run tier-3. */
  deps?: EvalDeps;
  json?: boolean;
  /** Live command tree for the av-invocation check, threaded to runValidate.
   *  See ValidateOpts.surface for why it is passed rather than built. */
  surface?: CommandSurface;
}

export interface EvalResult {
  ok: boolean;
  summary: string;
}

const MAX_CONTENT = 3000;

export function buildJudgePrompt(name: string, content: string): string {
  const body = content.length > MAX_CONTENT ? `${content.slice(0, MAX_CONTENT)}\n…(truncated)` : content;
  return [
    `You are grading an agent SKILL.md for the skill "${name}".`,
    "Rate 1-10 on: clarity, specificity (does the description say exactly WHEN to use it), completeness.",
    'Reply with ONLY strict JSON: {"clarity":N,"specificity":N,"completeness":N,"notes":"one line"}',
    "",
    "--- SKILL.md ---",
    body,
  ].join("\n");
}

/** The real judge runner: spawns the configured command, feeding the prompt on
 * stdin. Bounded by a timeout; throws on spawn failure (caller marks unscored). */
export function realEvalDeps(evalCmd: string): EvalDeps {
  return {
    runJudge(prompt: string): string {
      const [cmd, ...args] = evalCmd.split(/\s+/).filter(Boolean);
      const res = spawnSync(cmd, args, { input: prompt, encoding: "utf8", timeout: 60000 });
      if (res.error) throw res.error;
      return res.stdout ?? "";
    },
  };
}

export const EVAL_SCHEMA_VERSION = 1;

/** One skill's tier-3 outcome. `scores` is absent when the judge could not be read. */
export interface JudgedSkill {
  skill: string;
  status: "scored" | "unscored";
  reason?: string;
  overall?: number;
  scores?: { clarity: number; specificity: number; completeness: number };
}

export function runEval(opts: EvalOpts): EvalResult {
  const style: StyleOpts = { color: !!opts.color };
  const filter = opts.skill ? [opts.skill] : undefined;

  // Tier 1 — static, always.
  const v = runValidate({ kitRoot: opts.kitRoot, skillFilter: filter, surface: opts.surface });
  const lines = [v.summary];
  const judged: JudgedSkill[] = [];
  let ok = v.ok;

  // The machine form is built from the same values the lines are, so the two
  // cannot disagree about a score or about whether the run passed.
  const envelope = (): string =>
    jsonEnvelope(EVAL_SCHEMA_VERSION, "eval.score", {
      ok,
      tier1: { ok: v.ok, counts: v.counts, findings: v.findings },
      tier3: opts.evalCmd && opts.deps ? { ran: true, skills: judged } : { ran: false },
    });

  // Tier 3 — opt-in LLM judge.
  if (!opts.evalCmd || !opts.deps) {
    lines.push(faint("  tier-3 skipped — set ARIADNEV_EVAL_CMD to enable the LLM judge", style));
    return { ok, summary: opts.json ? envelope() : lines.join("\n") };
  }

  const root = opts.kitRoot ?? getKitRoot(dirname(fileURLToPath(import.meta.url)));
  const kit = loadKit(root);
  const skills = filter ? kit.skills.filter((s) => matchesSkillFilter(s.name, filter)) : kit.skills;
  lines.push("", `${coral("tier-3", style)} — LLM judge`);

  for (const s of skills) {
    let raw: string;
    try {
      raw = opts.deps.runJudge(buildJudgePrompt(s.name, s.body));
    } catch {
      lines.push(`  ${amber(symbols.warn, style)} ${s.name}: judge error (unscored)`);
      judged.push({ skill: s.name, status: "unscored", reason: "judge error" });
      continue;
    }
    const parsed = extractJudgeJson(raw);
    if (!parsed.ok) {
      lines.push(`  ${amber(symbols.warn, style)} ${s.name}: unscored (unparseable judge reply)`);
      judged.push({ skill: s.name, status: "unscored", reason: "unparseable judge reply" });
      continue;
    }
    const o = overall(parsed.scores);
    const bad = flagged(o);
    if (bad) ok = false;
    judged.push({ skill: s.name, status: "scored", overall: o, scores: parsed.scores });
    const glyph = bad ? coral(symbols.fail, style) : teal(symbols.ok, style);
    lines.push(
      `  ${glyph} ${s.name}: ${o}/10  (clarity ${parsed.scores.clarity}, specificity ${parsed.scores.specificity}, completeness ${parsed.scores.completeness})`,
    );
  }
  return { ok, summary: opts.json ? envelope() : lines.join("\n") };
}
