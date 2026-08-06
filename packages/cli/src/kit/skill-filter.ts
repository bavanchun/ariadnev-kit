/** Match a bare kit slug against bare or vc:-prefixed user filters. */
export function matchesSkillFilter(name: string, filters: string[]): boolean {
  const bare = name.replace(/^vc:/, "");
  return filters.some((filter) => filter.replace(/^vc:/, "") === bare);
}
