// What `av uninstall --purge` removes *beyond* a provider uninstall.
//
// Plain uninstall answers "which files did a provider install write". That is
// receipt-driven and complete for what it covers. Purge covers the rest: the
// state directory, the project installs registered elsewhere, the MCP residue,
// and the binary. None of those are in any receipt — the first three predate or
// outlive it, and the binary was put there by install.sh before a receipt
// existed.
//
// PURE, LIKE ITS SIBLING. No `node:fs` here; every read is injected, the same
// way `uninstall-plan.ts` takes `PlanUninstallDeps`. The executor is the only
// thing that touches disk.
//
// THE ORDER OF THE PASSES IS LOAD-BEARING and is fixed by the shape of this
// type, not by a comment the executor might ignore:
//
//   providers → projects → mcp → state → binary
//
// `~/.ariadnev/backups` is where the provider and project passes write their
// safety copies, so the state pass cannot run before them. The binary is the
// process executing all of this, so it goes last.
import { dirname, join } from "node:path";
import { classifyStateEntries, stateRoot } from "../storage/operational-paths.js";
import { registryPath } from "../projects/registry.js";
import type { Registry } from "../projects/registry.js";
import type { UninstallOp } from "./uninstall-plan.js";

/** A registered project the purge will visit, and whether it can be. */
export interface PurgeProjectTarget {
  name: string;
  dir: string;
  /**
   * `ready` — has a receipt, gets a full uninstall plus its own state directory.
   * `no-receipt` — registered but never installed into, or already uninstalled;
   * its `.ariadnev` still goes if it exists.
   * `missing` — the directory is gone. Registries outlive what they name.
   */
  status: "ready" | "no-receipt" | "missing";
}

export interface PurgePlan {
  /** Registered projects other than the current scope root. */
  projects: PurgeProjectTarget[];
  /** `~/.claude.json` server entries and `*.ariadnev-backup` files. */
  mcp: UninstallOp[];
  /** The `.ariadnev` state directory, minus anything unrecognised inside it. */
  state: UninstallOp[];
  /** The executable and its short alias. */
  binary: UninstallOp[];
}

export interface PurgePlanDeps {
  fileExists(path: string): boolean;
  /** Top-level entry names in a directory — files and directories alike. */
  listEntries(dir: string): string[];
  /** Parsed JSON, or null when the file is absent or unparseable. */
  readJson(path: string): unknown;
  /** The link target of a symlink, or null when `path` is not one. */
  readLinkTarget(path: string): string | null;
  /** True when two paths are byte-identical regular files. */
  sameContent(a: string, b: string): boolean;
  platform: NodeJS.Platform;
}

export interface PurgePlanOpts {
  home: string;
  cwd: string;
  /**
   * Global purge reaches the state directory, the registry, and the binary.
   * A project purge means only "this project's files and this project's
   * `.ariadnev`" — there is no per-project binary and no per-project registry,
   * so those passes are simply empty rather than scoped down to nothing.
   */
  scope: "project" | "global";
  /** `process.execPath` — the binary running this, which is the one to remove. */
  execPath: string;
}

/** `~/.claude.json`, whose backups `mcp-command.ts` writes beside it. */
const MCP_BACKUP_SUFFIX = ".ariadnev-backup";

/**
 * Plan every pass past the provider uninstall.
 *
 * Nothing here decides *whether* to purge; the caller has already established
 * that. This only decides what purging would touch, which is why it is safe to
 * call for a dry run and for the real thing with the same arguments.
 */
export function planPurge(deps: PurgePlanDeps, opts: PurgePlanOpts): PurgePlan {
  const root = opts.scope === "global" ? opts.home : opts.cwd;
  return {
    projects: opts.scope === "global" ? planProjects(deps, opts) : [],
    mcp: planMcp(deps, opts),
    state: planState(deps, root),
    binary: opts.scope === "global" ? planBinary(deps, opts) : [],
  };
}

/**
 * The registered projects, from `~/.ariadnev/projects.json`.
 *
 * The registry says *where* projects are and deliberately not *what* is owned
 * inside them — its own header is explicit about that. So this reads it for
 * locations only; each project's own receipt decides what gets deleted there,
 * exactly as it does for the current directory.
 */
function planProjects(deps: PurgePlanDeps, opts: PurgePlanOpts): PurgeProjectTarget[] {
  const parsed = deps.readJson(registryPath(opts.home));
  const projects = (parsed as Registry | null)?.projects;
  if (!Array.isArray(projects)) return [];

  const targets: PurgeProjectTarget[] = [];
  const seen = new Set<string>([opts.cwd]);
  for (const entry of projects) {
    if (typeof entry?.dir !== "string") continue;
    // The current directory is already covered by the provider pass. Visiting
    // it again would plan a second uninstall against a receipt the first one
    // just deleted.
    if (seen.has(entry.dir)) continue;
    seen.add(entry.dir);
    targets.push({
      name: typeof entry.name === "string" ? entry.name : entry.dir,
      dir: entry.dir,
      status: !deps.fileExists(entry.dir)
        ? "missing"
        : deps.fileExists(join(stateRoot(entry.dir), "receipt.json"))
          ? "ready"
          : "no-receipt",
    });
  }
  return targets.sort((a, b) => a.dir.localeCompare(b.dir));
}

