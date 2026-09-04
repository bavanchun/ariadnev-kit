import { join } from "node:path";
import type { Artifact } from "../kit/kit-types.js";
import {
  type ProviderId,
  type ArtifactKind,
  isVerified,
} from "./spec-verified.js";
import {
  ANTIGRAVITY_HOOKS_CONFIG_FILE,
  ANTIGRAVITY_HOOKS_DIR,
  CLAUDE_HOOKS_DIR,
  CLAUDE_SETTINGS_FILE,
  CODEX_HOOKS_CONFIG_FILE,
  CODEX_HOOKS_DIR,
  installedSkillDirName,
} from "../adapt/paths.js";

export type Scope = "project" | "global";

export interface ResolverCtx {
  home: string;
  cwd: string;
  scope: Scope;
}

export type RulesMode = "dir" | "mdc" | "agents-md";

/** Which merger writes a provider's hook-binding registry. */
export type HooksConfigFormat =
  | "claude-settings-json"
  | "codex-hooks-json"
  | "antigravity-hooks-json";

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
  /**
   * Absolute root of the hooks tree this provider owns. Every file the hook
   * installer writes — bodies, `_lib`, the runtime marker, the output-style
   * sidecar, the statusline — hangs off this one path.
   */
  hooksTarget(ctx: ResolverCtx): string;
  /**
   * Absolute settings file hook bindings are merged into, or null when the
   * provider discovers hooks by directory and has no binding registry. Null
   * means the merge op is not emitted at all, rather than emitted against
   * whatever file another provider happens to use.
   */
  hooksConfigTarget(ctx: ResolverCtx): string | null;
  /** Which merger writes that file; null exactly when the target is null. */
  hooksConfigFormat: HooksConfigFormat | null;
  /**
   * Whether an install writes into the hooks tree. Deliberately separate from
   * the `hook` evidence cell: grading a cell `convention` documents that a
   * layout is right, which is not the same as having watched the provider read
   * it, and a documentation act must not start writing files as a side effect.
   */
  hooksInstall: boolean;
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
  /** Root of the owned hooks tree, relative to the scope base. */
  hooksDir: string;
  /** Relative settings file for hook bindings; null => no binding registry. */
  hooksConfigFile: string | null;
  hooksConfigFormat: HooksConfigFormat | null;
  /** Whether an install writes hooks here. Never wider than the `hook` cell. */
  hooksInstall: boolean;
}

/**
 * The hooks surface of a provider that has none.
 *
 * `hooksDir` is still a real path rather than a sentinel: the resolver is total
 * over `ArtifactKind`, so `targetPathFor` asks every provider where its hooks
 * would go in order to render the matrix. With `hooksInstall: false` nothing is
 * ever written there, and the `hook` cell being unverified is what makes the
 * matrix print a skip.
 */
function noHooks(hooksDir: string): Pick<
  ProviderConfig,
  "hooksDir" | "hooksConfigFile" | "hooksConfigFormat" | "hooksInstall"
> {
  return { hooksDir, hooksConfigFile: null, hooksConfigFormat: null, hooksInstall: false };
}

function pickBase(ctx: ResolverCtx): string {
  return ctx.scope === "global" ? ctx.home : ctx.cwd;
}

