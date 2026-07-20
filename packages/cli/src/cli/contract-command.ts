// `vcskill contract` — emit the provider×artifact capability contract. Machine
// surface (`--json`) for the edge/consumers, or the human Markdown matrix. Built
// from the same source as the installer, so it always reflects real behavior.

import { buildProviderMatrix, matrixToMarkdown, matrixToJSON } from "../providers/provider-matrix.js";

export interface ContractOpts {
  json?: boolean;
  version: string;
}

export interface ContractResult {
  output: string;
}

export function runContract(opts: ContractOpts): ContractResult {
  const data = buildProviderMatrix();
  if (opts.json) {
    return {
      output: JSON.stringify({ version: opts.version, providers: matrixToJSON(data) }, null, 2),
    };
  }
  return { output: matrixToMarkdown(data) };
}
