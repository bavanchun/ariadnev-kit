// Pure settings.json merge for Claude Code hook bindings. Follows the
// managed-merge philosophy of agents-md.ts: caller reads the existing file and
// writes the returned string; this module never touches the filesystem.

export interface HookBinding {
  /** Claude Code hook event, e.g. "SessionStart". */
  event: string;
  /** Optional tool matcher (PreToolUse/PostToolUse). */
  matcher?: string;
  /** Full shell command, e.g. `node /abs/.claude/hooks/vc/session-init.cjs`. */
  command: string;
}

interface HookCommandEntry {
  type: "command";
  command: string;
  [key: string]: unknown;
}

interface HookMatcherGroup {
  matcher?: string;
  hooks: HookCommandEntry[];
  [key: string]: unknown;
}

type SettingsJson = Record<string, unknown> & {
  hooks?: Record<string, HookMatcherGroup[]>;
};

function eventContainsCommand(groups: HookMatcherGroup[], command: string): boolean {
  return groups.some((g) => (g.hooks ?? []).some((h) => h.command === command));
}

/**
 * Merge vc hook bindings into an existing settings.json string. Idempotent:
 * bindings are deduped by exact command; entries not owned by vc are preserved
 * untouched. Throws on unparseable input rather than clobbering user config.
 */
export function mergeHookSettings(existing: string, bindings: HookBinding[]): string {
  const settings: SettingsJson = existing.trim().length
    ? (JSON.parse(existing) as SettingsJson)
    : {};
  const hooks = (settings.hooks ??= {});
  for (const binding of bindings) {
    const groups = (hooks[binding.event] ??= []);
    if (eventContainsCommand(groups, binding.command)) continue;
    const group: HookMatcherGroup = { hooks: [{ type: "command", command: binding.command }] };
    if (binding.matcher) group.matcher = binding.matcher;
    groups.push(group);
  }
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/** Copy-pasteable `hooks` block for users who declined the automatic merge. */
export function renderHookSettingsSnippet(bindings: HookBinding[]): string {
  const merged = JSON.parse(mergeHookSettings("", bindings)) as SettingsJson;
  return [
    "Add this to your .claude/settings.json to activate the vc hooks:",
    JSON.stringify({ hooks: merged.hooks }, null, 2),
  ].join("\n");
}
