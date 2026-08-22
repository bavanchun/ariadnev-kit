// Cross-skill link checking — the sibling of `reference-integrity.ts`, which
// only ever compares a skill against its own references/ dir.
//
// Two independent rules, because either alone is blind:
//
// - existence: the target skill and file are somewhere in the kit.
// - shape:     the path is written as `(../)+av-<slug>/…`, the installed layout.
//
// Existence alone is a no-op here. Resolving `../av-cook/references/x.md` by
// stripping the prefix and looking up skill `cook` answers "does that file
// exist" — and the answer is yes for `kits/core/skills/cook/references/x.md`
// too, a directory layout that has not existed since the rename. A name lookup
// cannot tell the two apart. Only shape can.
//
// Pure: no fs. The caller builds the index.

export interface CrossSkillSource {
  /** Path relative to the skill root, e.g. "cook/references/routing.md". */
  source: string;
  content: string;
}

export type CrossSkillReason = "unknown-skill" | "unknown-file" | "bad-shape";

export interface CrossSkillFinding {
  source: string;
  /** The path exactly as written, so the message can quote it. */
  raw: string;
  targetSkill: string;
  targetFile: string;
  reason: CrossSkillReason;
  /** Which shape rule failed. Set only when `reason` is "bad-shape" — the
   *  caller stages severity by it, because an unprefixed link still works today
   *  while a stale root or a wrong depth is already broken. */
  shape?: "stale-root" | "unprefixed" | "wrong-depth";
  detail: string;
}

/** Skill name → the files it contains, relative to its own directory. */
export type SkillIndex = Map<string, Set<string>>;

export function buildSkillIndex(skills: { name: string; files: string[] }[]): SkillIndex {
  return new Map(skills.map((skill) => [skill.name, new Set(skill.files)]));
}

/**
 * A cross-skill path in any of the three shapes that appear in the corpus:
 * a `../` run, or the pre-rename `kits/core/skills/` root.
 *
 * The target is restricted to the three kinds a skill can legitimately point
 * at. That restriction is also what keeps a path like
 * `../../../../docs/operations/x.md` out of here — it escapes the skills root
 * entirely and is not a cross-skill link at all.
 */
const CROSS_SKILL_PATH =
  /((?:\.\.\/)+|kits\/core\/skills\/)([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/(references\/[A-Za-z0-9._-]+\.md|SKILL\.md|scripts\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)/g;

/**
 * How many `../` a link from `source` needs to reach a sibling skill.
 *
 * `cook/SKILL.md` is one level inside the skill, so `../`. A file at
 * `cook/references/x.md` is two, so `../../`. Getting this wrong is silent
 * under an existence check — both depths name a file that exists — which is
 * exactly how a bulk rewrite introduces broken links that still "resolve".
 */
function requiredDepth(source: string): number {
  return source.split("/").length - 1;
}

export function checkCrossSkillReferences(
  sources: CrossSkillSource[],
  index: SkillIndex,
  pendingSkillNames: Iterable<string>,
): CrossSkillFinding[] {
  const pending = new Set(pendingSkillNames);
  const findings: CrossSkillFinding[] = [];

  for (const { source, content } of sources) {
    const seen = new Set<string>();
    const depth = requiredDepth(source);

    for (const match of content.matchAll(CROSS_SKILL_PATH)) {
      const [raw, prefix, slug, targetFile] = match as unknown as [string, string, string, string];
      if (seen.has(raw)) continue;
      seen.add(raw);

      const base = { source, raw, targetFile };

      // The rename left these carrying the new slug under the old root, so the
      // suggestion has to keep an av- that is already there rather than add a
      // second one.
      const prefixed = slug.startsWith("av-") ? slug : `av-${slug}`;

      if (prefix === "kits/core/skills/") {
        findings.push({
          ...base,
          targetSkill: prefixed.slice(3),
          reason: "bad-shape",
          shape: "stale-root",
          detail: `stale pre-rename root; write ${"../".repeat(depth)}${prefixed}/${targetFile}`,
        });
        continue;
      }

      if (!slug.startsWith("av-")) {
        findings.push({
          ...base,
          targetSkill: slug,
          reason: "bad-shape",
          shape: "unprefixed",
          detail: `missing av- prefix; write ${"../".repeat(depth)}av-${slug}/${targetFile}`,
        });
        continue;
      }

      const targetSkill = slug.slice(3);

      if (prefix.length / 3 !== depth) {
        findings.push({
          ...base,
          targetSkill,
          reason: "bad-shape",
          shape: "wrong-depth",
          detail: `wrong depth for a link from ${source}; write ${"../".repeat(depth)}${slug}/${targetFile}`,
        });
        continue;
      }

      // A skill can point at one whose port lands in a later wave. That is a
      // scheduling fact, not a broken link — same grace the av: reference
      // checker gives.
      if (pending.has(targetSkill)) continue;

      const files = index.get(targetSkill);
      if (files === undefined) {
        findings.push({ ...base, targetSkill, reason: "unknown-skill", detail: "no such skill in the kit" });
        continue;
      }
      if (!files.has(targetFile)) {
        findings.push({ ...base, targetSkill, reason: "unknown-file", detail: `${targetSkill} has no ${targetFile}` });
      }
    }
  }

  return findings;
}
