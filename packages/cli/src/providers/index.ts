import { type ProviderId } from "./spec-verified.js";
import { makeResolver, type ProviderResolver } from "./resolver.js";

export const PROVIDER_IDS: ProviderId[] = [
  "claude-code",
  "codex",
  "cursor",
  "antigravity",
  "opencode",
  "generic",
  "test-provider",
];

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
