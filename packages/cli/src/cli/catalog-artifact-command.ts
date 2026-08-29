// `av skills|agents|commands <verb>` — one command body, registered three times.
//
// The five verbs are identical across the three artifact kinds; the kind is a
// parameter, not a copy. See `catalog-entries.ts` for why that matters more
// than it looks: fifteen hand-maintained verb bodies is fifteen chances for two
// `--json` envelopes to disagree, and a consumer cannot tell which one is right.

import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  catalogEntries,
  matchesQuery,
  workflowEdges,
  type ArtifactTarget,
  type CatalogEntry,
  type CatalogKind,
} from "../catalog/catalog-entries.js";
import { ownedPaths, projectSingleArtifact } from "../catalog/single-artifact.js";
import { executeInstall } from "../install/install-execute.js";
import { planInstall } from "../install/install-plan.js";
import { assertInstallSurfacePath } from "../install/install-surface.js";
import { cleanEmptyDirsUpward } from "../install/dir-cleanup.js";
import type { Artifact, Kit } from "../kit/kit-types.js";
import { getResolver, isProviderId, PROVIDER_IDS } from "../providers/index.js";
import type { ProviderId } from "../providers/spec-verified.js";
import { EXIT, UnavailableError, UsageError, type ExitCode } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

export const CATALOG_SCHEMA_VERSION = 1;

export type CatalogVerb = "list" | "show" | "search" | "install" | "remove" | "graph";

export interface CatalogOpts {
  kind: CatalogKind;
  verb: CatalogVerb;
  /** Artifact name for show/install/remove; query for search. */
  name?: string;
  provider?: string;
  scope: "project" | "global";
  home: string;
  cwd: string;
  json?: boolean;
  dryRun?: boolean;
  /** `--installed` narrows list to what is actually on disk. */
  installedOnly?: boolean;
}

export interface CatalogResult {
  output: string;
  exitCode: ExitCode;
}

/**
 * Where each provider would put this artifact, for the current scope.
 *
 * `targetFor` returns null for a provider with no verified cell, which is the
 * same answer the installer acts on — so an unverified provider can never be
 * reported as having something installed.
 */
function targetsFor(opts: CatalogOpts): (artifact: Artifact) => ArtifactTarget[] {
  const ctx = { home: opts.home, cwd: opts.cwd, scope: opts.scope };
  const resolvers = PROVIDER_IDS.map((id) => ({ id, resolver: getResolver(id) }));
  return (artifact) =>
    resolvers.map(({ id, resolver }) => ({ provider: id, target: resolver.targetFor(artifact, ctx) }));
}

function requireName(opts: CatalogOpts, what: string): string {
  if (!opts.name) throw new UsageError(`av ${opts.kind}s ${opts.verb} requires ${what}`);
  return opts.name;
}

function resolveProvider(opts: CatalogOpts): ProviderId {
  const provider = opts.provider ?? "claude-code";
  if (!isProviderId(provider)) throw new UsageError(`unknown --provider ${JSON.stringify(provider)}`);
  return provider;
}

function entryLine(entry: CatalogEntry): string {
  const mark = entry.installed ? "+" : " ";
  const where = entry.installed ? ` [${entry.providers.join(", ")}]` : "";
  return `  ${mark} ${entry.name.padEnd(28)} ${entry.description.slice(0, 72)}${where}`;
}

function listResult(opts: CatalogOpts, entries: CatalogEntry[], heading: string): CatalogResult {
  if (opts.json) {
    return {
      output: jsonEnvelope(CATALOG_SCHEMA_VERSION, `${opts.kind}.list`, { [`${opts.kind}s`]: entries }),
      exitCode: EXIT.ok,
    };
  }
  if (entries.length === 0) {
    return { output: `${heading}\n  nothing to show`, exitCode: EXIT.ok };
  }
  return { output: [heading, ...entries.map(entryLine)].join("\n"), exitCode: EXIT.ok };
}

export function runCatalog(kit: Kit, opts: CatalogOpts): CatalogResult {
  const entries = catalogEntries(kit, opts.kind, targetsFor(opts), (path) => existsSync(path));
  const label = `av ${opts.kind}s ${opts.verb}`;

  if (opts.verb === "list") {
    const shown = entries.filter((entry) => !opts.installedOnly || entry.installed);
    return listResult(opts, shown, `${label} — ${shown.length} of ${entries.length}`);
  }

  if (opts.verb === "search") {
    const query = requireName(opts, "a query");
    const hits = entries.filter((entry) => matchesQuery(entry, query));
    // Exit 1, not 0: `search` answers a question, and "no" is a real answer a
    // script should be able to branch on without parsing the output.
    const result = listResult(opts, hits, `${label} ${query} — ${hits.length} match(es)`);
    return { ...result, exitCode: hits.length > 0 ? EXIT.ok : EXIT.failed };
  }

  if (opts.verb === "show") {
    const name = requireName(opts, "a name");
    const entry = entries.find((candidate) => candidate.name === name);
    if (!entry) throw new UsageError(`no ${opts.kind} named ${JSON.stringify(name)} in the kit`);
    if (opts.json) {
      return { output: jsonEnvelope(CATALOG_SCHEMA_VERSION, `${opts.kind}.show`, entry), exitCode: EXIT.ok };
    }
    const lines = [
      `${label} ${name}`,
      `  description  ${entry.description || "(none)"}`,
      `  category     ${entry.category ?? "(none)"}`,
      `  keywords     ${entry.keywords.length > 0 ? entry.keywords.join(", ") : "(none)"}`,
      `  installed    ${entry.installed ? entry.providers.join(", ") : "no"}`,
    ];
    return { output: lines.join("\n"), exitCode: EXIT.ok };
  }

  if (opts.verb === "graph") return runGraph(kit, opts, entries);
  if (opts.verb === "install") return runInstall(kit, opts);
  return runRemove(kit, opts);
}

