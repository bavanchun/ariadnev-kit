import { join } from "node:path";
import type { Artifact } from "../kit/kit-types.js";
import {
  type ProviderId,
  type ArtifactKind,
  isVerified,
} from "./spec-verified.js";

export type Scope = "project" | "global";

export interface ResolverCtx {
  home: string;
  cwd: string;
  scope: Scope;
}

export type RulesMode = "dir" | "mdc" | "agents-md";

export interface ProviderResolver {
  id: ProviderId;
  supports: Record<ArtifactKind, boolean>;
  rulesMode: RulesMode;
  /** Absolute target path for an artifact, or null when unverified → skip. */
  targetFor(artifact: Artifact, ctx: ResolverCtx): string | null;
  /** Absolute scripts dir target. */
  scriptsTarget(ctx: ResolverCtx): string;
  /** Absolute env-example target. */
  envTarget(ctx: ResolverCtx): string;
  /** Root dir under which AGENTS.md lives (when rulesMode === 'agents-md'). */
  agentsMdRoot(ctx: ResolverCtx): string;
}

interface ProviderConfig {
  rulesMode: RulesMode;
  /** Resolve the base root for a given artifact kind. */
  base(kind: ArtifactKind, ctx: ResolverCtx): string;
  skillDir: string; // e.g. ".claude/skills" | ".agents/skills" | ".opencode/skills"
  agentPath: ((name: string) => string) | null; // relative; null => unsupported
  commandPath: ((name: string) => string) | null;
  rulePath: ((name: string) => string) | null; // for dir/mdc modes
  scriptsDir: string;
  envFile: string;
}

function pickBase(ctx: ResolverCtx): string {
  return ctx.scope === "global" ? ctx.home : ctx.cwd;
}

// Codex installs to the user home regardless of scope (claudekit parity).
function codexBase(kind: ArtifactKind, ctx: ResolverCtx): string {
  if (kind === "rules") return pickBase(ctx); // AGENTS.md lives at project/home root
  return ctx.home;
}

const CONFIGS: Record<ProviderId, ProviderConfig> = {
  "claude-code": {
    rulesMode: "dir",
    base: (_k, ctx) => pickBase(ctx),
    skillDir: ".claude/skills",
    agentPath: (n) => `.claude/agents/${n}.md`,
    commandPath: (n) => `.claude/commands/${n}.md`,
    rulePath: (n) => `.claude/rules/${n}.md`,
    scriptsDir: ".claude/scripts",
    envFile: ".claude/.env.example",
  },
  codex: {
    rulesMode: "agents-md",
    base: codexBase,
    skillDir: ".agents/skills",
    agentPath: (n) => `.codex/agents/${n}.toml`,
    commandPath: (n) => `.codex/commands/${n}.md`,
    rulePath: null,
    scriptsDir: ".agents/vcskill/scripts",
    envFile: ".agents/vcskill/.env.example",
  },
  cursor: {
    rulesMode: "mdc",
    base: (_k, ctx) => pickBase(ctx),
    skillDir: ".agents/skills",
    agentPath: (n) => `.agents/skills/${n}`, // shim: agent installed as skill-like dir
    commandPath: (n) => `.cursor/commands/${n}.md`,
    rulePath: (n) => `.cursor/rules/${n}.mdc`,
    scriptsDir: ".agents/scripts",
    envFile: ".agents/.env.example",
  },
  antigravity: {
    rulesMode: "agents-md",
    base: (_k, ctx) => pickBase(ctx),
    skillDir: ".agents/skills",
    agentPath: null, // unverified → skip
    commandPath: null,
    rulePath: null,
    scriptsDir: ".agents/scripts",
    envFile: ".agents/.env.example",
  },
  opencode: {
    rulesMode: "agents-md",
    base: (_k, ctx) => pickBase(ctx),
    skillDir: ".opencode/skills",
    agentPath: (n) => `.opencode/agents/${n}.md`,
    commandPath: (n) => `.opencode/commands/${n}.md`,
    rulePath: null,
    scriptsDir: ".opencode/scripts",
    envFile: ".opencode/.env.example",
  },
  generic: {
    rulesMode: "agents-md",
    base: (_k, ctx) => pickBase(ctx),
    skillDir: ".agents/skills",
    agentPath: null,
    commandPath: null,
    rulePath: null,
    scriptsDir: ".agents/scripts",
    envFile: ".agents/.env.example",
  },
};

const KIND_OF: Record<Artifact["type"], ArtifactKind> = {
  skill: "skill",
  agent: "agent",
  command: "command",
  rule: "rules",
};

export function makeResolver(id: ProviderId): ProviderResolver {
  const cfg = CONFIGS[id];
  return {
    id,
    rulesMode: cfg.rulesMode,
    supports: {
      skill: isVerified(id, "skill"),
      agent: isVerified(id, "agent") && cfg.agentPath !== null,
      command: isVerified(id, "command") && cfg.commandPath !== null,
      rules: isVerified(id, "rules"),
      scripts: isVerified(id, "scripts"),
      env: isVerified(id, "env"),
    },
    targetFor(artifact, ctx) {
      const kind = KIND_OF[artifact.type];
      if (!isVerified(id, kind)) return null;
      const base = cfg.base(kind, ctx);
      if (artifact.type === "skill") return join(base, cfg.skillDir, artifact.name);
      if (artifact.type === "agent") return cfg.agentPath ? join(base, cfg.agentPath(artifact.name)) : null;
      if (artifact.type === "command") return cfg.commandPath ? join(base, cfg.commandPath(artifact.name)) : null;
      // rule
      if (cfg.rulesMode === "agents-md") return null; // merged separately
      return cfg.rulePath ? join(base, cfg.rulePath(artifact.name)) : null;
    },
    scriptsTarget(ctx) {
      return join(cfg.base("scripts", ctx), cfg.scriptsDir);
    },
    envTarget(ctx) {
      return join(cfg.base("env", ctx), cfg.envFile);
    },
    agentsMdRoot(ctx) {
      return pickBase(ctx);
    },
  };
}
