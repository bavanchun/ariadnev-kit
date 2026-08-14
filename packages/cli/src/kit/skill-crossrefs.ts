export interface SkillCrossrefSource {
  source: string;
  content: string;
}

export interface UnresolvedSkillReference {
  source: string;
  reference: string;
}

const SKILL_REFERENCE = /(?<![A-Za-z0-9_-])av:([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?![A-Za-z0-9_-])/g;

/** Resolve av-prefixed references after the caller has loaded the full kit. */
export function findUnresolvedSkillReferences(
  sources: SkillCrossrefSource[],
  knownNames: Iterable<string>,
): UnresolvedSkillReference[] {
  const known = new Set([...knownNames].map((name) => name.replace(/^av:/, "")));
  const unresolved: UnresolvedSkillReference[] = [];

  for (const source of sources) {
    const seen = new Set<string>();
    for (const match of source.content.matchAll(SKILL_REFERENCE)) {
      const slug = match[1];
      if (known.has(slug) || seen.has(slug)) continue;
      seen.add(slug);
      unresolved.push({ source: source.source, reference: `av:${slug}` });
    }
  }

  return unresolved;
}
