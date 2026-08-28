// `av new <name>` — create a project directory, then initialize it.
//
// Deliberately thin. Scaffolding is one `mkdir` and a README; everything after
// that is `init`, which is itself `install` plus a registry entry. A second
// scaffolding path that wrote its own kit content would be a third writer to
// keep in step with the other two.
//
// WHAT IS NOT PORTED, AND WHY. The captured surface carries `--channel`,
// `--registry-url`, `--remote`/`--local`, `--version` and `--kits-dir`. All
// five serve a remote kit registry. ariadnev ships its kit inside the binary,
// so there is no registry to point those at — they are a documented non-port,
// not a gap someone should fill by inventing an endpoint.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { runInit, type InitHandlerOpts, type InitHandlerResult } from "./init-command.js";
import { UsageError } from "./exit-codes.js";

export interface NewHandlerOpts extends Omit<InitHandlerOpts, "dir" | "createDir"> {
  /** A directory NAME, created inside cwd. Not a path — see `runNew`. */
  readonly name: string;
}

/** A name that is safe to use as a directory and readable as a project. */
const VALID_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function runNew(opts: NewHandlerOpts): InitHandlerResult {
  // Validated as GIVEN, before any path resolution. Checking the basename of
  // the resolved path instead would accept `../escape` — its basename is a
  // perfectly ordinary "escape" — and create a directory outside the project
  // root. `new` takes a name and puts it in the current directory; a caller who
  // wants to choose the location wants `init`, which takes a path.
  if (!VALID_NAME.test(opts.name)) {
    throw new UsageError(
      `${opts.name} is not a usable project name — use letters, digits, dot, dash or underscore, ` +
        "starting with a letter or digit. To set up a directory elsewhere, use `av init <dir>`",
    );
  }
  const dir = resolve(opts.cwd, opts.name);
  const name = basename(dir);
  // Refused rather than merged into. `new` means new, and a user who wants the
  // kit in a directory that already exists is asking for `init`, which says so.
  if (existsSync(dir)) {
    throw new UsageError(`${dir} already exists — use \`av init ${opts.name}\` to set up an existing directory`);
  }

  if (!opts.dryRun) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "README.md"), `# ${name}\n`);
  }

  return runInit({ ...opts, dir, createDir: true });
}
