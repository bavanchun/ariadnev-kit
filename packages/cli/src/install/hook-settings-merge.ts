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

/**
 * Remove exactly the given vc bindings from an existing settings.json string.
 * Reverse of mergeHookSettings: entries not matching one of `bindings`'
 * commands are left untouched; an event whose groups all get removed drops
 * the event key entirely. Idempotent, throws on unparseable input.
 */
export function unmergeHookSettings(existing: string, bindings: HookBinding[]): string {
  const settings: SettingsJson = existing.trim().length
    ? (JSON.parse(existing) as SettingsJson)
    : {};
  const ourCommands = new Set(bindings.map((b) => b.command));
  const hooks = settings.hooks;
  if (hooks) {
    for (const event of Object.keys(hooks)) {
      const remaining = hooks[event]
        .map((group) => ({ ...group, hooks: group.hooks.filter((h) => !ourCommands.has(h.command)) }))
        .filter((group) => group.hooks.length > 0);
      if (remaining.length > 0) {
        hooks[event] = remaining;
      } else {
        delete hooks[event];
      }
    }
    if (Object.keys(hooks).length === 0) delete settings.hooks;
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
