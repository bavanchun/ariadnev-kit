// Reference-integrity check for the vc kit — the piece `lintSkill` does not do.
// Pure: the caller supplies the SKILL.md body and the list of reference file
// names it found on disk; this compares the two. Powers `vcskill validate`.
//
// - dangling: a `references/<name>.md` mentioned in the body with no such file
// - orphan:   a reference file that exists but is never mentioned in the body
//
// The orphan check is the one that would have caught v3a's contradictory
// `workflow-pr-per-change.md` — a real file no SKILL.md linked.

/** Matches a LOCAL `references/<name>.md` mention: one not preceded by a path
 *  separator, so a cross-skill reference like `../cook/references/x.md` (where
 *  `references` is preceded by `/`) is deliberately ignored — that file belongs
 *  to another skill, not this one. Group 1 is the bare `references/<name>.md`. */
const REFERENCE_MENTION = /(?<![\w/.-])(references\/[A-Za-z0-9._-]+\.md)/g;

export interface ReferenceIntegrityResult {
  dangling: string[];
  orphans: string[];
}

/**
 * Compare the references a skill *mentions* against the ones that *exist*.
 * `referenceNames` are paths relative to the skill dir, e.g. "references/foo.md".
 */
export function checkReferenceIntegrity(
  body: string,
  referenceNames: string[],
): ReferenceIntegrityResult {
  const existing = new Set(referenceNames);

  const mentioned = new Set<string>();
  for (const match of body.matchAll(REFERENCE_MENTION)) {
    mentioned.add(match[1]);
  }

  const dangling = [...mentioned].filter((ref) => !existing.has(ref)).sort();
  const orphans = [...existing].filter((ref) => !mentioned.has(ref)).sort();

  return { dangling, orphans };
}
