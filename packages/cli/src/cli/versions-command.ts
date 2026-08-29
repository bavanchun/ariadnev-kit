// `av versions` — the binary, the kit, and the installed skills.
//
// IT WORKS OFFLINE BECAUSE THERE IS NOTHING TO CALL. There is no ariadnev
// versions registry, and the honest thing is to say so rather than to leave a
// blank `latest` column implying a lookup that failed. The captured surface set
// that precedent for its own registry — *"live latest-version comparison is
// disabled until the versions registry endpoint is deployed"* — and it is the
// right pattern: ship the local half, and name the missing half instead of
// pretending or omitting.
//
// SO `--local-only` AND `--cache-ttl` CHANGE NOTHING, AND THE OUTPUT SAYS SO.
// They exist because the captured surface has them and a script written against
// it should not fail here. A flag that is silently inert is a small lie; a flag
// that is documented as inert is a compatibility shim.
//
// A SKILL'S VERSION IS USUALLY ABSENT, AND THAT IS REPORTED AS ABSENT. Most
// skills carry no `version` in their frontmatter. Printing the kit's version
// beside each one would suggest a per-skill version that does not exist.

import { getKitRoot } from "../kit/embedded-kit.js";
import { loadKit } from "../kit/load-kit.js";
import { EMBEDDED_VERSION } from "../kit/kit-embedded.generated.js";
import { packageVersion } from "../version.js";
import { jsonEnvelope } from "./json-envelope.js";
import { EXIT } from "./exit-codes.js";
import type { BackupsResult } from "./backups-inspect.js";

export const VERSIONS_SCHEMA_VERSION = 1;

/**
 * Said whenever a `latest` column would otherwise be blank.
 *
 * Exported so the test pins the promise rather than a phrasing.
 */
export const NO_REGISTRY_NOTE =
  "No versions registry exists for ariadnev, so there is nothing to compare against. " +
  "Every version below is local.";

export interface VersionsOpts {
  home: string;
  cwd: string;
  /** Accepted for parity; every field is local either way. */
  localOnly?: boolean;
  /** Accepted for parity; nothing is cached because nothing is fetched. */
  cacheTtl?: string;
  json?: boolean;
  /** Override the kit root (tests, packaging). */
  kitRoot?: string;
}

export interface SkillVersion {
  readonly name: string;
  /** From the skill's own frontmatter, or null when it declares none. */
  readonly version: string | null;
}

export interface VersionsReport {
  readonly cli: string;
  readonly kit: { readonly version: string; readonly root: string; readonly skills: number; readonly agents: number; readonly commands: number };
  readonly skills: readonly SkillVersion[];
  /** Always false. Present so a machine reader does not have to infer it. */
  readonly registry_available: false;
  readonly note: string;
}

function frontmatterVersion(frontmatter: Record<string, unknown>): string | null {
  const value = frontmatter.version;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function buildVersions(opts: VersionsOpts): VersionsReport {
  const root = opts.kitRoot ?? getKitRoot(opts.cwd);
  const kit = loadKit(root);
  return {
    cli: packageVersion(),
    kit: {
      version: EMBEDDED_VERSION,
      root,
      skills: kit.skills.length,
      agents: kit.agents.length,
      commands: kit.commands.length,
    },
    skills: kit.skills
      .map((skill) => ({ name: skill.name, version: frontmatterVersion(skill.frontmatter) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    registry_available: false,
    note: NO_REGISTRY_NOTE,
  };
}

export function runVersions(opts: VersionsOpts): BackupsResult {
  const report = buildVersions(opts);
  if (opts.json) {
    return { output: jsonEnvelope(VERSIONS_SCHEMA_VERSION, "versions.list", report), exitCode: EXIT.ok };
  }
  const versioned = report.skills.filter((skill) => skill.version !== null);
  const lines = [
    `ariadnev  ${report.cli}`,
    `kit       ${report.kit.version}`,
    `          ${report.kit.skills} skill(s), ${report.kit.agents} agent(s), ${report.kit.commands} command(s)`,
  ];
  if (versioned.length === 0) {
    // Stated rather than shown as an empty list: "no skill declares a version"
    // is information, and an empty section reads like a bug.
    lines.push("          no skill declares its own version; they ship with the kit");
  } else {
    lines.push("skills with their own version:");
    for (const skill of versioned) lines.push(`  ${skill.name.padEnd(28)} ${skill.version}`);
  }
  lines.push("", report.note);
  if (opts.localOnly || opts.cacheTtl !== undefined) {
    lines.push("(--local-only and --cache-ttl are accepted for compatibility and change nothing here.)");
  }
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}
