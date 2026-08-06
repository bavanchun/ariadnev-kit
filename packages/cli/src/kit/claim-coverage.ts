import type { DistillClaim, UpstreamRelation } from "./distill-registry.js";

export type ClaimCoverageKind = "unclassified" | "unmatched" | "invalid-rejection";

export interface ClaimCoverageFinding {
  skill: string;
  claimId: string;
  kind: ClaimCoverageKind;
  message: string;
  score?: number;
}

export interface ClaimCoverageResult {
  skill: string;
  applicable: boolean;
  ok: boolean;
  total: number;
  covered: number;
  rejected: number;
  findings: ClaimCoverageFinding[];
}

export interface ClaimCoverageInput {
  skill: string;
  relation: UpstreamRelation;
  claims?: DistillClaim[];
  content: string;
  threshold?: number;
}

export const DEFAULT_COVERAGE_THRESHOLD = 0.35;

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "if",
  "in", "into", "is", "it", "of", "on", "or", "that", "the", "their",
  "then", "this", "to", "when", "with", "you", "your",
]);

function keywords(value: string): Set<string> {
  const words = value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.filter((word) => word.length > 1 && !STOP_WORDS.has(word)));
}

export function keywordOverlap(claim: string, content: string): number {
  const expected = keywords(claim);
  if (expected.size === 0) return 0;
  const actual = keywords(content);
  let matches = 0;
  for (const word of expected) if (actual.has(word)) matches += 1;
  return matches / expected.size;
}

/** Check classified claims against already-loaded vc skill content. */
export function checkClaimCoverage(input: ClaimCoverageInput): ClaimCoverageResult {
  const claims = input.claims ?? [];
  const applicable = input.relation === "distill" && input.claims !== undefined && claims.length > 0;
  if (!applicable) {
    return { skill: input.skill, applicable: false, ok: true, total: 0, covered: 0, rejected: 0, findings: [] };
  }

  const threshold = input.threshold ?? DEFAULT_COVERAGE_THRESHOLD;
  const findings: ClaimCoverageFinding[] = [];
  let covered = 0;
  let rejected = 0;
  for (const claim of claims) {
    if (claim.status === "unclassified") {
      findings.push({
        skill: input.skill,
        claimId: claim.id,
        kind: "unclassified",
        message: `${claim.id} is not classified`,
      });
      continue;
    }
    if (claim.status === "rejected") {
      if (!claim.why?.trim()) {
        findings.push({
          skill: input.skill,
          claimId: claim.id,
          kind: "invalid-rejection",
          message: `${claim.id} is rejected without a reason`,
        });
      } else {
        rejected += 1;
      }
      continue;
    }

    const score = keywordOverlap(claim.text, input.content);
    if (score < threshold) {
      findings.push({
        skill: input.skill,
        claimId: claim.id,
        kind: "unmatched",
        message: `${claim.id} keyword overlap ${(score * 100).toFixed(0)}% is below ${(threshold * 100).toFixed(0)}%`,
        score,
      });
    } else {
      covered += 1;
    }
  }
  return {
    skill: input.skill,
    applicable: true,
    ok: findings.length === 0,
    total: claims.length,
    covered,
    rejected,
    findings,
  };
}
