import { SPEC_VERIFIED, type ProviderId } from "./spec-verified.js";
import { makeResolver, type ProviderResolver } from "./resolver.js";

/**
 * Every provider, read off the verification table rather than listed again.
 *
 * This was a hand-kept array, and being an array is exactly why it could drift:
 * `ProviderId[]` is satisfied by a list missing half its members, so adding a
 * provider to the union compiled cleanly and left `getResolver` returning
 * `undefined` for it — a crash at the call site rather than an error at the
 * definition. Every other provider map in the codebase is a `Record<ProviderId,
 * …>` and the compiler catches a gap; this one had no such check, so it takes
 * its members from the table that does.
 *
 * Order follows the table's declaration order, which is the order prompts and
 * the README matrix present.
 */
export const PROVIDER_IDS: ProviderId[] = Object.keys(SPEC_VERIFIED) as ProviderId[];

/** Provider IDs shown in interactive prompts (excludes internal/mock providers). */
export const USER_FACING_PROVIDER_IDS: ProviderId[] = PROVIDER_IDS.filter(
  (id) => id !== "test-provider",
);

const REGISTRY: Record<ProviderId, ProviderResolver> = Object.fromEntries(
  PROVIDER_IDS.map((id) => [id, makeResolver(id)]),
) as Record<ProviderId, ProviderResolver>;

export function getResolver(id: ProviderId): ProviderResolver {
  return REGISTRY[id];
}

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as string[]).includes(value);
}

export type { ProviderResolver, Scope, ResolverCtx } from "./resolver.js";
export { type ProviderId } from "./spec-verified.js";
