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

// Codex installs to the user home regardless of scope (reference parity).
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
  "test-provider": {
    rulesMode: "dir",
    base: (_k, ctx) => pickBase(ctx),
    skillDir: ".test-provider/skills",
    agentPath: null, // intentionally unverified for guide demo
    commandPath: (n) => `.test-provider/commands/${n}.md`,
    rulePath: (n) => `.test-provider/rules/${n}.md`,
    scriptsDir: ".test-provider/scripts",
    envFile: ".test-provider/.env.example",
  },
};

const KIND_OF: Record<Artifact["type"], ArtifactKind> = {
  skill: "skill",
  agent: "agent",
  command: "command",
  rule: "rules",
};

// Display-path sentinels: stand in for the home/cwd roots so a resolved target
// can be rendered as a scope-relative template (`~/…` for home, bare for cwd).
const HOME_SENTINEL = "H";
const CWD_SENTINEL = "C";

function toTemplate(resolved: string): string {
  if (resolved.startsWith(HOME_SENTINEL)) {
    return "~/" + resolved.slice(HOME_SENTINEL.length).replace(/^[/\\]+/, "");
  }
  if (resolved.startsWith(CWD_SENTINEL)) {
    return resolved.slice(CWD_SENTINEL.length).replace(/^[/\\]+/, "") || ".";
  }
  return resolved;
}

/**
 * Human-readable target-path template for one (provider, artifact) cell, or null
 * when unverified/unsupported (→ skip). Single-sources the same CONFIGS/resolver
 * the installer uses, so the docs matrix + `contract` can never drift from real
 * install behavior. Rules in AGENTS.md mode render as "AGENTS.md".
 */
export function targetTemplate(id: ProviderId, kind: ArtifactKind): string | null {
  const r = makeResolver(id);
  const ctx: ResolverCtx = { home: HOME_SENTINEL, cwd: CWD_SENTINEL, scope: "project" };
  const mk = (type: Artifact["type"], name: string) =>
    r.targetFor({ type, name } as Artifact, ctx);
  const dir = (p: string) => (p.endsWith("/") ? p : p + "/");
  switch (kind) {
    case "skill":
      return r.supports.skill ? dir(toTemplate(mk("skill", "") ?? "")) : null;
    case "agent": {
      const p = mk("agent", "*");
      return p ? toTemplate(p) : null;
    }
    case "command": {
      const p = mk("command", "*");
      return p ? toTemplate(p) : null;
    }
    case "rules":
      if (!r.supports.rules) return null;
      if (r.rulesMode === "agents-md") return "AGENTS.md";
      {
        const p = mk("rule", "*");
        return p ? toTemplate(p) : null;
      }
    case "scripts":
      return r.supports.scripts ? dir(toTemplate(r.scriptsTarget(ctx))) : null;
    case "env":
      return r.supports.env ? toTemplate(r.envTarget(ctx)) : null;
    case "hook":
      return r.supports.hook ? ".claude/hooks/vc/*.cjs" : null;
  }
}

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
      hook: isVerified(id, "hook"),
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
