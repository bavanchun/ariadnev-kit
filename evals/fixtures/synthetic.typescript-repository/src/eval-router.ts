export type EvaluationTier = "static" | "behavioral" | "judge";

export function chooseEvaluationTier(options: { suite?: boolean; judge?: boolean }): EvaluationTier {
  if (options.judge) return "judge";
  if (options.suite) return "behavioral";
  return "static";
}
