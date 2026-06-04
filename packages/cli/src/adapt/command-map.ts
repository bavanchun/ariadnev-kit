import type { ProviderId } from "../providers/spec-verified.js";
import type { Artifact } from "../kit/kit-types.js";
import { adaptArtifact } from "./adapt.js";
import { rewritePaths } from "./path-rewrites.js";
import { serializeFrontmatter } from "./frontmatter.js";
import { CODEX_COMMANDS_DIR, OPENCODE_DIR } from "./paths.js";

export interface MappedCommand {
  /** Provider-relative path of the emitted command file. */
  relPath: string;
  content: string;
}

// Leaf command dir per provider, sourced from path constants (no literals/drift).
const COMMAND_DIR: Record<ProviderId, string> = {
  "claude-code": "commands",
  codex: CODEX_COMMANDS_DIR, // "commands" (H3 single source)
  cursor: "commands",
  antigravity: "commands",
  opencode: "commands", // plural — verified vs generate-opencode.py
  generic: "commands",
  "test-provider": "commands",
};

function opencodeContent(artifact: Artifact): string {
  // Strip Claude frontmatter; rebuild minimal OpenCode frontmatter.
  const fm: Record<string, unknown> = {
    description:
      typeof artifact.frontmatter.description === "string"
        ? artifact.frontmatter.description
        : `Command: ${artifact.name}`,
  };
  if (typeof artifact.frontmatter.agent === "string") fm.agent = artifact.frontmatter.agent;
  const hint = artifact.frontmatter["argument-hint"];
  if (typeof hint === "string" && !String(fm.description).includes("[")) {
    fm.description = `${fm.description} - Args: ${hint}`;
  }
  return serializeFrontmatter(fm, rewritePaths(artifact.body, "opencode"));
}

/** Map a canonical command to its provider-specific path + adapted content. */
export function mapCommand(artifact: Artifact, provider: ProviderId): MappedCommand {
  const relPath = `${COMMAND_DIR[provider]}/${artifact.name}.md`;
  if (provider === "opencode") {
    return { relPath: `${OPENCODE_DIR}/${COMMAND_DIR.opencode}/${artifact.name}.md`, content: opencodeContent(artifact) };
  }
  return { relPath, content: adaptArtifact(artifact, provider) };
}