// Antigravity's tree is a user-level CLI config root, not a workspace layout,
// so it is home-anchored like codex. AGENTS.md is the exception for the same
// reason it is there: rules belong at the root of whatever is being described.
function antigravityBase(kind: ArtifactKind, ctx: ResolverCtx): string {
  if (kind === "rules") return pickBase(ctx);
  return ctx.home;
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
    outputStylePath: (n) => `.claude/output-styles/${n}.md`,
    rulePath: (n) => `.claude/rules/${n}.md`,
    scriptsDir: ".claude/scripts",
    envFile: ".claude/.env.example",
    // The one provider whose hooks were observed firing, so the one that
    // writes them. These are the values every hooks destination used to be
    // built from directly.
    hooksDir: CLAUDE_HOOKS_DIR,
    hooksConfigFile: CLAUDE_SETTINGS_FILE,
    hooksConfigFormat: "claude-settings-json",
    hooksInstall: true,
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
    // Codex discovers hooks from a JSON file of its own, not from the tree, so
    // the tree alone activates nothing — the merge into `hooks.json` is what
    // registers them, and Codex then asks the user to trust each one.
    hooksDir: CODEX_HOOKS_DIR,
    hooksConfigFile: CODEX_HOOKS_CONFIG_FILE,
    hooksConfigFormat: "codex-hooks-json",
    hooksInstall: true,
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
    // The file inside that dir, not the dir itself. Resolving to the directory
    // made every writer of it a file-vs-directory collision: omp resolves the
    // same shim to the same path, and `atomicWrite` clears a directory standing
    // where a file belongs — so installing cursor and omp together deleted
    // cursor's whole agent tree and left omp's single file in its place.
    agentPath: (n) => `.agents/skills/${installedSkillDirName(n)}/AGENT.md`,
    commandPath: (n) => `.cursor/commands/${n}.md`,
    outputStylePath: null,
    rulePath: (n) => `.cursor/rules/${n}.mdc`,
    scriptsDir: ".agents/scripts",
    envFile: ".agents/.env.example",
    ...noHooks(".cursor/hooks/av"),
  },
  antigravity: {
    rulesMode: "agents-md",
    base: antigravityBase,
    // `.gemini/config/`, not the neutral `.agents/skills` this used to inherit
    // from codex. The upstream kit ships a dedicated emitter for this target
    // whose own text states it writes skills under `~/.gemini/config/skills`
    // and that "workspace .agents/skills [is] not emitted" — the one layout
    // this provider was being given. `~/.gemini/config/` is a real config tree
    // on disk (`agents/`, `skills/`, `hooks.json`, `mcp_config.json`,
    // `plugins/`, `sidecars/`), and a third party's skill sits in `skills/`.
    skillDir: ".gemini/config/skills",
    // The path both of these used to rest on the agent files already sitting in
    // `~/.gemini/config/agents/`. That was never evidence: those files came
    // from this tool's own lineage, and a directory cannot report what reads
    // it — the installer certifying its own output is the exact failure the
    // evidence ladder exists to prevent.
    //
    // What replaces it is the provider answering for itself. `agy agent` on
    // 1.1.25 enumerates by name a file planted at this path, with no project
    // setup, and the enumeration is a parse: agy type-checks agent
    // frontmatter, and an agent it rejects is dropped from the listing
    // silently. So the listing distinguishes a file agy accepted from a file
    // that merely exists — which a directory listing never could.
    agentPath: (n) => `.gemini/config/agents/${n}.md`,
    commandPath: null,
    outputStylePath: null,
    rulePath: null,
    scriptsDir: ".gemini/config/scripts",
    envFile: ".gemini/config/.env.example",
    // A third discovery mechanism, not a variant of the other two: agy reads
    // one shared `hooks.json` in which each writer owns a top-level key of its
    // own. Only five of the kit's events exist there, so the bindings that have
    // no home are skipped per binding rather than remapped.
    hooksDir: ANTIGRAVITY_HOOKS_DIR,
    hooksConfigFile: ANTIGRAVITY_HOOKS_CONFIG_FILE,
    hooksConfigFormat: "antigravity-hooks-json",
    hooksInstall: true,
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
    ...noHooks(".opencode/hooks/av"),
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
    agentPath: (n) => `.agents/skills/${installedSkillDirName(n)}/AGENT.md`,
    commandPath: null,
    outputStylePath: null,
    rulePath: null,
    scriptsDir: ".agents/scripts",
    envFile: ".agents/.env.example",
    ...noHooks(".agents/hooks/av"),
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
    ...noHooks(".grok/hooks/av"),
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
    ...noHooks(".agents/hooks/av"),
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
    ...noHooks(".agents/hooks/av"),
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
    ...noHooks(".test-provider/hooks/av"),
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
      return r.supports.hook ? `${r.hooksTarget(ctx)}/*.cjs` : null;
    case "outputStyle":
      return mk("outputStyle", "*");
    case "statusline":
      // Installed beside the hooks, in the same directory this installer owns.
      // A separate `.claude/statusline/` would need a third `_lib` lookup path
      // for one file; the settings key carries an absolute path either way, so
      // the location is invisible to the user.
      return r.supports.statusline ? `${r.hooksTarget(ctx)}/av-statusline.cjs` : null;
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
    hooksTarget(ctx) {
      return join(cfg.base("hook", ctx), cfg.hooksDir);
    },
    hooksConfigTarget(ctx) {
      return cfg.hooksConfigFile === null ? null : join(cfg.base("hook", ctx), cfg.hooksConfigFile);
    },
    hooksConfigFormat: cfg.hooksConfigFormat,
    hooksInstall: cfg.hooksInstall,
  };
}
