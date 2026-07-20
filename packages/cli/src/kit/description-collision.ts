// Cross-skill description confusability check. As the kit grows, two skills with
// near-identical `description`s make the model's routing ambiguous. This scores
// every pair by Jaccard token-set similarity and bands the result: a near-
// duplicate is an error (fails validate), a merely-similar pair is a warning.
//
// Thresholds are calibrated so the CURRENT kit produces zero errors — see the
// calibration test. If a real new skill trips the error band, differentiate its
// description rather than loosening the threshold.

// Similarity ≥ ERROR ⇒ near-duplicate (fails). ≥ WARN ⇒ advisory only.
export const ERROR_THRESHOLD = 0.6;
export const WARN_THRESHOLD = 0.4;

// Words that carry no routing signal: filler + the trigger verbs every
// description shares ("use this skill when …") would otherwise inflate overlap.
const STOPWORDS = new Set([
  "a", "an", "the", "to", "of", "and", "or", "for", "in", "on", "with", "when",
  "this", "that", "it", "its", "your", "you", "into", "from", "by", "is", "are",
  "be", "as", "at", "then", "so", "if", "not", "no", "any", "all", "via",
  "use", "using", "used", "invoke", "run", "running", "activate", "trigger",
  "skill", "skills",
]);

export function tokenize(description: string): Set<string> {
  const out = new Set<string>();
  for (const raw of description.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length > 1 && !STOPWORDS.has(raw)) out.add(raw);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface CollisionSkill {
  name: string;
  description: string;
}

export interface CollisionPair {
  a: string;
  b: string;
  score: number;
  level: "error" | "warn";
}

/** Score every skill-description pair; return only pairs in the warn/error band. */
export function scoreDescriptions(skills: CollisionSkill[]): CollisionPair[] {
  const toks = skills.map((s) => ({ name: s.name, set: tokenize(s.description) }));
  const pairs: CollisionPair[] = [];
  for (let i = 0; i < toks.length; i++) {
    for (let j = i + 1; j < toks.length; j++) {
      const score = jaccard(toks[i].set, toks[j].set);
      if (score >= ERROR_THRESHOLD) {
        pairs.push({ a: toks[i].name, b: toks[j].name, score, level: "error" });
      } else if (score >= WARN_THRESHOLD) {
        pairs.push({ a: toks[i].name, b: toks[j].name, score, level: "warn" });
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}
