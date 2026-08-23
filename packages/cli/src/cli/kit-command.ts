// `ariadnev kit install-path|refresh` — where the kit goes, and where it comes
// from.
//
// Two subcommands, not the three the upstream group had. `repair-install-mode`
// repaired a choice between install modes that this CLI does not have: there is
// one install path per (provider, artifact), decided by the verification table.
// Porting the command would mean inventing the concept it repairs, and the
// honest version of it would print "nothing to repair" forever.
//
// `validate` is deliberately absent too — `ariadnev validate` already exists at
// the top level, and two spellings of one command is how they drift apart.

import { rmSync } from "node:fs";
import { jsonEnvelope } from "./json-envelope.js";
import { cacheRoot, materializeEmbeddedKit } from "../kit/embedded-kit.js";
import { EXIT, UsageError, type ExitCode } from "./exit-codes.js";
import { MATRIX_PROVIDERS } from "../providers/provider-matrix.js";
import { targetPathFor, type ResolverCtx } from "../providers/resolver.js";
import { isVerified, type ArtifactKind, type ProviderId } from "../providers/spec-verified.js";

export const KIT_SCHEMA_VERSION = 1;

const KINDS: ArtifactKind[] = ["skill", "agent", "command", "rules", "scripts", "env", "hook", "outputStyle"];

export interface KitResult {
  output: string;
  exitCode: ExitCode;
}

export interface KitPathOpts {
  provider: string;
  home: string;
  cwd: string;
  scope: "project" | "global";
  json?: boolean;
}

function envelope(kind: string, data: unknown): string {
  return jsonEnvelope(KIT_SCHEMA_VERSION, kind, data);
}

/**
 * Where each artifact kind would be written for one provider — including the
 * kinds that would be skipped, which is usually the question being asked.
 */
export function runKitInstallPath(opts: KitPathOpts): KitResult {
  if (!(MATRIX_PROVIDERS as readonly string[]).includes(opts.provider)) {
    throw new UsageError(`unknown provider "${opts.provider}" (expected ${MATRIX_PROVIDERS.join(", ")})`);
  }
  const provider = opts.provider as ProviderId;
  const ctx: ResolverCtx = { home: opts.home, cwd: opts.cwd, scope: opts.scope };

  const rows = KINDS.map((kind) => ({
    kind,
    verified: isVerified(provider, kind),
    path: targetPathFor(provider, kind, ctx),
  }));

  if (opts.json) return { output: envelope("kit.install-path", { provider, scope: opts.scope, targets: rows }), exitCode: EXIT.ok };

  const lines = [`ariadnev kit install-path — ${provider} (${opts.scope})`];
  const width = Math.max(...rows.map((r) => r.kind.length));
  for (const row of rows) {
    lines.push(`  ${row.kind.padEnd(width)}  ${row.path ?? "(skipped — not verified for this provider)"}`);
  }
  return { output: lines.join("\n"), exitCode: EXIT.ok };
}

export interface KitRefreshOpts {
  json?: boolean;
  dryRun?: boolean;
}

/**
 * Discard the extracted kit cache and extract it again.
 *
 * The cache directory is stamped with the build's version and digest, so a stale
 * cache is normally impossible — this exists for the case the stamp cannot
 * catch: a cache someone edited in place, where the digest still matches the
 * build it came from.
 */
export function runKitRefresh(opts: KitRefreshOpts = {}): KitResult {
  const root = cacheRoot();
  if (opts.dryRun) {
    const data = { root, removed: false, dryRun: true };
    return { output: opts.json ? envelope("kit.refresh", data) : `ariadnev kit refresh — would re-extract ${root}`, exitCode: EXIT.ok };
  }
  rmSync(root, { recursive: true, force: true });
  const kitRoot = materializeEmbeddedKit();
  const data = { root, kitRoot, removed: true };
  return {
    output: opts.json ? envelope("kit.refresh", data) : `ariadnev kit refresh — re-extracted ${kitRoot}`,
    exitCode: EXIT.ok,
  };
}
