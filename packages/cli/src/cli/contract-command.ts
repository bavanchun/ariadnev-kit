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
  "eval.tier1.v1",
  "contract.envelope.v1",
  "update.selfupdate.v1",
  "backups.restore.v1",
  "history.query.v1",
  "graph.run.v1",
  "telemetry.optout.v1",
] as const;

// Every command name registered in buildProgram(). The guard test fails if the
// real surface drifts from this list — the signal to revisit CAPABILITIES.
export const KNOWN_COMMANDS = [
  "install",
  "uninstall",
  "doctor",
  "backups",
  "update",
  "validate",
  "contract",
  "eval",
  "query",
  "telemetry",
  "list",
  "add-skill",
  "migrate",
  "run",
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
