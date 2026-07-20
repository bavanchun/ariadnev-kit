// Pure parsing/scoring for the `vc eval` tier-3 LLM judge. Kept separate from
// the command so it is fully unit-testable without spawning anything.

export interface JudgeScores {
  clarity: number;
  specificity: number;
  completeness: number;
  notes?: string;
}

export type JudgeResult = { ok: true; scores: JudgeScores } | { ok: false; raw: string };

function score(v: unknown): number | null {
  return typeof v === "number" && v >= 0 && v <= 10 ? v : null;
}

/** Extract the judge's JSON verdict from a possibly-noisy reply. Returns
 * ok:false (never throws) when the reply has no valid {clarity,specificity,
 * completeness} block — the caller records the skill as "unscored". */
export function extractJudgeJson(raw: string): JudgeResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, raw };
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return { ok: false, raw };
  }
  const clarity = score(obj.clarity);
  const specificity = score(obj.specificity);
  const completeness = score(obj.completeness);
  if (clarity === null || specificity === null || completeness === null) return { ok: false, raw };
  return {
    ok: true,
    scores: { clarity, specificity, completeness, notes: typeof obj.notes === "string" ? obj.notes : undefined },
  };
}

export function overall(s: JudgeScores): number {
  return Math.round(((s.clarity + s.specificity + s.completeness) / 3) * 10) / 10;
}

export function flagged(overallScore: number): boolean {
  return overallScore < 6;
}
