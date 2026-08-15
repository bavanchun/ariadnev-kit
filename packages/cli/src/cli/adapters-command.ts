// `ariadnev adapters regenerate` — rebuild the adapter artifacts from the
// receipt.
//
// A repair, not a rewrite: the generator is deterministic, so what this writes
// is byte-identical to what the install wrote. It exists for the case where the
// files were deleted or edited — and because they are a projection, "regenerate"
// is always the right answer to a discrepancy, never "reconcile".

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Receipt } from "../install/install-receipt.js";
import type { ProviderId } from "../providers/spec-verified.js";
import { adapterDir, readAdapterArtifact, writeAdapterArtifacts } from "../adapters/write-adapter-artifacts.js";
import { buildAdapterArtifacts } from "../adapters/adapter-artifacts.js";
import { fromPortablePath } from "../install/install-receipt.js";
import { EXIT, UnavailableError, type ExitCode } from "./exit-codes.js";

export const ADAPTERS_SCHEMA_VERSION = 1;

export interface AdaptersOpts {
  home: string;
  cwd: string;
  scope: "project" | "global";
  kitVersion: string;
  json?: boolean;
  dryRun?: boolean;
}

export interface AdaptersResult {
  output: string;
  exitCode: ExitCode;
}

function receiptPath(opts: AdaptersOpts): string {
  return join(opts.scope === "global" ? opts.home : opts.cwd, ".ariadnev", "receipt.json");
}

export function runAdaptersRegenerate(opts: AdaptersOpts): AdaptersResult {
  const path = receiptPath(opts);
  if (!existsSync(path)) {
    // No receipt means nothing was installed from here, so there is nothing to
    // project. Saying that is more useful than writing five empty files.
    throw new UnavailableError(`no install receipt at ${path} — nothing to regenerate`);
  }
  const receipt = JSON.parse(readFileSync(path, "utf8")) as Receipt;
  const providers = Object.keys(receipt.installs) as ProviderId[];

  const results: { provider: string; dir: string; files: number; changed: string[] }[] = [];
  for (const provider of providers) {
    const expected = buildAdapterArtifacts({
      receipt,
      provider,
      kit: "engineer",
      kitVersion: opts.kitVersion,
      resolvePath: (portable) => fromPortablePath(portable, opts.home, opts.cwd),
    });
    const changed = Object.entries(expected)
      .filter(([name, content]) => readAdapterArtifact(provider, name, opts.home) !== content)
      .map(([name]) => name);
    if (!opts.dryRun) {
      writeAdapterArtifacts({
        receipt,
        provider,
        kit: "engineer",
        kitVersion: opts.kitVersion,
        home: opts.home,
        cwd: opts.cwd,
      });
    }
    results.push({ provider, dir: adapterDir(provider, opts.home), files: Object.keys(expected).length, changed });
  }

  if (opts.json) {
    return {
      output: JSON.stringify({ schema_version: ADAPTERS_SCHEMA_VERSION, kind: "adapters.regenerate", data: { results } }, null, 2),
      exitCode: EXIT.ok,
    };
  }
  const lines = [`ariadnev adapters regenerate${opts.dryRun ? " (dry run)" : ""}`];
  for (const result of results) {
    const detail = result.changed.length === 0 ? "already up to date" : `${result.changed.length} rewritten`;
    lines.push(`  ${result.provider}: ${result.files} file(s) in ${result.dir} — ${detail}`);
  }
  if (results.length === 0) lines.push("  the receipt records no provider install");
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}
