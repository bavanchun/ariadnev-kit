/** Match a bare kit slug against bare or av:-prefixed user filters. */
export function matchesSkillFilter(name: string, filters: string[]): boolean {
  const bare = name.replace(/^av:/, "");
  return filters.some((filter) => filter.replace(/^av:/, "") === bare);
}
