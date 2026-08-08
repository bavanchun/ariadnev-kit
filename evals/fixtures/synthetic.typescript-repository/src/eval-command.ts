import { chooseEvaluationTier } from "./eval-router.js";

export function requestedTier(options: { suite?: boolean; judge?: boolean }) {
  return chooseEvaluationTier(options);
}
