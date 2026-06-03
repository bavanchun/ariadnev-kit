import type { ProviderId } from "../providers/spec-verified.js";

// Markers that, when present in the SOURCE, gate footer injection (claudekit parity).
export const SKILL_MARKERS = [
  "AskUserQuestion",
  "TodoWrite",
  "TaskCreate",
  "TaskUpdate",
  "TaskList",
] as const;

interface FooterSpec {
  heading: string;
  body: string;
}

// Per-provider footer text. A Cursor skill must NEVER receive a Codex footer (L2).
const FOOTERS: Partial<Record<ProviderId, FooterSpec>> = {
  codex: {
    heading: "## Codex Compatibility",
    body:
      "- Keep the original vcskill skill name and `vc:*` examples as invocation aliases.\n" +
      "- In Codex, mention the skill with `$skill-name` or the exact `vc:*` name, or let Codex activate it from the description.\n" +
      "- Use Codex tools for orchestration: `request_user_input`, `update_plan`, `spawn_agent`, `wait_agent`, and file reports in `plans/reports/`.\n",
  },
  cursor: {
    heading: "## Cursor Compatibility",
    body:
      "- Some Claude tools (e.g. `AskUserQuestion`) have no Cursor equivalent — ask the user inline instead.\n" +
      "- Invoke this skill by its `vc:*` name or let Cursor activate it from the description.\n",
  },
  opencode: {
    heading: "## OpenCode Compatibility",
    body:
      "- Tool names are kept as-is (no verified OpenCode rewrite table); map them to OpenCode equivalents at runtime.\n" +
      "- Invoke this skill by its `vc:*` name.\n",
  },
  antigravity: {
    heading: "## Antigravity Compatibility",
    body:
      "- Tool names are kept as-is (unverified mapping); adapt to Antigravity equivalents at runtime.\n" +
      "- Invoke this skill by its `vc:*` name.\n",
  },
};

export function footerHeading(provider: ProviderId): string | null {
  return FOOTERS[provider]?.heading ?? null;
}

/**
 * Append the per-provider compatibility footer when the SOURCE contained skill
 * markers and the footer is not already present. Claude/generic get none.
 */
export function appendFooter(
  content: string,
  provider: ProviderId,
  source: string,
): string {
  const spec = FOOTERS[provider];
  if (!spec) return content;
  const hasMarker = SKILL_MARKERS.some((m) => source.includes(m));
  if (!hasMarker || content.includes(spec.heading)) return content;
  return `${content}\n\n${spec.heading}\n\n${spec.body}`;
}
