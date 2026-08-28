// Reading the kit as a browsable catalog, for `av skills|agents|commands`.
//
// ONE IMPLEMENTATION, THREE COMMANDS. Five verbs across three artifact kinds is
// fifteen chances for two of them to disagree about what a `--json` envelope
// looks like. The three commands differ in exactly one value — which array of
// the kit they read — so that value is a parameter and everything else is
// shared. `agents list --json` and `skills list --json` cannot drift because
// there is only one of them.
//
// WHY `skill` AND `skills` BOTH EXIST. Upstream draws the line explicitly:
// `skill` operates on a single per-skill runtime env, `skills` browses the
// catalog. It reads oddly and it is not a typo, so it is preserved rather than
// tidied into one command that would then mean two things.

import type { Artifact, ArtifactType, Kit } from "../kit/kit-types.js";

/** The three artifact kinds that have a catalog command of their own. */
export type CatalogKind = "skill" | "agent" | "command";

export const CATALOG_KINDS: CatalogKind[] = ["skill", "agent", "command"];

/** The command name each kind is registered under. */
export const COMMAND_FOR_KIND: Record<CatalogKind, string> = {
  skill: "skills",
  agent: "agents",
  command: "commands",
};

export interface CatalogEntry {
  readonly name: string;
  readonly kind: CatalogKind;
  /** Frontmatter description, or "" when the artifact declares none. */
  readonly description: string;
  readonly category: string | null;
  readonly keywords: readonly string[];
  /** True when at least one provider has this artifact on disk. */
  readonly installed: boolean;
  /** Providers whose verified destination for it exists. */
  readonly providers: readonly string[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

export function artifactsOf(kit: Kit, kind: CatalogKind): Artifact[] {
  if (kind === "skill") return kit.skills;
  if (kind === "agent") return kit.agents;
  return kit.commands;
}

/** `ArtifactType` and `CatalogKind` overlap but are not the same union. */
export function artifactType(kind: CatalogKind): ArtifactType {
  return kind;
}

/** One provider's verified destination for an artifact, or null when it skips. */
export interface ArtifactTarget {
  readonly provider: string;
  /** Absolute path, or null when this provider has no verified cell for it. */
  readonly target: string | null;
}

/**
 * Which providers actually have this artifact on disk.
 *
 * Measured from the filesystem rather than from the install receipt, and that
 * is a correction rather than a preference. The receipt records file paths, not
 * what produced them, so deciding "is `scout` installed" from it means matching
 * a name against a path — and the installed directory is `av-scout`, not
 * `scout`, so the match silently answered "no" for every artifact that was in
 * fact installed. Asking the resolver where the file goes and then asking the
 * filesystem whether it is there cannot be wrong in that way, and it also sees
 * an install this command did not perform.
 */
export function installedProviders(
  targets: readonly ArtifactTarget[],
  exists: (path: string) => boolean,
): string[] {
  return targets
    .filter((probe) => probe.target !== null && exists(probe.target))
    .map((probe) => probe.provider)
    .sort();
}

export function toEntry(
  artifact: Artifact,
  kind: CatalogKind,
  targets: readonly ArtifactTarget[],
  exists: (path: string) => boolean,
): CatalogEntry {
  const providers = installedProviders(targets, exists);
  return {
    name: artifact.name,
    kind,
    description: text(artifact.frontmatter.description),
    category: text(artifact.frontmatter.category) || null,
    keywords: stringList(artifact.frontmatter.keywords).sort(),
    installed: providers.length > 0,
    providers,
  };
}

export function catalogEntries(
  kit: Kit,
  kind: CatalogKind,
  targetsFor: (artifact: Artifact) => readonly ArtifactTarget[],
  exists: (path: string) => boolean,
): CatalogEntry[] {
  return artifactsOf(kit, kind)
    .map((artifact) => toEntry(artifact, kind, targetsFor(artifact), exists))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Case-insensitive match over name, description, category and keywords.
 *
 * Every field a reader can see is searchable. A search that only matched names
 * would miss the case it exists for — finding a skill whose name you do not
 * already know.
 */
export function matchesQuery(entry: CatalogEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  const haystack = [entry.name, entry.description, entry.category ?? "", ...entry.keywords]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

/** Relationships a skill declares in its `## Workflow Position` section. */
export interface WorkflowEdges {
  readonly follows: readonly string[];
  readonly precedes: readonly string[];
  readonly related: readonly string[];
}

const EDGE_LABELS: Record<string, keyof WorkflowEdges> = {
  "typically follows": "follows",
  "typically precedes": "precedes",
  related: "related",
};

/**
 * Read a skill's workflow edges out of its prose.
 *
 * The relationships live in `## Workflow Position` as bold labels, not in
 * frontmatter, so this parses what the skills actually say rather than what a
 * schema wishes they said. Names are taken from backticked spans, which is how
 * every skill in the kit writes them; a line with none contributes no edges
 * instead of contributing a sentence.
 */
export function workflowEdges(body: string): WorkflowEdges {
  const edges: Record<keyof WorkflowEdges, string[]> = { follows: [], precedes: [], related: [] };
  const section = /^##\s+Workflow Position\s*$/im.exec(body);
  if (!section) return edges;
  const rest = body.slice(section.index + section[0].length);
  const end = /^##\s/m.exec(rest);
  for (const line of (end ? rest.slice(0, end.index) : rest).split("\n")) {
    const labelled = /^\*\*(.+?):\*\*\s*(.+)$/.exec(line.trim());
    if (!labelled) continue;
    const key = EDGE_LABELS[labelled[1].trim().toLowerCase()];
    if (!key) continue;
    for (const [, name] of labelled[2].matchAll(/`([^`]+)`/g)) edges[key].push(name.trim());
  }
  return edges;
}
