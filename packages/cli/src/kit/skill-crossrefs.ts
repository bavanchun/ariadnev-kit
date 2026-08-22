export interface SkillCrossrefSource {
  source: string;
  content: string;
}

export interface UnresolvedSkillReference {
  source: string;
  reference: string;
}

const SKILL_REFERENCE_SOURCE = "(?<![A-Za-z0-9_-])av:([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?![A-Za-z0-9_-])";

/**
 * A fresh matcher for "does this prose name another skill?", shared with the
 * lint rules so there is no second, drifting copy of the pattern.
 *
 * A factory rather than a shared `const`, because a `/g` regex carries
 * `lastIndex` between calls. `matchAll` copies that offset into its clone, so
 * one `.test()` or `.exec()` anywhere would make every later scan start mid-
 * string and silently drop the references before the cursor. Cross-module
 * mutable state is not worth the one allocation this saves.
 */
export function skillReferencePattern(): RegExp {
  return new RegExp(SKILL_REFERENCE_SOURCE, "g");
}

/** Resolve av-prefixed references after the caller has loaded the full kit. */
export function findUnresolvedSkillReferences(
  sources: SkillCrossrefSource[],
  knownNames: Iterable<string>,
): UnresolvedSkillReference[] {
  const known = new Set([...knownNames].map((name) => name.replace(/^av:/, "")));
  const unresolved: UnresolvedSkillReference[] = [];

  for (const source of sources) {
    const seen = new Set<string>();
    for (const match of source.content.matchAll(skillReferencePattern())) {
      const slug = match[1];
      if (known.has(slug) || seen.has(slug)) continue;
      seen.add(slug);
      unresolved.push({ source: source.source, reference: `av:${slug}` });
    }
  }

  return unresolved;
}
