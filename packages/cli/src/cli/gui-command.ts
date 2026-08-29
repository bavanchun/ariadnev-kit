// `av gui` — start the local API and open it in the browser.
//
// A DELIBERATE DIVERGENCE, AND THE SMALLER OF TWO BAD OPTIONS. Upstream's `gui`
// opens a native desktop window, and when the binary was built without GUI
// assets it tells you to download a desktop app from the vendor's site.
// ariadnev operates no such site and ships no second product, so cloning that
// means either a webview dependency inside a Bun single-file binary or a command
// whose failure mode is a link to nothing. Parity here is of *function* — a
// graphical view opens — not of window chrome.
//
// WHAT IT OPENS, AND WHY IT IS NOT `ariadnev-web`. The phase expected the
// sibling web project to be the dashboard. That project is a static
// documentation and marketing site with no client for a local API, so the
// binding it was meant to use does not exist; the phase's own documented degrade
// applies and `av gui` opens the daemon's status page. It is a real page served
// by the process this command just started, which is the property that matters:
// nothing here points at a URL that is not there.

import { spawn } from "node:child_process";
import { runApiStart, dashboardUrl, type ApiOpts, type ApiResult } from "./api-command.js";
import { EXIT } from "./exit-codes.js";
import { jsonEnvelope } from "./json-envelope.js";
import { API_SCHEMA_VERSION } from "../api/routes.js";
import { DEFAULT_BIND, DEFAULT_PORT } from "../api/server.js";
import { inspectDaemon, type LifecycleDeps } from "../api/daemon-lifecycle.js";

export interface GuiOpts extends ApiOpts {
  /** Start the daemon and print the URL without launching anything. */
  readonly noOpen?: boolean;
}

/** The platform's "open this URL" command. */
export function openerFor(platform: NodeJS.Platform): { command: string; args: string[] } | null {
  switch (platform) {
    case "darwin":
      return { command: "open", args: [] };
    case "win32":
      // The empty string is `start`'s title argument. Without it, a URL in
      // quotes becomes the window title and nothing opens.
      return { command: "cmd", args: ["/c", "start", ""] };
    default:
      return { command: "xdg-open", args: [] };
  }
}

export type BrowserLauncher = (url: string) => boolean;

/**
 * Launch the platform opener, detached.
 *
 * Detached and unref'd because a browser started here would otherwise hold this
 * process open — `av gui` would never return, and the daemon it started would
 * look like it belongs to a command that hung. Returns false rather than
 * throwing when the opener is missing: on a headless box that is expected, and
 * the URL printed alongside is still the answer.
 */
export function realBrowserLauncher(platform: NodeJS.Platform): BrowserLauncher {
  const opener = openerFor(platform);
  return (url: string): boolean => {
    if (opener === null) return false;
    try {
      const child = spawn(opener.command, [...opener.args, url], { detached: true, stdio: "ignore" });
      child.unref();
      return true;
    } catch {
      return false;
    }
  };
}

export async function runGui(opts: GuiOpts, deps: LifecycleDeps, launch: BrowserLauncher): Promise<ApiResult> {
  // `start` is idempotent, so this is "make sure it is up" rather than a second
  // daemon every time someone opens the dashboard.
  const started = await runApiStart(opts, deps);
  if (started.exitCode !== EXIT.ok) return started;

  const inspection = await inspectDaemon(opts.home, deps, null);
  const record = inspection.record;
  const url = record
    ? dashboardUrl(record.bind, record.port)
    : dashboardUrl(opts.bind ?? DEFAULT_BIND, opts.port ?? DEFAULT_PORT);

  const opened = opts.noOpen ? false : launch(url);

  if (opts.json) {
    return { output: jsonEnvelope(API_SCHEMA_VERSION, "gui.open", { url, opened, running: true }), exitCode: EXIT.ok };
  }
  const lines = [started.output, opened ? `opening ${url}` : `dashboard at ${url}`];
  if (!opened && !opts.noOpen) lines.push("  (no browser opener on this system — open the URL yourself)");
  return { output: lines.filter(Boolean).join("\n"), exitCode: EXIT.ok };
}
