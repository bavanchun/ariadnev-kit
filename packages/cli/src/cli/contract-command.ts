// `ariadnev contract` — emit the provider×artifact capability contract. Machine
// surface (`--json`) for the edge/consumers, or the human Markdown matrix. Built
// from the same source as the installer, so it always reflects real behavior.

import {
  buildProviderMatrix,
  matrixToMarkdown,
  matrixToTerminal,
  matrixToJSON,
} from "../providers/provider-matrix.js";

export interface ContractOpts {
  json?: boolean;
  version: string;
  /** When true (an interactive TTY), render the branded terminal grid instead
   * of Markdown. Piped output stays Markdown so it pastes into README/docs. */
  color?: boolean;
}

export interface ContractResult {
  output: string;
}

// Bump when the `--json` envelope shape changes incompatibly.
export const PROTOCOL_VERSION = "2";

// A curated list of stable capability tokens a machine consumer can feature-gate
// on. NOT auto-derived — there is no capability registry — so a guard test
// (contract-command.test.ts) asserts KNOWN_COMMANDS stays in sync with the real
// command surface, forcing a conscious review whenever a command is added.
export const CAPABILITIES = [
  "providers.matrix.v1",
  "install.receipt.v1",
  "doctor.audit.v1",
  "audit.files.v1",
  "audit.scripts.v1",
  "skill.env.v1",
  "eval.tier1.v1",
  "contract.envelope.v1",
  "update.selfupdate.v1",
  "backups.restore.v1",
  // Reading a backup rather than acting on it. Separate from
  // `backups.restore.v1` because it depends on manifest v2 recording a digest —
  // a client that finds only `backups.restore.v1` is talking to a build whose
  // `verify` cannot answer.
  "backups.verify.v1",
  // An advisory lock serializing mutating commands, and the command that clears
  // a leaked one. A client that does not find this is talking to a build where
  // two installs can interleave.
  "lifecycle.lock.v1",
  "history.query.v1",
  "graph.run.v1",
  "telemetry.optout.v1",
  "config.prefs.v1",
  "plan.pointer.v1",
  "kit.paths.v1",
  "mcp.verify.v1",
  "adapters.project.v1",
  "plan.files.v1",
  "journal.entries.v1",
  // How far this build is through the upstream-2.14.0 parity program. A client
  // that does not find this is talking to a build from before the program
  // started, and should assume nothing about which commands exist.
  "parity.progress.v1",
] as const;

// Progress against the captured upstream 2.14.0 surface.
//
// Constants rather than a read of `parity-manifest.json`: the manifest sits at
// the repository root and the shipped binary has no repository. `KNOWN_COMMANDS`
// below is kept honest the same way, and `parity-ratchet.test.ts` fails if any
// of these four numbers drifts from the manifest or from the live surface — so
// the manifest stays the single source of truth and this stays a projection of
// it rather than a second opinion.
export const PARITY = {
  upstreamVersion: "2.14.0",
  /** Names in the captured surface this project intends to expose. */
  inScope: 36,
  /** Of those, the ones Commander registers today. */
  registered: 22,
  /** The gap. Monotonically decreasing; zero is the phase 13 exit condition. */
  missing: 14,
} as const;

// Every command name registered in buildProgram(). The guard test fails if the
// real surface drifts from this list — the signal to revisit CAPABILITIES.
export const KNOWN_COMMANDS = [
  "activity",
  "sessions",
  "analytics",
  "data",
  "install",
  "uninstall",
  "init",
  "new",
  "projects",
  "setup",
  "doctor",
  "audit",
  "skill",
  "backups",
  "recover",
  "unlock",
  "update",
  "validate",
  "contract",
  "eval",
  "query",
  "telemetry",
  "list",
  "add-skill",
  "migrate",
  "workflow",
  // Deprecated spelling of `workflow`, removed in 1.4.0. Registered, so it
  // belongs here — the guard tracks the surface as it is, not as it should be.
  "run",
  "config",
  "plan",
  "journal",
  "kit",
  "mcp",
  "adapters",
] as const;

export function runContract(opts: ContractOpts): ContractResult {
  const data = buildProviderMatrix();
  if (opts.json) {
    // Additive envelope: legacy `version` is preserved alongside the new
    // machine-discovery fields so existing consumers never break.
    return {
      output: JSON.stringify(
        {
          protocol_version: PROTOCOL_VERSION,
          version: opts.version,
          cli_version: opts.version,
          capabilities: [...CAPABILITIES],
          schema: { min: 1, max: 1 },
          parity: { ...PARITY },
          providers: matrixToJSON(data),
        },
        null,
        2,
      ),
    };
  }
  if (opts.color) return { output: matrixToTerminal(data, { color: true }) };
  return { output: matrixToMarkdown(data) };
}
