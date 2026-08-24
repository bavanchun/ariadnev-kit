// Shared kit/domain types used across load-kit, adapt, and install layers.

import type { GraphIRV1 } from "../graph/graph-types.js";

export type ArtifactType = "skill" | "agent" | "command" | "rule" | "outputStyle";

export interface Artifact {
  type: ArtifactType;
  /** Bare slug / stem (skill dir name, agent/command/rule file stem). */
  name: string;
  /** Parsed frontmatter (empty object when none). */
  frontmatter: Record<string, unknown>;
  /** Body text after frontmatter. */
  body: string;
  /** Raw file content (frontmatter + body) as authored. */
  raw: string;
  /** Absolute source path of the artifact's primary file. */
  sourcePath: string;
}

/** Data-driven hook binding manifest (kit/hooks/<name>/hook.json). */
/**
 * One event binding. `bindings[]` exists because `events[] + matcher` cannot
 * express what real hooks need: the same hook on PostToolUse with a tool matcher
 * and on UserPromptSubmit with none, and a fixed position among the other hooks
 * bound to the same event.
 */
export interface HookBindingSpec {
  /** Claude Code hook event, e.g. "SessionStart", "PreToolUse". */
  event: string;
  /** Tool-name matcher, for PreToolUse/PostToolUse. */
  matcher?: string;
  /** Position within the event, ascending. Undeclared binds after declared ones. */
  order?: number;
  /** Extra argv appended after the hook path. */
  args?: string[];
}

export interface HookManifest {
  /** Claude Code hook event, e.g. "SessionStart", "PreToolUse". */
  event?: string;
  /** Multi-event hooks (e.g. Stop + SubagentStop); alternative to `event`. */
  events?: string[];
  /** Optional tool-name matcher for PreToolUse/PostToolUse events. */
  matcher?: string;
  /** Per-event bindings, when one matcher for every event is not enough. */
  bindings?: HookBindingSpec[];
  description: string;
}

export interface KitHook {
  /** Hook dir slug, becomes the installed file stem. */
  name: string;
  manifest: HookManifest;
  /** Absolute path to the hook.cjs body. */
  file: string;
}

/** Execution-only graph asset. It is never part of provider install plans. */
export interface KitWorkflow {
  name: string;
  graph: GraphIRV1;
  raw: string;
  sourcePath: string;
}

export interface Kit {
  root: string;
  skills: Artifact[];
  agents: Artifact[];
  commands: Artifact[];
  outputStyles: Artifact[];
  /** Absolute path to the statusline entrypoint, when the kit ships one. */
  statusline?: string;
  rules: Artifact[];
  hooks: KitHook[];
  workflows: KitWorkflow[];
  /** Absolute path to shared `kit/scripts/` if present. */
  scriptsDir: string | null;
  /** Absolute path to `kit/.env.example` if present. */
  envExample: string | null;
  /** Non-fatal lint findings that hold for every skill (duplicate-heading heuristic). */
  warnings: string[];
  /** Reserved for compatibility with older validate JSON consumers; always empty. */
  held: string[];
}
