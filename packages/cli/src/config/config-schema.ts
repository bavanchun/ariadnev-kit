// The ariadnev config schema, and the two-layer permission split that goes with
// it.
//
// `env-scope.ts` states the rule this file has to keep: ariadnev's own config is
// owned by the user, never by a project file. A cloned repo that could set
// `privacyBlock: false` would silently disable the hook that blocks secrets.
//
// So the layer is part of the type, not a list kept in sync by review. A field
// only exists if it was declared through `projectField` or `userField`; a bare
// literal is not a `SchemaNode` and does not compile. Adding a field without
// deciding who may set it is therefore impossible rather than merely discouraged.

export type Layer = "project" | "user";

export type LeafType = "boolean" | "integer" | "string" | "string[]" | "webhook";

export type LeafValue = boolean | number | string | string[] | null;

export interface LeafSpec<T extends LeafValue = LeafValue> {
  readonly kind: "leaf";
  readonly layer: Layer;
  readonly type: LeafType;
  readonly default: T;
  readonly describe: string;
  /** Allowed values, for a string field with a closed set. */
  readonly enum?: readonly string[];
  /** `null` is a valid value (an unset destination, an unset language). */
  readonly nullable?: boolean;
  /** Never printed by `config prefs resolve`. */
  readonly sensitive?: boolean;
}

export interface SchemaBranch {
  readonly [key: string]: SchemaNode;
}
export type SchemaNode = LeafSpec | SchemaBranch;

/** The nested value type a schema tree resolves to. */
export type Resolved<N> = N extends LeafSpec<infer T> ? T : { -readonly [K in keyof N]: Resolved<N[K]> };

function leaf<T extends LeafValue>(layer: Layer, type: LeafType, def: T, describe: string, extra: Partial<LeafSpec<T>> = {}): LeafSpec<T> {
  return { kind: "leaf", layer, type, default: def, describe, ...extra };
}

const projectField = {
  bool: (def: boolean, describe: string) => leaf<boolean>("project", "boolean", def, describe),
  int: (def: number, describe: string) => leaf<number>("project", "integer", def, describe),
  str: (def: string, describe: string) => leaf<string>("project", "string", def, describe),
  optionalStr: (describe: string) => leaf<string | null>("project", "string", null, describe, { nullable: true }),
  choice: <const V extends readonly string[]>(values: V, def: V[number], describe: string) =>
    leaf<V[number]>("project", "string", def, describe, { enum: values }),
};

const userField = {
  bool: (def: boolean, describe: string) => leaf<boolean>("user", "boolean", def, describe),
  strList: (describe: string) => leaf<string[]>("user", "string[]", [], describe),
  choice: <const V extends readonly string[]>(values: V, def: V[number], describe: string) =>
    leaf<V[number]>("user", "string", def, describe, { enum: values }),
  secret: (describe: string) => leaf<string | null>("user", "string", null, describe, { nullable: true, sensitive: true }),
  webhook: (describe: string) => leaf<string | null>("user", "webhook", null, describe, { nullable: true, sensitive: true }),
};

/**
 * Hosts a notification destination may point at. A destination is an egress
 * channel, so the set is closed here rather than checked at send time — the
 * value never reaches a sender if it is not one of these.
 */
export const NOTIFICATION_HOSTS = ["discord.com", "slack.com", "api.telegram.org"] as const;

