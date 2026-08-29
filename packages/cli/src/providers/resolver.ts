import { join } from "node:path";
import type { Artifact } from "../kit/kit-types.js";
import {
  type ProviderId,
  type ArtifactKind,
  isVerified,
} from "./spec-verified.js";
import { CLAUDE_HOOKS_DIR, installedSkillDirName } from "../adapt/paths.js";

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
  /** Relative output-style path; null => this provider has no verified target. */
  outputStylePath: ((name: string) => string) | null;
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
    // Observed on disk under ~/.claude/output-styles/. The matrix cell stays
    // false until it is verified for real, so this path is not used yet.
    outputStylePath: (n) => `.claude/output-styles/${n}.md`,
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
    outputStylePath: null,
    rulePath: null,
    scriptsDir: ".agents/ariadnev/scripts",
    envFile: ".agents/ariadnev/.env.example",
  },
  cursor: {
    rulesMode: "mdc",
    base: (_k, ctx) => pickBase(ctx),
    skillDir: ".agents/skills",
    // Shim: an agent installed as a skill-like dir, in the *same* shared root
    // the skills go to. It takes the same namespace prefix for the same reason
    // — an unprefixed `advisor/` here is indistinguishable from a third-party
    // skill of that name. Safe because no kit agent shares a name with a kit
    // skill, which `resolver.test.ts` holds.
    agentPath: (n) => `.agents/skills/${installedSkillDirName(n)}`,
    commandPath: (n) => `.cursor/commands/${n}.md`,
    outputStylePath: null,
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
    outputStylePath: null,
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
    outputStylePath: null,
    rulePath: null,
    scriptsDir: ".opencode/scripts",
    envFile: ".opencode/.env.example",
  },
  omp: {
    // `.agents/skills`, NOT `~/.omp/agent/skills`. The upstream CLI writes the
    // latter, but omp's own runtime docs call `~/.omp/agent` the session-storage
    // directory and name `.agent[s]/skills` as the canonical native location —
    // the only skills path under `agent/` is `managed-skills`, the auto-learn
    // bucket that defers to authored skills. Both directories exist on the
    // observation machine, so copying the upstream path would have looked right.
    rulesMode: "agents-md",
    base: (_k, ctx) => pickBase(ctx),
    skillDir: ".agents/skills",
    // Same skill-shaped shim as cursor, in the same shared root, for the same
    // reason: omp discovers one level under `skills/` and nothing else.
    agentPath: (n) => `.agents/skills/${installedSkillDirName(n)}`,
    commandPath: null,
    outputStylePath: null,
    rulePath: null,
    scriptsDir: ".agents/scripts",
    envFile: ".agents/.env.example",
  },
  grok: {
    // Claude-shaped, because that is what `~/.grok/` actually holds:
    // {agents,hooks,rules,skills} laid out exactly as claude-code's tree. No
    // binary here to observe a load, so every cell is `convention`.
    rulesMode: "dir",
    base: (_k, ctx) => pickBase(ctx),
    skillDir: ".grok/skills",
    agentPath: (n) => `.grok/agents/${n}.md`,
    commandPath: null,
    outputStylePath: null,
    rulePath: (n) => `.grok/rules/${n}.md`,
    scriptsDir: ".grok/scripts",
    envFile: ".grok/.env.example",
  },
  dsh: {
    // EVERY CELL IS UNVERIFIED, SO NONE OF THESE PATHS IS EVER USED. The config
    // exists because `CONFIGS` is a total map over `ProviderId` and the type
    // system requires an entry; `isVerified` gates every one of them to false,
    // so the installer skips and logs. The values are the neutral layout rather
    // than a guess at dsh's own, precisely so that if this row is ever reached
    // by mistake it writes somewhere conventional instead of somewhere invented.
    rulesMode: "agents-md",
    base: (_k, ctx) => pickBase(ctx),
    skillDir: ".agents/skills",
    agentPath: null,
    commandPath: null,
    outputStylePath: null,
    rulePath: null,
    scriptsDir: ".agents/scripts",
    envFile: ".agents/.env.example",
  },
  generic: {
    rulesMode: "agents-md",
    base: (_k, ctx) => pickBase(ctx),
    skillDir: ".agents/skills",
    agentPath: null,
    commandPath: null,
    outputStylePath: null,
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
    outputStylePath: null,
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
  outputStyle: "outputStyle",
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
 * Where one (provider, artifact) cell writes under a real home/cwd, or null when
 * unverified/unsupported (→ skip). `*` stands in for the artifact name, which is
 * the part a caller supplies later.
 *
 * `targetTemplate` is this function under sentinel roots, so the docs matrix,
 * `contract`, `kit install-path`, and the installer can never disagree about a
 * path — there is one implementation and three readings of it.
 */
export function targetPathFor(id: ProviderId, kind: ArtifactKind, ctx: ResolverCtx): string | null {
  const r = makeResolver(id);
  const mk = (type: Artifact["type"], name: string) =>
    r.targetFor({ type, name } as Artifact, ctx);
  const dir = (p: string) => (p.endsWith("/") ? p : p + "/");
  const base = ctx.scope === "global" ? ctx.home : ctx.cwd;
  switch (kind) {
    case "skill":
      return r.supports.skill ? dir(mk("skill", "") ?? "") : null;
    case "agent":
      return mk("agent", "*");
    case "command":
      return mk("command", "*");
    case "rules":
      if (!r.supports.rules) return null;
      if (r.rulesMode === "agents-md") return `${r.agentsMdRoot(ctx)}/AGENTS.md`;
      return mk("rule", "*");
    case "scripts":
      return r.supports.scripts ? dir(r.scriptsTarget(ctx)) : null;
    case "env":
      return r.supports.env ? r.envTarget(ctx) : null;
    case "hook":
      return r.supports.hook ? `${base}/${CLAUDE_HOOKS_DIR}/*.cjs` : null;
    case "outputStyle":
      return mk("outputStyle", "*");
    case "statusline":
      // Installed beside the hooks, in the same directory this installer owns.
      // A separate `.claude/statusline/` would need a third `_lib` lookup path
      // for one file; the settings key carries an absolute path either way, so
      // the location is invisible to the user.
      return r.supports.statusline ? `${base}/${CLAUDE_HOOKS_DIR}/av-statusline.cjs` : null;
  }
}

/**
 * Human-readable target-path template for one cell: the same resolution under
 * sentinel roots, rendered with `~`/`<project>` placeholders.
 */
export function targetTemplate(id: ProviderId, kind: ArtifactKind): string | null {
  const ctx: ResolverCtx = { home: HOME_SENTINEL, cwd: CWD_SENTINEL, scope: "project" };
  if (kind === "rules" && makeResolver(id).rulesMode === "agents-md" && makeResolver(id).supports.rules) {
    return "AGENTS.md";
  }
  const resolved = targetPathFor(id, kind, ctx);
  return resolved === null ? null : toTemplate(resolved);
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
      statusline: isVerified(id, "statusline"),
      hook: isVerified(id, "hook"),
      outputStyle: isVerified(id, "outputStyle") && cfg.outputStylePath !== null,
    },
    targetFor(artifact, ctx) {
      const kind = KIND_OF[artifact.type];
      if (!isVerified(id, kind)) return null;
      const base = cfg.base(kind, ctx);
      if (artifact.type === "skill") return join(base, cfg.skillDir, installedSkillDirName(artifact.name));
      if (artifact.type === "agent") return cfg.agentPath ? join(base, cfg.agentPath(artifact.name)) : null;
      if (artifact.type === "command") return cfg.commandPath ? join(base, cfg.commandPath(artifact.name)) : null;
      if (artifact.type === "outputStyle") return cfg.outputStylePath ? join(base, cfg.outputStylePath(artifact.name)) : null;
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
