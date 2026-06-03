import { stringify as tomlStringify } from "smol-toml";
import { rewritePaths } from "./path-rewrites.js";
import { rewriteTools } from "./tool-rewrites.js";

const WRITE_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"];

const CODEX_PREAMBLE =
  "You are a Codex custom agent converted from vcskill. " +
  "Follow Codex tool names and the parent prompt over any Claude-only tool wording.\n\n";

function toolList(tools: unknown): string[] {
  if (Array.isArray(tools)) return tools.map(String);
  if (typeof tools === "string") return tools.split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

/**
 * Decide sandbox_mode. Frontmatter `metadata.sandbox` wins; otherwise infer from
 * the agent's tools — read-only when it declares no write tools — defaulting to
 * workspace-write. (We do NOT copy claudekit's hardcoded agent-name allowlist.)
 */
export function resolveSandboxMode(frontmatter: Record<string, unknown>): string {
  const meta = frontmatter.metadata as Record<string, unknown> | undefined;
  if (meta && typeof meta.sandbox === "string") return meta.sandbox;
  const tools = toolList(frontmatter.tools);
  if (tools.length === 0) return "workspace-write";
  const hasWrite = tools.some((t) => WRITE_TOOLS.includes(t));
  return hasWrite ? "workspace-write" : "read-only";
}

// Strip a compatibility footer if one slipped into an inline value.
function stripFooter(value: string): string {
  const idx = value.indexOf("\n\n## ");
  return idx === -1 ? value : value.slice(0, idx);
}

function adaptInline(value: string): string {
  return stripFooter(rewriteTools(rewritePaths(value, "codex"), "codex")).trim();
}

export interface AgentTomlInput {
  name: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

/** Convert a canonical agent into a Codex `.toml` agent definition string. */
export function agentToToml(input: AgentTomlInput): string {
  const { name, frontmatter, body } = input;
  const description = adaptInline(
    typeof frontmatter.description === "string"
      ? frontmatter.description
      : `vcskill ${name} agent.`,
  );
  const developer_instructions =
    CODEX_PREAMBLE + rewriteTools(rewritePaths(body, "codex"), "codex");
  return tomlStringify({
    name,
    description,
    sandbox_mode: resolveSandboxMode(frontmatter),
    developer_instructions,
  });
}
