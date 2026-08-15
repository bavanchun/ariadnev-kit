// Reference-integrity check for the av kit — the piece `lintSkill` does not do.
// Pure: the caller supplies the SKILL.md body and the list of reference file
// names it found on disk; this compares the two. Powers `ariadnev validate`.
//
// - dangling: a `references/<name>.md` mentioned in the body with no such file
// - orphan:   a reference file that exists but is never mentioned in the body
//
// The orphan check is the one that would have caught v3a's contradictory
// `workflow-pr-per-change.md` — a real file no SKILL.md linked.

/** Matches a LOCAL `references/<name>.md` mention, in either form a skill uses:
 *  bare (`references/x.md`) or explicitly relative (`./references/x.md`). The
 *  second form is why this is an alternation rather than one lookbehind — the
 *  earlier rule excluded anything preceded by `/`, which was meant to skip a
 *  cross-skill path like `../cook/references/x.md` but also skipped every
 *  `./references/x.md`, reporting files the skill clearly points at as orphans.
 *  A foreign path is still ignored: its `references` is preceded by a directory
 *  name, not by `./`. Group 1 is the bare `references/<name>.md`. */
const REFERENCE_MENTION = /(?:(?<![\w.-])\.\/|(?<![\w/.-]))(references\/[A-Za-z0-9._-]+\.md)/g;

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
