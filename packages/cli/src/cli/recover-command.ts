// `av recover` — the top-level alias over the hardened restore.
//
// IT USED TO WRITE BY DEFAULT AND NOW IT PREVIEWS. That is a behaviour change
// to a shipped command, and it is the most dangerous kind: a scripted
// `av recover <id>` becomes a no-op that still exits 0 and still prints
// restore-shaped output. Someone believes their machine was restored when it
// was not. That is worse than the `run` rename, because a renamed command fails
// loudly and this one succeeds quietly.
//
// So the change is announced on exactly the invocation it affects — a recover
// with neither `--yes` nor `--dry-run`, which is the spelling that used to write
// — and nowhere else. A warning printed on every invocation is a warning nobody
// reads by the third day; one printed on the path whose meaning changed is
// information.
//
// THE HARDENING BELONGS TO `runBackupsRestore` AND STAYS THERE. Manifest
// authority, the install-surface check, whole-set validation before any write,
// and the pre-restore safety backup are all `260822-1407` phase 5's, and this
// file adds nothing to that path and removes nothing from it. `--allow-root` is
// the one addition, and it only ever *narrows* what is accepted.

import { resolve } from "node:path";
import { runBackupsRestore, type BackupsRestoreOpts } from "./backups-command.js";
import { BACKUPS_SCHEMA_VERSION, type BackupsResult } from "./backups-inspect.js";
import { EXIT } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";

/**
 * Printed for one release on the invocation whose meaning changed.
 *
 * Exported so the test asserts the text rather than a substring that could be
 * softened later without anyone noticing.
 */
export const RECOVER_PREVIEW_WARNING =
  "`av recover` now PREVIEWS by default and wrote files in earlier releases. " +
  "Nothing was restored. Re-run with --yes to actually restore.";

export interface RecoverOpts extends Omit<BackupsRestoreOpts, "dryRun"> {
  /** Actually write. Without it this previews, which is the new default. */
  yes?: boolean;
  /** Explicitly asked for a preview, so the behaviour change is not news. */
  dryRun?: boolean;
  /**
   * Absolute roots the caller authorises this restore to write under.
   *
   * Additive to nothing: the restore already refuses anything outside the home
   * and project roots and anything ariadnev does not install. This can only
   * make the accepted set smaller, by requiring that an absolute root a
   * manifest names was also named on the command line.
   */
  allowRoot?: string[];
  json?: boolean;
}

export interface RecoverResult extends BackupsResult {
  readonly restored: string[];
}

/**
 * Entries whose original path is not under any authorised root.
 *
 * Only consulted when `--allow-root` was passed. Absent the flag the existing
 * root checks apply unchanged, which is what keeps this from being a second
 * security model competing with the first.
 */
function outsideAllowedRoots(paths: readonly string[], allowRoot: readonly string[]): string[] {
  const roots = allowRoot.map((root) => resolve(root));
  return paths.filter((path) => {
    const absolute = resolve(path);
    return !roots.some((root) => absolute === root || absolute.startsWith(`${root}/`));
  });
}

export function runRecover(opts: RecoverOpts): RecoverResult {
  // Preview unless told otherwise. `--dry-run` and the absence of `--yes` mean
  // the same thing to the restore; they differ only in whether the user is
  // told that this is new.
  const writing = !!opts.yes && !opts.dryRun;
  const announce = !opts.yes && !opts.dryRun;

  const planned = runBackupsRestore({ ...opts, dryRun: true });

  if (opts.allowRoot && opts.allowRoot.length > 0) {
    const refused = outsideAllowedRoots(planned.restored, opts.allowRoot);
    if (refused.length > 0) {
      return {
        restored: [],
        output: [
          `ariadnev recover — refusing: ${refused.length} entr${refused.length === 1 ? "y" : "ies"} lie outside the roots you authorised`,
          ...refused.map((path) => `  ${path}`),
          "  pass --allow-root for each root above, or omit --allow-root to use the default roots",
        ].join("\n"),
        exitCode: EXIT.usage,
      };
    }
  }

  const result = writing ? runBackupsRestore({ ...opts, dryRun: false }) : planned;

  if (opts.json) {
    return {
      restored: result.restored,
      output: jsonEnvelope(BACKUPS_SCHEMA_VERSION, "backups.recover", {
        restored: result.restored,
        applied: writing,
        previewed: !writing,
        ...(announce ? { warning: RECOVER_PREVIEW_WARNING } : {}),
      }),
      exitCode: EXIT.ok,
    };
  }

  const lines = [result.summary];
  if (announce) lines.push(`  ${RECOVER_PREVIEW_WARNING}`);
  else if (!writing) lines.push("  Nothing was restored. Re-run with --yes to actually restore.");
  return { restored: result.restored, output: lines.join("\n"), exitCode: EXIT.ok };
}
