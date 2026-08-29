// `av init [dir]` — set up a project directory, and record it.
//
// IT DELEGATES; IT DOES NOT FORK THE INSTALLER. Everything that writes kit
// content into a directory already exists in `runInstall`, along with its
// receipt, its intent journal, its path guard, its backups and its heal pass.
// A second writer would be a second set of those, and the two would drift in
// exactly the way this phase is trying to prevent. So `init` composes: it
// resolves the target directory, runs the install into it, registers the
// project, and does nothing else that touches a file.
//
// That also means `install`'s behaviour is unchanged. If making `init` work had
// required editing install semantics, the delegation would have been wrong.

import { existsSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { runInstall, type InstallHandlerResult } from "./install-command.js";
import { UsageError } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";
import { updateRegistry, withProject } from "../projects/registry.js";
import { PROVIDER_IDS } from "../providers/index.js";

export const INIT_SCHEMA_VERSION = 1;

export interface InitHandlerOpts {
  /** Target directory; defaults to the caller's cwd. */
  readonly dir?: string;
  readonly providers?: string[];
  readonly home: string;
  readonly cwd: string;
  readonly timestamp: string;
  /** ISO instant recorded in the registry. */
  readonly now: string;
  readonly dryRun: boolean;
  readonly force?: boolean;
  readonly projectId?: string;
  readonly ariadnevVersion?: string;
  /** Override kit source root (tests / packaging), forwarded to the installer. */
  readonly kitRoot?: string;
  readonly applyHookSettings?: boolean;
  readonly json?: boolean;
  /** Create the target directory when it does not exist (what `av new` needs). */
  readonly createDir?: boolean;
}

export interface InitHandlerResult {
  readonly dir: string;
  readonly summary: string;
  readonly install: InstallHandlerResult;
}

export function runInit(opts: InitHandlerOpts): InitHandlerResult {
  const dir = resolve(opts.dir ?? opts.cwd);
  if (!existsSync(dir)) {
    if (!opts.createDir) throw new UsageError(`cannot initialize ${dir}: no such directory`);
    if (!opts.dryRun) mkdirSync(dir, { recursive: true });
  }

  const providers = opts.providers?.length ? opts.providers : [...PROVIDER_IDS].slice(0, 1);
  const install = runInstall({
    providers,
    // Always project scope. `init` is about one directory by definition, and a
    // global `init` would be `install --global` wearing a different name.
    scope: "project",
    dryRun: opts.dryRun,
    home: opts.home,
    // The install writes relative to its cwd, so this is how the target
    // directory reaches it — not a flag it would have needed adding.
    cwd: dir,
    timestamp: opts.timestamp,
    ...(opts.kitRoot ? { kitRoot: opts.kitRoot } : {}),
    applyHookSettings: opts.applyHookSettings,
    ariadnevVersion: opts.ariadnevVersion,
    force: opts.force,
  });

  // Registered after the install, not before: an entry pointing at a directory
  // that failed to set up is a lie the user has to clean up by hand.
  if (!opts.dryRun) {
    updateRegistry(opts.home, (current) =>
      withProject(current, dir, opts.now, opts.projectId ?? basename(dir)));
  }

  if (opts.json) {
    return {
      dir,
      install,
      summary: jsonEnvelope(INIT_SCHEMA_VERSION, "init.run", {
        dir,
        dryRun: opts.dryRun,
        providers,
        written: install.results.reduce((total, r) => total + r.written, 0),
        skipped: install.results.flatMap((r) =>
          r.skipped.map((s) => ({ kind: s.kind, name: s.name, reason: s.reason }))),
      }),
    };
  }

  const lines = [opts.dryRun ? `ariadnev init ${dir} — DRY RUN (no changes made)` : `ariadnev init ${dir} — complete`];
  lines.push(install.summary);
  if (!opts.dryRun) lines.push(`Registered as a project. \`av projects list\` shows it.`);
  return { dir, install, summary: lines.join("\n") };
}
