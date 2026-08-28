// Installing or removing one artifact, by reusing the whole-kit install path.
//
// WHY A PROJECTION AND NOT A SECOND WRITER. `planInstall` already knows where
// every artifact goes for every provider, refuses to guess an unverified cell,
// writes atomically, and backs up what it replaces. A per-artifact writer would
// be a second implementation of all of that, and the two would drift on exactly
// the details that are hard to notice: which provider skips what, where backups
// land, what the receipt says afterwards.
//
// So a single-artifact install plans a *kit that contains one artifact*. The
// path, the guard, the backup and the atomic write are the same code as a full
// install, because they are the same call.

import type { Kit } from "../kit/kit-types.js";
import type { InstallOp } from "../install/install-types.js";
import { planInstall } from "../install/install-plan.js";
import type { ProviderResolver, ResolverCtx } from "../providers/resolver.js";
import { UsageError } from "../cli/exit-codes.js";
import { artifactsOf, type CatalogKind } from "./catalog-entries.js";

/**
 * A kit holding one artifact and nothing else.
 *
 * Every other collection is emptied rather than left alone, so planning cannot
 * pick up a rule, a hook or the scripts tree along the way. `av skills install
 * scout` writes one skill; anything more is a surprise the user did not ask
 * for and would have to undo by hand.
 */
export function projectSingleArtifact(kit: Kit, kind: CatalogKind, name: string): Kit {
  const artifact = artifactsOf(kit, kind).find((candidate) => candidate.name === name);
  if (!artifact) {
    const available = artifactsOf(kit, kind).map((a) => a.name);
    const near = available.filter((n) => n.includes(name) || name.includes(n)).slice(0, 3);
    throw new UsageError(
      `no ${kind} named ${JSON.stringify(name)} in the kit` +
        (near.length > 0 ? ` — did you mean: ${near.join(", ")}?` : ""),
    );
  }
  return {
    ...kit,
    skills: kind === "skill" ? [artifact] : [],
    agents: kind === "agent" ? [artifact] : [],
    commands: kind === "command" ? [artifact] : [],
    outputStyles: [],
    rules: [],
    hooks: [],
    workflows: [],
    scriptsDir: null,
    envExample: null,
    ...(kit.statusline ? { statusline: undefined } : {}),
  } as Kit;
}

/** The ops a single-artifact install would perform for one provider. */
export function planSingleArtifact(
  kit: Kit,
  kind: CatalogKind,
  name: string,
  resolver: ProviderResolver,
  ctx: ResolverCtx,
): InstallOp[] {
  return planInstall(projectSingleArtifact(kit, kind, name), resolver, ctx);
}

/**
 * The absolute paths a single-artifact install owns, for one provider.
 *
 * Removal deletes exactly what the same plan would write, rather than matching
 * the receipt by name. The receipt records files, not what produced them, so a
 * name match there is a guess — and a guess about which files to delete is the
 * one kind of guess this codebase should never make.
 */
export function ownedPaths(
  kit: Kit,
  kind: CatalogKind,
  name: string,
  resolver: ProviderResolver,
  ctx: ResolverCtx,
): string[] {
  return planSingleArtifact(kit, kind, name, resolver, ctx)
    .filter((op): op is Extract<InstallOp, { action: "write" }> => op.action === "write")
    .map((op) => op.dest);
}