export const SCHEMA = {
  // ---- user-only: the keys that exist to protect the user ----
  privacyBlock: userField.bool(true, "Block reads of .env files, keys, and other secrets."),
  assertions: userField.strList("Standing instructions injected into every session."),
  trust: {
    // Deliberately no `passphrase`: the source schema stored one in plaintext in
    // a file this CLI is asked to print. A secret that a resolve command can
    // echo is a leak with extra steps. If real trust ever needs one, store a
    // salted hash in a 0600 file and drop the branch from printed output.
    enabled: userField.bool(false, "Enable trusted-mode workflows that skip confirmation prompts."),
  },
  scripts: {
    // Two tiers, not three: a "prompt" tier would need an interactive surface
    // `ariadnev skill run` does not have, and a policy that silently fails to
    // prompt is worse than no policy. The default preserves today's behavior —
    // these are the kit's own scripts, hash-tracked by the install receipt — so
    // the setting exists for a user who wants a stricter stance, and taking it
    // is a deliberate act.
    executionPolicy: userField.choice(
      ["allow", "never"] as const,
      "allow",
      "Whether `ariadnev skill run` may execute the scripts a skill ships.",
    ),
  },
  // Per-hook off switches. User-only for the same reason `privacyBlock` is: a
  // project file that could set `hooks.privacy-block: false` would disable the
  // guard by another route. Every shipped hook has an entry, and a test compares
  // this list against the hooks the kit actually ships — a hook with no switch
  // would look configurable in the docs and silently ignore the setting.
  hooks: {
    "cook-after-plan-reminder": userField.bool(true, "Run the cook-after-plan-reminder hook."),
    "descriptive-name": userField.bool(true, "Run the descriptive-name hook."),
    "dev-rules-reminder": userField.bool(true, "Run the dev-rules-reminder hook."),
    "plan-format-kanban": userField.bool(true, "Run the plan-format-kanban hook."),
    "precompact-capture": userField.bool(true, "Run the precompact-capture hook."),
    "privacy-block": userField.bool(true, "Run the privacy-block hook."),
    "scout-block": userField.bool(true, "Run the scout-block hook."),
    "secret-output-guardrail": userField.bool(true, "Run the secret-output-guardrail hook."),
    "session-init": userField.bool(true, "Run the session-init hook."),
    "session-state": userField.bool(true, "Run the session-state hook."),
    "simplify-gate": userField.bool(true, "Run the simplify-gate hook."),
    "subagent-init": userField.bool(true, "Run the subagent-init hook."),
    "team-context-inject": userField.bool(true, "Run the team-context-inject hook."),
    "usage-quota-cache-refresh": userField.bool(true, "Run the usage-quota-cache-refresh hook."),
  },
  notifications: {
    enabled: userField.bool(false, "Send session notifications to the destinations below."),
    discordWebhook: userField.webhook("Discord webhook URL for notifications."),
    slackWebhook: userField.webhook("Slack webhook URL for notifications."),
    telegramBotToken: userField.secret("Telegram bot token for notifications."),
    telegramChatId: userField.secret("Telegram chat id notifications are sent to."),
  },

  // ---- project-overridable: the keys that describe this workspace ----
  paths: {
    docs: projectField.str("docs", "Directory holding project documentation."),
    plans: projectField.str("plans", "Directory holding implementation plans."),
  },
  docs: {
    maxLoc: projectField.int(800, "Maximum lines a single documentation file should reach."),
  },
  plan: {
    namingFormat: projectField.str("{date}-{issue}-{slug}", "Naming format for new plan directories."),
    dateFormat: projectField.str("YYMMDD-HHmm", "Date stamp format used inside plan names."),
    issuePrefix: projectField.str("GH-", "Prefix applied to issue ids in plan names."),
    reportsDir: projectField.str("reports", "Directory under the plans dir holding reports."),
  },
  locale: {
    thinkingLanguage: projectField.optionalStr("Language used for reasoning, when the project prefers one."),
    responseLanguage: projectField.optionalStr("Language used for responses, when the project prefers one."),
  },
  project: {
    type: projectField.str("auto", "Project type, or `auto` to detect it."),
    packageManager: projectField.str("auto", "Package manager, or `auto` to detect it."),
    framework: projectField.str("auto", "Primary framework, or `auto` to detect it."),
  },
  statusline: {
    // `none`, not `off`: that is the value the statusline entrypoint switches on,
    // and a schema that accepts a word the consumer does not recognise validates
    // a setting that then silently does nothing.
    mode: projectField.choice(["full", "compact", "minimal", "none"] as const, "full", "How much the statusline renders."),
    quota: projectField.bool(true, "Show remaining usage quota in the statusline."),
  },
} satisfies SchemaBranch;

export type Config = Resolved<typeof SCHEMA>;

export interface FlatField {
  readonly path: string;
  readonly spec: LeafSpec;
}

function isLeaf(node: SchemaNode): node is LeafSpec {
  return (node as LeafSpec).kind === "leaf";
}

function flatten(node: SchemaBranch, prefix: string): FlatField[] {
  const out: FlatField[] = [];
  for (const [key, child] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isLeaf(child)) out.push({ path, spec: child });
    else out.push(...flatten(child, path));
  }
  return out;
}

/** Every leaf, as a dotted path. The one enumeration all consumers share. */
export const CONFIG_FIELDS: readonly FlatField[] = flatten(SCHEMA, "");

const BY_PATH = new Map(CONFIG_FIELDS.map((f) => [f.path, f.spec]));

export function specFor(path: string): LeafSpec | undefined {
  return BY_PATH.get(path);
}

export const USER_ONLY_PATHS: readonly string[] = CONFIG_FIELDS.filter((f) => f.spec.layer === "user").map((f) => f.path);

export function setAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let node = target;
  for (const part of parts.slice(0, -1)) {
    if (typeof node[part] !== "object" || node[part] === null) node[part] = {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
}

export function getAtPath(source: unknown, path: string): unknown {
  let node: unknown = source;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

export function defaults(): Config {
  const out: Record<string, unknown> = {};
  for (const { path, spec } of CONFIG_FIELDS) {
    setAtPath(out, path, Array.isArray(spec.default) ? [...spec.default] : spec.default);
  }
  return out as Config;
}

/**
 * A copy safe to print. A set secret becomes `<redacted>`; an unset one stays
 * `null`, so "no destination configured" never looks the same as "configured
 * and hidden".
 */
export function redactConfig(config: Config): Config {
  const clone = structuredClone(config) as Config;
  for (const { path, spec } of CONFIG_FIELDS) {
    if (!spec.sensitive) continue;
    if (getAtPath(clone, path) !== null) setAtPath(clone as unknown as Record<string, unknown>, path, "<redacted>");
  }
  return clone;
}
