// Hook event vocabulary.
//
// The loader used to accept any non-empty string as an event name, so a hook
// bound to an event no provider raises would install silently and simply never
// fire. Nothing would report it — not install, not doctor — because there is no
// observable difference between "never triggered" and "triggered and did
// nothing". Validating the name at load time is the only place that gap closes.
//
// The list is a union of two sources, and the split is deliberate: a name that
// is only here because a shipped hook uses it is a weaker claim than one from
// the documented vocabulary, and should be re-examined rather than silently
// inherited.

export interface HookEventSpec {
  /** Where the name comes from — documented vocabulary, or a shipped hook. */
  origin: "documented" | "in-use";
  /** For `in-use`: why it is trusted despite being undocumented. */
  note?: string;
}

export const HOOK_EVENTS: Record<string, HookEventSpec> = {
  PreToolUse: { origin: "documented" },
  PostToolUse: { origin: "documented" },
  UserPromptSubmit: { origin: "documented" },
  SessionStart: { origin: "documented" },
  SessionEnd: { origin: "documented" },
  Stop: { origin: "documented" },
  SubagentStop: { origin: "documented" },
  Notification: { origin: "documented" },
  PreCompact: { origin: "documented" },
  PostCompact: { origin: "documented" },
  SubagentStart: {
    origin: "in-use",
    note:
      "kit/hooks/subagent-init binds it and the hook is installed and bound today. " +
      "Documented vocabulary lists SubagentStop but not SubagentStart; kept because " +
      "removing it would break a shipped hook, and re-checked whenever the vocabulary is revisited.",
  },
};

export class UnknownHookEventError extends Error {
  constructor(hook: string, event: string) {
    super(
      `hook "${hook}": unknown event "${event}". ` +
        `Known events: ${Object.keys(HOOK_EVENTS).sort().join(", ")}. ` +
        `A hook bound to an event nothing raises installs cleanly and then never fires.`,
    );
    this.name = "UnknownHookEventError";
  }
}

export function isKnownHookEvent(event: string): boolean {
  return Object.hasOwn(HOOK_EVENTS, event);
}

/** Throws on the first unknown event; no-op when every name is known. */
export function assertKnownHookEvents(hook: string, events: string[]): void {
  for (const event of events) {
    if (!isKnownHookEvent(event)) throw new UnknownHookEventError(hook, event);
  }
}
