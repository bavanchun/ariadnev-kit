// Pure-ish uninstall planner: given a parsed receipt and injected fs reads,
// decide exactly what to remove/preserve/unmerge. No writes happen here —
// uninstall-execute.ts applies the plan this produces.
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  fromPortablePath,
  SUPPORTED_RECEIPT_SCHEMA_VERSIONS,
  type Receipt,
} from "../install/install-receipt.js";
import type { ProviderId } from "../providers/spec-verified.js";
import type { HookBinding } from "../install/hook-settings-merge.js";
import { CLAUDE_SETTINGS_FILE } from "../adapt/paths.js";

export class UninstallPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UninstallPlanError";
  }
}

export interface RemoveFileOp {
  action: "remove-file";
  path: string;
}

export interface PreserveFileOp {
  action: "preserve-file";
  path: string;
  reason: string;
}

export interface UnmergeSettingsOp {
  action: "unmerge-settings";
  path: string;
  bindings: HookBinding[];
}

export interface RemoveAgentsBlockOp {
  action: "remove-agents-block";
  path: string;
}

export type UninstallOp = RemoveFileOp | PreserveFileOp | UnmergeSettingsOp | RemoveAgentsBlockOp;

export interface PlanUninstallDeps {
  fileExists(absPath: string): boolean;
  readFileContent(absPath: string): string;
}

function scopeRoot(scope: "project" | "global", home: string, cwd: string): string {
  return scope === "global" ? home : cwd;
}

/**
 * Build the uninstall plan for one provider from its receipt record. Files
 * whose current content hash no longer matches the recorded hash (the user
 * edited them since install) are preserved, never removed — the same
 * ownership guarantee ck's "modified files are preserved" gives, made
 * explicit and test-provable via content hash instead of an opaque check.
 */
export function planUninstall(
  receipt: Receipt,
  providerId: ProviderId,
  home: string,
  cwd: string,
  deps: PlanUninstallDeps,
): UninstallOp[] {
  if (!SUPPORTED_RECEIPT_SCHEMA_VERSIONS.includes(receipt.schemaVersion)) {
    throw new UninstallPlanError(
      `unsupported receipt schemaVersion ${receipt.schemaVersion} ` +
        `(supported: ${SUPPORTED_RECEIPT_SCHEMA_VERSIONS.join(", ")}) — refusing to uninstall`,
    );
  }

  const install = receipt.installs[providerId];
  if (!install) return [];

  const ops: UninstallOp[] = [];
  const root = scopeRoot(install.scope, home, cwd);

  for (const file of install.files) {
    const abs = fromPortablePath(file.path, home, cwd);
    if (!deps.fileExists(abs)) continue; // already gone — nothing to do
    const currentHash = createHash("sha256").update(deps.readFileContent(abs)).digest("hex");
    if (currentHash === file.sha256) {
      ops.push({ action: "remove-file", path: abs });
    } else {
      ops.push({ action: "preserve-file", path: abs, reason: "modified since install — not removed" });
    }
  }

  const applied = install.hookBindings.filter((b) => b.applied);
  if (applied.length > 0) {
    ops.push({
      action: "unmerge-settings",
      path: join(root, CLAUDE_SETTINGS_FILE),
      bindings: applied.map(({ event, matcher, command }) => ({ event, matcher, command })),
    });
  }

  if (install.agentsMdManaged) {
    ops.push({ action: "remove-agents-block", path: join(root, "AGENTS.md") });
  }

  return ops;
}
