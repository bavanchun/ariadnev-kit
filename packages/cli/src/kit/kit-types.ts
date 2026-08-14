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
export interface HookManifest {
  /** Claude Code hook event, e.g. "SessionStart", "PreToolUse". */
  event?: string;
  /** Multi-event hooks (e.g. Stop + SubagentStop); alternative to `event`. */
  events?: string[];
  /** Optional tool-name matcher for PreToolUse/PostToolUse events. */
  matcher?: string;
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
  rules: Artifact[];
  hooks: KitHook[];
  workflows: KitWorkflow[];
  /** Absolute path to shared `kit/scripts/` if present. */
  scriptsDir: string | null;
  /** Absolute path to `kit/.env.example` if present. */
  envExample: string | null;
  /** Non-fatal lint findings (e.g. duplicate-heading heuristic). */
  warnings: string[];
}
