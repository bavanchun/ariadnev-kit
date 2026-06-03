// Phase 0 gate table. Per-provider verification flags for paths + tool-names.
// Consumed by Phase 3 resolvers: any cell `false` => installer SKIPS + logs,
// never guesses. Verified against the shipped claudekit-engineer generators
// (scripts/codex_generator*.py, scripts/generate-opencode.py).

export type ProviderId =
  | "claude-code"
  | "codex"
  | "cursor"
  | "antigravity"
  | "opencode"
  | "generic";

export type ArtifactKind = "skill" | "agent" | "command" | "rules" | "scripts" | "env";

export interface ProviderVerification {
  /** Per-artifact target-path verification. false => skip-with-log. */
  paths: Record<ArtifactKind, boolean>;
  /** Whether the tool-name rewrite table for this provider is verified. */
  toolNames: boolean;
  /** Source of the verification claim. */
  source: string;
}

export const SPEC_VERIFIED: Record<ProviderId, ProviderVerification> = {
  "claude-code": {
    paths: { skill: true, agent: true, command: true, rules: true, scripts: true, env: true },
    toolNames: true, // identity — canonical format
    source: "canonical Claude Agent Skills spec",
  },
  codex: {
    paths: { skill: true, agent: true, command: true, rules: true, scripts: true, env: true },
    toolNames: true, // full table from claudekit adapt_content()
    source: "claudekit codex_generator_common.py::adapt_content + codex_generator.py",
  },
  cursor: {
    paths: { skill: true, agent: true, command: true, rules: true, scripts: true, env: true },
    toolNames: false, // no verified equivalents — identity + footer
    source: "cursor .agents/skills + .cursor/{commands,rules}; tool table unverified",
  },
  antigravity: {
    paths: { skill: true, agent: false, command: false, rules: true, scripts: true, env: true },
    toolNames: false,
    source: "antigravity .agents/skills verified; agents/commands paths unverified",
  },
  opencode: {
    paths: { skill: true, agent: true, command: true, rules: true, scripts: true, env: true },
    toolNames: false, // generator rewrites paths only — tool-names identity
    source: "claudekit generate-opencode.py (plural dirs)",
  },
  generic: {
    paths: { skill: true, agent: false, command: false, rules: true, scripts: true, env: true },
    toolNames: false,
    source: "neutral .agents/ layout; agents/commands have no generic target",
  },
};

export function isVerified(provider: ProviderId, artifact: ArtifactKind): boolean {
  return SPEC_VERIFIED[provider].paths[artifact];
}
