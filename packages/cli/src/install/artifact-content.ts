import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import type { Artifact } from "../kit/kit-types.js";
import type { ProviderId } from "../providers/spec-verified.js";
import { adaptArtifact } from "../adapt/adapt.js";
import { agentToToml } from "../adapt/agent-to-toml.js";
import { rewritePaths } from "../adapt/path-rewrites.js";
import { rewriteTools } from "../adapt/tool-rewrites.js";
import { serializeFrontmatter } from "../adapt/frontmatter.js";
import { IGNORE_DIRS, IGNORE_FILES, isTextFile } from "./install-types.js";

/** Adapt arbitrary text (non-frontmatter): paths + tool names only. */
export function adaptText(content: string, provider: ProviderId): string {
  return rewriteTools(rewritePaths(content, provider), provider);
}

/** Convert a canonical agent to OpenCode subagent frontmatter + adapted body. */
export function agentToOpencode(agent: Artifact): string {
  const mode = agent.name === "brainstormer" ? "primary" : "subagent";
  const fm: Record<string, unknown> = {
    description:
      typeof agent.frontmatter.description === "string"
        ? agent.frontmatter.description
        : `Agent: ${agent.name}`,
    mode,
    tools: { read: true, write: true, edit: true, bash: true, glob: true, grep: true },
  };
  return serializeFrontmatter(fm, rewritePaths(agent.body, "opencode"));
}

/** Provider-specific content for an agent artifact. */
export function agentContent(agent: Artifact, provider: ProviderId): string {
  if (provider === "codex") {
    return agentToToml({ name: agent.name, frontmatter: agent.frontmatter, body: agent.body });
  }
  if (provider === "opencode") return agentToOpencode(agent);
  return adaptArtifact(agent, provider); // claude-code identity, cursor shim
}

export interface FileContent {
  /** Path relative to the skill destination dir. */
  rel: string;
  content: string;
}

/**
 * Compute the files to emit for a skill: adapted SKILL.md plus every auxiliary
 * text file (path/tool-adapted), skipping IGNORE files/dirs. Reads the source
 * tree but writes nothing.
 */
export function skillFiles(skill: Artifact, provider: ProviderId): FileContent[] {
  const srcDir = dirname(skill.sourcePath);
  const out: FileContent[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) {
        if (IGNORE_DIRS.has(entry)) continue;
        walk(abs);
        continue;
      }
      if (IGNORE_FILES.has(entry)) continue;
      const rel = relative(srcDir, abs);
      if (basename(abs) === "SKILL.md" && dir === srcDir) {
        out.push({ rel, content: adaptArtifact(skill, provider) });
      } else {
        const raw = readFileSync(abs, "utf8");
        out.push({ rel, content: isTextFile(entry) ? adaptText(raw, provider) : raw });
      }
    }
  };
  walk(srcDir);
  return out;
}
