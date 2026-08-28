// `av projects list | add | remove | show | prune` — the global project index.
//
// The registry records where projects are. It holds no file list and no hashes,
// so nothing here can be mistaken for an ownership record: removing a project
// deregisters it and leaves every file on disk exactly where it was. That
// separation is the point — a global file claiming to know what is inside every
// project would be wrong the moment any of them changed unobserved.
//
// LOCKING IS THE CALLER'S. Every mutating action below runs inside
// `withLifecycleLock`, which is why `updateRegistry` takes no lock of its own.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { UsageError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";
import {
  findProject,
  readRegistry,
  staleProjects,
  updateRegistry,
  withoutProject,
  withProject,
  type ProjectEntry,
} from "../projects/registry.js";

export const PROJECTS_SCHEMA_VERSION = 1;

export interface ProjectsOpts {
  readonly home: string;
  readonly json?: boolean;
}

function row(entry: ProjectEntry): string {
  return `  ${entry.name}  ${entry.dir}  registered ${entry.registered_at}  updated ${entry.updated_at}`;
}

export function runProjectsList(opts: ProjectsOpts): string {
  const projects = readRegistry(opts.home).projects;
  if (opts.json) {
    return jsonEnvelope(PROJECTS_SCHEMA_VERSION, "projects.list", { projects, total: projects.length });
  }
  if (projects.length === 0) return "No projects registered.";
  return [`${projects.length} project(s):`, ...projects.map(row)].join("\n");
}

export interface ProjectsAddOpts extends ProjectsOpts {
  readonly dir: string;
  readonly name?: string;
  readonly now: string;
}

export function runProjectsAdd(opts: ProjectsAddOpts): string {
  const dir = resolve(opts.dir);
  // A registry pointing at directories that do not exist is a registry nobody
  // can trust, and `prune` then has to clean up entries this command created.
  if (!existsSync(dir)) throw new UsageError(`cannot register ${dir}: no such directory`);
  const registry = updateRegistry(opts.home, (current) => withProject(current, dir, opts.now, opts.name));
  const entry = findProject(registry, dir)!;
  if (opts.json) return jsonEnvelope(PROJECTS_SCHEMA_VERSION, "projects.add", { project: entry });
  return `Registered ${entry.name} at ${entry.dir}`;
}

export interface ProjectsRemoveOpts extends ProjectsOpts {
  readonly nameOrPath: string;
}

export function runProjectsRemove(opts: ProjectsRemoveOpts): string {
  const before = readRegistry(opts.home);
  const target = findProject(before, opts.nameOrPath);
  if (!target) throw new UsageError(`no registered project matches ${opts.nameOrPath}`);
  updateRegistry(opts.home, (current) => withoutProject(current, opts.nameOrPath));
  if (opts.json) return jsonEnvelope(PROJECTS_SCHEMA_VERSION, "projects.remove", { project: target });
  // Said explicitly, because "remove" is a word people reasonably read as
  // "delete", and the difference matters more here than the extra line costs.
  return `Deregistered ${target.name}. Nothing on disk was deleted — ${target.dir} is untouched.`;
}

export function runProjectsShow(opts: ProjectsRemoveOpts): string {
  const entry = findProject(readRegistry(opts.home), opts.nameOrPath);
  if (!entry) throw new UsageError(`no registered project matches ${opts.nameOrPath}`);
  if (opts.json) return jsonEnvelope(PROJECTS_SCHEMA_VERSION, "projects.show", { project: entry });
  return [
    `name         ${entry.name}`,
    `dir          ${entry.dir}`,
    `registered   ${entry.registered_at}`,
    `updated      ${entry.updated_at}`,
    `on disk      ${existsSync(entry.dir) ? "yes" : "no (run `av projects prune` to drop it)"}`,
  ].join("\n");
}

export interface ProjectsPruneOpts extends ProjectsOpts {
  /** Drop every entry, not only the ones whose directory is gone. */
  readonly all?: boolean;
  readonly force?: boolean;
  readonly yes?: boolean;
  readonly exists?: (dir: string) => boolean;
}

export function runProjectsPrune(opts: ProjectsPruneOpts): string {
  const exists = opts.exists ?? ((dir: string) => existsSync(dir));
  const registry = readRegistry(opts.home);

  // `--all` wipes the registry, including entries whose directories are alive
  // and well. Two gates rather than one, and the captured surface asks for both
  // — `--force` states the intent, `--yes` skips the confirmation, and a
  // scripted caller that has only ever passed `--yes` does not get a wipe it
  // never asked for.
  if (opts.all) {
    if (!opts.force || !opts.yes) {
      throw new UsageError("av projects prune --all removes every entry — pass both --force and --yes to confirm");
    }
    updateRegistry(opts.home, (current) => ({ ...current, projects: [] }));
    if (opts.json) {
      return jsonEnvelope(PROJECTS_SCHEMA_VERSION, "projects.prune", {
        removed: registry.projects,
        total: registry.projects.length,
      });
    }
    return `Removed all ${registry.projects.length} entries. No directory was deleted.`;
  }

  const stale = staleProjects(registry, exists);
  if (stale.length > 0) {
    const gone = new Set(stale.map((entry) => entry.dir));
    updateRegistry(opts.home, (current) => ({
      ...current,
      projects: current.projects.filter((entry) => !gone.has(entry.dir)),
    }));
  }
  if (opts.json) {
    return jsonEnvelope(PROJECTS_SCHEMA_VERSION, "projects.prune", { removed: stale, total: stale.length });
  }
  if (stale.length === 0) return "Nothing to prune — every registered directory still exists.";
  return [`Pruned ${stale.length} entry(ies) whose directory is gone:`, ...stale.map(row)].join("\n");
}