/**
 * The MCP residue, which splits cleanly into provable and not.
 *
 * `av install` writes no MCP servers — only the user's own `av mcp add` does,
 * and the file it writes to holds a great deal besides ours with nothing
 * marking which is which. So a server is removed only when its `command` is the
 * binary this run is about to delete. Everything else is reported.
 *
 * The backup files are the provable half: `mcp-command.ts` creates
 * `<path>.ariadnev-backup` under exactly that name and nothing else does.
 */
function planMcp(deps: PurgePlanDeps, opts: PurgePlanOpts): UninstallOp[] {
  const ops: UninstallOp[] = [];
  const configs =
    opts.scope === "global"
      ? [join(opts.home, ".claude.json"), join(opts.cwd, ".mcp.json")]
      : [join(opts.cwd, ".mcp.json")];

  for (const config of configs) {
    const backup = `${config}${MCP_BACKUP_SUFFIX}`;
    if (deps.fileExists(backup)) ops.push({ action: "remove-file", path: backup });

    if (!deps.fileExists(config)) continue;
    const servers = (deps.readJson(config) as { mcpServers?: Record<string, { command?: string }> } | null)?.mcpServers;
    if (typeof servers !== "object" || servers === null) continue;

    for (const [name, server] of Object.entries(servers)) {
      const command = typeof server?.command === "string" ? server.command : "";
      if (isOurCommand(command, opts.execPath)) {
        ops.push({ action: "remove-mcp-server", path: config, name });
      } else {
        ops.push({
          action: "report-kept",
          // The key, not the file: the file is not going anywhere and saying
          // otherwise would be alarming for no reason.
          path: `${config}#${name}`,
          reason: `MCP server ariadnev cannot prove it added (runs "${command}")`,
        });
      }
    }
  }
  return ops;
}

/**
 * Does this MCP server run the binary we are removing?
 *
 * Matched on the executable's own path and on the two names the installers
 * write. A bare `av` or `ariadnev` resolved through PATH is ours by the same
 * reasoning the binary pass uses — those names belong to this tool, and the
 * installer refuses to create either one over something else.
 */
function isOurCommand(command: string, execPath: string): boolean {
  if (command === "") return false;
  if (command === execPath) return true;
  const base = command.split(/[\\/]/).pop() ?? "";
  return base === "av" || base === "ariadnev" || base === "av.exe" || base === "ariadnev.exe";
}

/**
 * The state directory, checked against the layout it is supposed to have.
 *
 * An unrecognised entry does not abort the purge. Refusing to finish because
 * one stray file turned up would make the command fail precisely on the
 * machines that most need it; keeping that entry and naming it costs nothing
 * and loses nothing.
 */
function planState(deps: PurgePlanDeps, root: string): UninstallOp[] {
  const dir = stateRoot(root);
  if (!deps.fileExists(dir)) return [];

  const { owned, unknown } = classifyStateEntries(deps.listEntries(dir));
  const ops: UninstallOp[] = unknown.map((entry) => ({
    action: "report-kept" as const,
    path: join(dir, entry),
    reason: "not part of ariadnev's state layout",
  }));

  if (owned.length === 0) return ops;
  // Whole directory when nothing foreign is in it, entry by entry otherwise —
  // so a stray file keeps its parent alive instead of being swept up with it.
  if (unknown.length === 0) {
    ops.push({ action: "remove-tree", path: dir, reason: "ariadnev state directory" });
  } else {
    for (const entry of owned) {
      ops.push({ action: "remove-tree", path: join(dir, entry), reason: "ariadnev state" });
    }
  }
  return ops;
}

/**
 * The executable and its alias.
 *
 * The path comes from `process.execPath`, never from a guessed default: the
 * binary running this is by definition the one the user wants gone, whatever
 * `ARIADNEV_INSTALL_DIR` was set to when they installed it.
 *
 * The alias rule mirrors install.sh's exactly — "never clobber a pre-existing
 * different `av`" is the same sentence in both directions. On POSIX ours is a
 * symlink to `ariadnev`; install.ps1 makes a copy instead, so a byte-identical
 * file counts too.
 *
 * Windows gets a report and no deletion: a running executable cannot be
 * unlinked there, and a purge that claimed otherwise would be reporting a
 * success it did not achieve.
 */
function planBinary(deps: PurgePlanDeps, opts: PurgePlanOpts): UninstallOp[] {
  const exec = opts.execPath;
  if (!deps.fileExists(exec)) return [];

  const isWindows = deps.platform === "win32";
  const alias = join(dirname(exec), isWindows ? "av.exe" : "av");

  const ops: UninstallOp[] = [];
  if (isWindows) {
    ops.push({ action: "report-kept", path: exec, reason: "Windows cannot unlink a running executable — delete it manually" });
    if (deps.fileExists(alias)) {
      ops.push({ action: "report-kept", path: alias, reason: "Windows cannot unlink a running executable — delete it manually" });
    }
    return ops;
  }

  if (deps.fileExists(alias)) {
    const link = deps.readLinkTarget(alias);
    const ours = link !== null ? link === "ariadnev" || link === exec : deps.sameContent(alias, exec);
    if (ours) ops.push({ action: "remove-binary", path: alias });
    else ops.push({ action: "report-kept", path: alias, reason: "an 'av' that is not ariadnev's — left alone, as the installer leaves it" });
  }
  // After the alias: on POSIX the alias is a symlink to this file, and removing
  // the target first would leave a dangling link for the moment in between.
  ops.push({ action: "remove-binary", path: exec });
  return ops;
}
