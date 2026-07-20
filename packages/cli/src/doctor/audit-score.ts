// Informational health score for `vcskill doctor`. Pure: turns the weighted
// severity of findings into a 0–100 number for the health bar. Deliberately
// does NOT influence the exit code — that stays keyed to fail-count in
// diagnose.deriveStatus, so a low score can never mask/flip the CI contract.

import type { ProviderFinding } from "./diagnose.js";

export interface AuditScore {
  score: number;
  deductions: number;
}

export function scoreAudit(findings: ProviderFinding[]): AuditScore {
  const deductions = findings.reduce((sum, f) => sum + (f.weight ?? 0), 0);
  const score = Math.max(0, Math.min(100, 100 - deductions));
  return { score, deductions };
}
