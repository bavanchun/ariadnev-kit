// `vc eval` — cost-tiered skill-quality gate. Tier-1 (static, $0) reuses
// runValidate and always runs. Tier-3 (LLM judge) runs only when an eval command
// is configured; the judge runner is injected so unit tests never spawn.

import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runValidate } from "./validate-command.js";
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
  /** The configured judge command (VCSKILL_EVAL_CMD). Absent → tier-3 skipped. */
  evalCmd?: string;
  /** Restrict both tiers to one skill (bare or vc:-prefixed). */
  skill?: string;
  kitRoot?: string;
  color?: boolean;
  /** Injected judge runner; required to actually run tier-3. */
  deps?: EvalDeps;
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

export function runEval(opts: EvalOpts): EvalResult {
  const style: StyleOpts = { color: !!opts.color };
  const filter = opts.skill ? [opts.skill] : undefined;

  // Tier 1 — static, always.
  const v = runValidate({ kitRoot: opts.kitRoot, skillFilter: filter });
  const lines = [v.summary];
  let ok = v.ok;

  // Tier 3 — opt-in LLM judge.
  if (!opts.evalCmd || !opts.deps) {
    lines.push(faint("  tier-3 skipped — set VCSKILL_EVAL_CMD to enable the LLM judge", style));
    return { ok, summary: lines.join("\n") };
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
      continue;
    }
    const parsed = extractJudgeJson(raw);
    if (!parsed.ok) {
      lines.push(`  ${amber(symbols.warn, style)} ${s.name}: unscored (unparseable judge reply)`);
      continue;
    }
    const o = overall(parsed.scores);
    const bad = flagged(o);
    if (bad) ok = false;
    const glyph = bad ? coral(symbols.fail, style) : teal(symbols.ok, style);
    lines.push(
      `  ${glyph} ${s.name}: ${o}/10  (clarity ${parsed.scores.clarity}, specificity ${parsed.scores.specificity}, completeness ${parsed.scores.completeness})`,
    );
  }
  return { ok, summary: lines.join("\n") };
}
