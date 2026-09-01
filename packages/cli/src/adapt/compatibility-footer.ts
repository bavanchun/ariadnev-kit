import type { ProviderId } from "../providers/spec-verified.js";

// Markers that, when present in the SOURCE, gate footer injection (reference parity).
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
      "- Keep the original ariadnev skill name and `av:*` examples as invocation aliases.\n" +
      "- In Codex, mention the skill with `$skill-name` or the exact `av:*` name, or let Codex activate it from the description.\n" +
      "- Use Codex tools for orchestration: `request_user_input`, `update_plan`, `spawn_agent`, `wait_agent`, and file reports in `plans/reports/`.\n",
  },
  cursor: {
    heading: "## Cursor Compatibility",
    body:
      "- Some Claude tools (e.g. `AskUserQuestion`) have no Cursor equivalent — ask the user inline instead.\n" +
      "- Invoke this skill by its `av:*` name or let Cursor activate it from the description.\n",
  },
  opencode: {
    heading: "## OpenCode Compatibility",
    body:
      "- Tool names are kept as-is (no verified OpenCode rewrite table); map them to OpenCode equivalents at runtime.\n" +
      "- Invoke this skill by its `av:*` name.\n",
  },
  antigravity: {
    heading: "## Antigravity Compatibility",
    body:
      "- Tool names are kept as-is (unverified mapping); adapt to Antigravity equivalents at runtime.\n" +
      "- Invoke this skill by its `av:*` name.\n",
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

export const SHARED_FOOTER_HEADING = "## Multi-provider Compatibility";

/**
 * The footer for a file several providers read from one shared path.
 *
 * Built from the same per-provider table as the single-provider footers rather
 * than a second copy of the same prose, so a provider whose notes change gets
 * one edit and both surfaces follow. A provider with no footer of its own gets
 * the honest line instead of nothing: its tool mapping is unverified, which is
 * the whole reason the shared file keeps canonical names.
 *
 * Gated on the same source markers as `appendFooter` — a file that never
 * mentions a tool has nothing to translate, and a compatibility note on it is
 * noise. Returns null when there is nothing to say.
 */
export function sharedFooter(providers: readonly ProviderId[], source: string): string | null {
  if (!SKILL_MARKERS.some((m) => source.includes(m))) return null;
  const named = [...providers].sort();
  if (named.length === 0) return null;
  const lines = [
    SHARED_FOOTER_HEADING,
    "",
    `This file is installed once and read by: ${named.join(", ")}. Tool names are`,
    "left canonical because no single rewrite is correct for all of them —",
    "translate them to the runtime you are actually in:",
    "",
  ];
  for (const provider of named) {
    const spec = FOOTERS[provider];
    lines.push(`- **${provider}**`);
    if (!spec) {
      lines.push("    - No verified tool mapping — use this runtime's own tool names.");
      continue;
    }
    // The per-provider body is already a bullet list; indent it under its owner.
    for (const line of spec.body.trimEnd().split("\n")) lines.push(`    ${line}`);
  }
  return `${lines.join("\n")}\n`;
}