/** `av skills graph` — the workflow relationships skills declare in prose. */
function runGraph(kit: Kit, opts: CatalogOpts, entries: CatalogEntry[]): CatalogResult {
  if (opts.kind !== "skill") throw new UsageError("graph is only available for skills");
  const known = new Set(entries.map((entry) => entry.name));
  const nodes = kit.skills
    .filter((skill) => !opts.name || skill.name === opts.name)
    .map((skill) => {
      const edges = workflowEdges(skill.body);
      return {
        name: skill.name,
        follows: edges.follows,
        precedes: edges.precedes,
        related: edges.related,
        // A skill can name a relationship to something outside this kit. That
        // is not an error and not silently dropped: it is reported as
        // unresolved, which is the fact a reader of the graph needs.
        unresolved: [...edges.follows, ...edges.precedes, ...edges.related].filter((n) => !known.has(n)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  if (opts.name && nodes.length === 0) {
    throw new UsageError(`no skill named ${JSON.stringify(opts.name)} in the kit`);
  }
  if (opts.json) {
    return { output: jsonEnvelope(CATALOG_SCHEMA_VERSION, "skill.graph", { skills: nodes }), exitCode: EXIT.ok };
  }
  const lines = [`av skills graph — ${nodes.length} skill(s)`];
  for (const node of nodes) {
    const edges = [
      node.follows.length > 0 ? `after ${node.follows.join(", ")}` : "",
      node.precedes.length > 0 ? `before ${node.precedes.join(", ")}` : "",
      node.related.length > 0 ? `related ${node.related.join(", ")}` : "",
    ].filter(Boolean);
    if (edges.length > 0) lines.push(`  ${node.name}: ${edges.join(" | ")}`);
  }
  if (lines.length === 1) lines.push("  no skill declares a workflow position");
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}

function runInstall(kit: Kit, opts: CatalogOpts): CatalogResult {
  const name = requireName(opts, "a name");
  const provider = resolveProvider(opts);
  const ctx = { home: opts.home, cwd: opts.cwd, scope: opts.scope };
  const ops = planInstall(projectSingleArtifact(kit, opts.kind, name), getResolver(provider), ctx);

  const writes = ops.filter((op) => op.action === "write");
  if (writes.length === 0) {
    // Every op was a skip, which for a single artifact means this provider has
    // no verified path for this kind. Same answer as a full install gives.
    throw new UnavailableError(
      `skip ${opts.kind} ${name}: ${provider} has no verified path for a ${opts.kind}`,
    );
  }

  const scopeRoot = opts.scope === "global" ? opts.home : opts.cwd;
  const result = executeInstall(ops, provider, join(scopeRoot, ".ariadnev", "backups"), {
    dryRun: !!opts.dryRun,
    timestamp: new Date().toISOString().replace(/[:.]/g, "-"),
    allowedRoots: [opts.home, opts.cwd],
    scopeRoot,
  });

  const data = { kind: opts.kind, name, provider, written: result.written, dryRun: !!opts.dryRun };
  if (opts.json) {
    return { output: jsonEnvelope(CATALOG_SCHEMA_VERSION, `${opts.kind}.install`, data), exitCode: EXIT.ok };
  }
  const verb = opts.dryRun ? "would install" : "installed";
  return { output: `av ${opts.kind}s install — ${verb} ${name} for ${provider} (${result.written} file(s))`, exitCode: EXIT.ok };
}

function runRemove(kit: Kit, opts: CatalogOpts): CatalogResult {
  const name = requireName(opts, "a name");
  const provider = resolveProvider(opts);
  const ctx = { home: opts.home, cwd: opts.cwd, scope: opts.scope };
  const targets = ownedPaths(kit, opts.kind, name, getResolver(provider), ctx);

  const scopeRoot = opts.scope === "global" ? opts.home : opts.cwd;
  const removed: string[] = [];
  for (const target of targets) {
    // The same allowlist a restore is checked against. These paths come from
    // the kit rather than from a file an attacker could write, so this is a
    // backstop — but it is the backstop that makes "delete" reviewable.
    assertInstallSurfacePath(target, [opts.home, opts.cwd]);
    if (!existsSync(target)) continue;
    if (!opts.dryRun) rmSync(target, { recursive: true, force: true });
    removed.push(target);
  }
  // Deleting only the files leaves the artifact's own directory standing, and
  // an empty `.claude/skills/av-scout` is not just litter: `list` decides what
  // is installed by asking whether that directory exists, so a removal that
  // left it would report the skill as still installed. The shared helper is
  // what uninstall uses, including its refusal to climb past a kind root.
  if (!opts.dryRun) {
    for (const target of targets) cleanEmptyDirsUpward(dirname(target), scopeRoot);
  }

  const data = { kind: opts.kind, name, provider, removed: removed.length, dryRun: !!opts.dryRun };
  if (opts.json) {
    return { output: jsonEnvelope(CATALOG_SCHEMA_VERSION, `${opts.kind}.remove`, data), exitCode: EXIT.ok };
  }
  const verb = opts.dryRun ? "would remove" : "removed";
  const detail = removed.length === 0 ? "nothing installed for that provider" : `${removed.length} path(s)`;
  return { output: `av ${opts.kind}s remove — ${verb} ${name} for ${provider}: ${detail}`, exitCode: EXIT.ok };
}
