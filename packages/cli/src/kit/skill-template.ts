export interface SkillTemplateInput {
  slug: string;
  description: string;
}

const SLUG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** Render a canonical SKILL.md with `name: av:<slug>` frontmatter + stub body. */
export function renderSkillTemplate({ slug, description }: SkillTemplateInput): string {
  if (!isValidSlug(slug)) throw new Error(`invalid skill slug: "${slug}" (use lowercase-with-hyphens)`);
  const desc = description.trim() || `Describe when to use the ${slug} skill.`;
  return [
    "---",
    `name: av:${slug}`,
    `description: ${desc}`,
    "metadata:",
    "  author: ariadnev",
    "  version: 0.1.0",
    "---",
    "",
    `# ${slug}`,
    "",
    "Describe what this skill does and when to invoke it.",
    "",
    "## Steps",
    "",
    "1. ...",
    "",
    "## Output format",
    "",
    "Describe the result this skill returns.",
    "",
    "## Quality gates",
    "",
    "- [ ] The requested outcome is complete.",
    "",
    "## Workflow position",
    "",
    "Related: none.",
    "",
  ].join("\n");
}
