// Shared kit/domain types used across load-kit, adapt, and install layers.

export type ArtifactType = "skill" | "agent" | "command" | "rule";

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

export interface Kit {
  root: string;
  skills: Artifact[];
  agents: Artifact[];
  commands: Artifact[];
  rules: Artifact[];
  /** Absolute path to shared `kit/scripts/` if present. */
  scriptsDir: string | null;
  /** Absolute path to `kit/.env.example` if present. */
  envExample: string | null;
}
