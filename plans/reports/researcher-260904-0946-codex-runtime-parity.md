# Codex runtime parity research — issue #134

Scope: read-only. No model-spending commands run. Machine: darwin 25.6.0 arm64,
codex-cli 0.153.1 (brew), CODEX_HOME on this shell overridden by Orca to
`~/Library/Application Support/orca/codex-runtime-home/home`, whose
`hooks.json`/`plugins`/`AGENTS.md` are symlinks into the real `~/.codex/` — so
everything read from `~/.codex/` below is the actual shared user-global Codex
home, not an Orca-only artifact. `~/Codes/My-projects/Capstone/.codex/hooks.json`
trust entries in `~/.codex/config.toml` additionally prove a **project-local**
`.codex/hooks.json` is a real, loaded path (not just user-global).

## 1. Live codex 0.153.1 capability surface

- `codex --version` → `codex-cli 0.153.1` (observed).
- `codex features list` → `hooks  stable  true`, `plugins  stable  true`,
  `plugin_hooks  removed  false` (observed, command run).
- `codex --help` lists a top-level `--dangerously-bypass-hook-trust` flag:
  "Run enabled hooks without requiring persisted hook trust for this
  invocation." (observed).
- `codex plugin {add,list,marketplace,remove}` exists; `codex plugin list`
  errored on a broken marketplace snapshot on this machine but the command
  surface itself is real (observed, exit code 1, structured error not a
  "unknown command").
- `codex doctor` reports config discovery, hook feature flag, MCP servers (4),
  sandbox mode, and marketplaces (`claude-code-warp`, `claude-plugins-official`)
  — evidence Codex actively parses `[hooks]`/`[marketplaces]` in
  `config.toml` (observed).
- `~/.codex/config.toml` `[hooks.state]` table (observed, 30+ entries) proves
  Codex parsed `~/.codex/hooks.json` **and** a project-local
  `Capstone/.codex/hooks.json` **and** three plugin-bundled `hooks/hooks.json`
  files (`hookify@claude-plugins-official`, `security-guidance@…`,
  `vercel@…`, `warp@claude-code-warp`), computing a `trusted_hash` per
  `<source>:<event_snake_case>:<group_idx>:<hook_idx>` key. This is structural
  parse-proof, not fire-proof, but it is strong: Codex read every layer's
  hooks.json, split it into (event, group, hook) triples, and persisted trust
  state per triple.
- `~/.codex/hooks.json` (observed content, 76 lines): top-level
  `{"hooks": {"<EventName>": [{"hooks": [{"type":"command","command":"…",
  "timeout":10}]}]}}`. No `matcher` key present on any group here — omitted
  matcher = match-all, consistent with the docs summary in §3.

## 2. Per-cell verdict table

| cell | current (`spec-verified.ts`) | achievable level now | exact probe command | blocker |
|---|---|---|---|---|
| hook | `none` — "no hook mechanism observed" | `observed` | `cat ~/.codex/config.toml \| grep -A2 hooks.state` after writing a marker hooks.json and letting codex parse it once (e.g. `codex doctor` triggers config load); confirm `trusted_hash` entries appear keyed by the installed hooks.json path | none — already demonstrable, stale only because the row predates codex 0.153 |
| command | `none` — ".codex/commands/term-config.md never appears in prompt-input" | stays `none`, OR re-run the same `codex debug prompt-input` probe used for skill/agent before touching it | `codex debug prompt-input` with only a command artifact installed, grep for the command name | prompt-input is documented as rendering the *model-visible* list; commands may legitimately only surface on invocation (unchanged reasoning from prior note) — re-probe, don't assume it's fixed |
| outputStyle | `none` | stays `none` | n/a | no Codex concept observed anywhere (docs, `--help`, `features list`) — not a hooks-adjacent gap |
| statusline | `none` | stays `none` | n/a | no statusline surface in `codex doctor`, `--help`, or `config.toml` |
| toolNames | `none` | stays `none` (out of scope for #134) | n/a | unrelated to hooks; no observation source identified this session |

Cells NOT touched by #134 (skill/agent/rules already `observed`; scripts/env
`convention`) are unchanged and out of scope.

## 3. The hook contract in full

Primary sources: JSON Schema files fetched verbatim from
`https://raw.githubusercontent.com/openai/codex/main/codex-rs/hooks/schema/generated/*.schema.json`
(fetched 2026-09-04; also cross-checked against the pinned commit
`a7ab2d66d781b903cb060288a89e26e8d2b9a05f` cited in issue #134 — same path,
current `main` schema is unchanged in the fields relevant here) and the
official docs page `https://developers.openai.com/codex/hooks` (308-redirects
to `https://learn.chatgpt.com/docs/hooks`; content below marked "docs" came
from the redirected page via WebFetch summarization — treat as secondary,
weaker than the schema files, since it passed through a fetch-and-summarize
step).

**Envelope** (observed on disk, `~/.codex/hooks.json`, and matches docs):
```json
{
  "description": "optional",
  "hooks": {
    "<EventName>": [
      { "matcher": "regex-or-omit-for-all", "hooks": [ <handler>, ... ] }
    ]
  }
}
```
Config-file locations Codex checks (docs, secondary source; not independently
verified beyond the two we directly observed — user-global `~/.codex/hooks.json`
and project `Capstone/.codex/hooks.json`, both proven via `config.toml`
`hooks.state` trust keys):
`~/.codex/hooks.json`, `~/.codex/config.toml` `[hooks]`, `<repo>/.codex/hooks.json`,
`<repo>/.codex/config.toml` `[hooks]`, plugin `hooks/hooks.json`, and an
enterprise `requirements.toml` `[hooks]` layer. **All matching layers run —
higher precedence never replaces a lower one** (docs; consistent with our
observation that user-global AND project-local hooks both have live trust
entries simultaneously). Project-local hooks require the `.codex/` dir be
"trusted" (docs; not independently verified this session).

**Handler (command type)** — only type observed on disk:
```json
{ "type": "command", "command": "...", "timeout": 10 }
```
Docs additionally describe `command_windows`, `statusMessage`,
`additionalContextLimit`, `async`, and an `mcp_tool` handler type — none of
these appear in the on-disk `~/.codex/hooks.json`, so treat as docs-only
(secondary) until directly observed.

**Events** (event names in hooks.json are PascalCase; `config.toml`
`hooks.state` keys the same events snake_case — both forms directly observed):
`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`,
`PostToolUse`, `SubagentStart`, `SubagentStop`, `Stop` (all 8 observed firing
registrations in `~/.codex/hooks.json`); `PreCompact`/`pre_compact` and
`SessionEnd`/`session_end` additionally appear in `config.toml` trust keys
(observed) and have their own schema files (fetched filenames, §Investigation).
Docs additionally name `PostCompact` and `Interrupt` — schema files for both
exist (`post-compact.*`, `interrupt.*`) confirming the event exists in the
wire protocol, but neither had a trust entry on this machine, so "fires in
practice" is not directly observed for those two.

**Matcher**: regex string, filters by tool name for `PreToolUse`/
`PostToolUse`/`PermissionRequest` (`tool_name` is a required field in the
`pre-tool-use.command.input.schema.json`, confirmed directly). Omit or `"*"`
matches everything — consistent with the on-disk file, where every group
omits `matcher` and DID trigger trust entries for the events those groups are
under.

**Decision/output schema** (fetched directly from the 4 output schemas
pulled — `pre-tool-use`, `post-tool-use`, `permission-request`,
`session-start` — all `additionalProperties: false`):

`PreToolUse` output:
```json
{
  "continue": true,
  "decision": "approve" | "block",
  "reason": "string",
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow" | "deny" | "ask",
    "permissionDecisionReason": "string",
    "additionalContext": "string",
    "updatedInput": {}
  },
  "stopReason": "string", "suppressOutput": false, "systemMessage": "string"
}
```
Deny example (schema-valid):
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"blocked: matches .env"}}
```
The legacy wrapper cited in #134 —
`{"permissionDecision":"deny","reason":"..."}` at the **top level** — is
invalid against this schema: `permissionDecision` is not a top-level property
(only `decision`/`reason` are, and `decision` only accepts `"approve"|"block"`,
not `"deny"`), and `additionalProperties:false` rejects the unknown top-level
key outright. This precisely explains codex's observed
"Hook returned invalid pre-tool-use JSON output" from the issue.

`PostToolUse` output (fetched): `continue`, `decision:"block"` (only enum
value), `reason`, `hookSpecificOutput.{hookEventName:"PostToolUse",
additionalContext, updatedMCPToolOutput}`. **No top-level `additionalContext`
field exists in this schema** — see §6, `plan-format-kanban` emits exactly
that shape today and would fail on Codex.

`PermissionRequest` output (fetched) — different shape from PreToolUse, not a
simple alias:
```json
{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"|"deny","message":"string"}}}
```
`interrupt`, `updatedInput`, `updatedPermissions` fields exist in the schema
but are documented in the schema's own `description` as "reserved… hooks
currently fail closed if present" — i.e. setting them today causes a deny,
not a no-op. Any Codex adapter must never emit these three fields.

`SessionStart` output (fetched): `continue`, `hookSpecificOutput.
{hookEventName:"SessionStart", additionalContext}`, `stopReason`,
`suppressOutput`, `systemMessage` — **and, separately from the schema,
plain-text stdout is documented (secondary source, cross-referenced against
two independent GitHub issue threads discussing the same Claude-Code-derived
behavior — thedotmack/claude-mem#1237, #2361) as tolerated for SessionStart
specifically and treated as additionalContext.** This is not proven by the
schema file itself (which is strict), so treat "plain text OK for
SessionStart" as inferred-from-secondary-sources, not observed directly on
this machine.

**Exit-code shortcut**: exit code 2 + stderr text is documented (secondary
source, WebFetch of the redirected official docs page, §5 of that fetch) as
equivalent to `{"decision":"block","reason":"<stderr>"}` for events that can
block (PreToolUse etc.), and takes priority over any JSON also printed. This
is corroborated by `kit/hooks/scout-block/hook.cjs` and
`kit/hooks/privacy-block/hook.cjs` already using exactly this pattern
(`process.exit(2)` + `console.error(...)`) with no Codex-specific complaint
noted anywhere in the repo or issue — consistent with exit-2 already working
unmodified on Codex. Not independently verified by running a real hook
invocation (would spend credits), so still an inference, but a strong one
from two convergent sources (schema shape + repo's existing usage pattern +
docs text).

**Trust mechanism** (observed directly via `config.toml` `[hooks.state]`):
non-managed hooks require trust before running. Trust is recorded per
`<hooks.json-path-or-plugin-id>:<event_snake_case>:<group_index>:<hook_index>`
as `trusted_hash = "sha256:<hex>"`; a hook can be disabled without removing
trust via `enabled = false` alongside the hash (observed for the disabled
`security-guidance` plugin entries). `--dangerously-bypass-hook-trust` skips
this for one invocation (observed in `codex --help`). No `/hooks` CLI
subcommand exists in `codex --help`'s command list — the docs' `/hooks`
reference is a TUI slash-command, not a `codex hooks ...` CLI subcommand
(inferred: absent from the enumerated `Commands:` list in `codex --help`,
which does list `doctor`, `debug`, `plugin`, etc., so the omission is
meaningful, not a truncation).

## 4. Install/binding design constraints

Hard constraint proven on this machine: `~/.codex/hooks.json` already holds
**two other tools'** entries (Orca, herdr) and codex's plugin marketplace
mechanism adds three more sources via `hooks/hooks.json` inside plugin
packages. Any ariadnev install must:

1. **Never overwrite `hooks.json` wholesale.** Read-modify-write: parse JSON,
   locate/insert ariadnev's own event→group entries, write back. A group is
   identified as ariadnev's by structural identity (its own `command` path
   under the install dir), not by position, since other tools may add/remove
   groups over time.
2. **Prefer a dedicated ariadnev group per event over merging into an
   existing group.** The on-disk file already models "one event → array of
   independent groups, each with its own `hooks: [...]`" — this is exactly
   the extension point; add ariadnev's own `{ "hooks": [...] }` object into
   each event's array rather than appending into someone else's `hooks[]`.
3. **Command should be the same 60-hook `.cjs` corpus, invoked exactly as
   `.claude/hooks/av/` are today**, but ariadnev needs a *new* install root
   for Codex since `resolver.ts`'s `codexBase` (for `hook` kind) currently
   returns `ctx.home` unconditionally (same as agent/command/skill) — so the
   natural target is `~/.codex/hooks/av/<name>.cjs` (mirroring
   `CLAUDE_HOOKS_DIR = ".claude/hooks/av"`) plus a hooks.json entry
   `{"type":"command","command":"node ~/.codex/hooks/av/<name>.cjs"}` per
   binding. This keeps codex's install home-anchored, consistent with the
   documented rationale in `resolver.ts:60-64` ("Codex installs to the user
   home regardless of scope (reference parity)").
   - Caveat: project-local `.codex/hooks.json` is proven to be a real,
     independently-trusted layer (§1). If ariadnev ever wants project-scoped
     hook installs (mirroring how `.codex/agents`/`.codex/commands` are
     scope-agnostic today), that's a second target, not a replacement — out
     of the "home-anchored" precedent unless a future issue asks for it.
4. **Trust is a NEW post-install step with no Claude Code analog.** After
   writing hooks.json, the hooks are untrusted until the user runs Codex's
   TUI `/hooks` or otherwise generates a `trusted_hash` entry — there is no
   CLI subcommand to pre-trust from the installer's shell context (§3, no
   `codex hooks` command found). The install/summary output should say this
   explicitly (mirrors the existing "after a y/n confirmation" flow for
   claude-code hooks in `kit/hooks/README.md`, but Codex additionally
   requires an interactive trust step ariadnev cannot perform for the user).
   `--dangerously-bypass-hook-trust` is not a fix for ariadnev's own install
   flow — it's a per-invocation runtime flag for the *user's* codex
   sessions, orthogonal to installation.
5. **Merge behavior on re-install/uninstall**: identify "our" groups by the
   ariadnev-owned command path prefix (`~/.codex/hooks/av/`) so re-running
   install replaces only those groups (idempotent) and `ariadnev uninstall`
   removes only those groups, leaving Orca/herdr/plugin entries untouched.
   This is the direct analog of claude-code's existing "merges the event
   bindings into `.claude/settings.json`" behavior (`kit/hooks/README.md`)
   but for a JSON array-of-groups shape instead of settings.json's shape —
   the merge *logic* needs a Codex-specific implementation, it can't reuse
   the claude-code settings.json merger as-is.

## 5. Legacy wrapper detection

Not observed on disk on this machine (no `ck`/`claudekit` install artifacts
found under `~/.codex` or `~`; `ck` resolves to an nvm shell wrapper only,
`claudekit` binary absent). Everything below is **inferred** from issue #134's
own reproduction text plus web search of `ck migrate`'s documented behavior
(`docs.claudekit.cc/docs/cli/migrate/`, secondary source, not independently
verified):

- The wrapper is a generated Codex `hooks.json` entry whose `command` points
  at a shell script that itself emits Claude-Code-shaped JSON — specifically
  a top-level `{"permissionDecision":"deny","reason":"..."}` object instead
  of the Codex-schema-valid nested `hookSpecificOutput` form.
- Static detection predicate (weak, heuristic): for each `command` string in
  an installed `hooks.json`, if the referenced script's source contains
  `permissionDecision` as a **top-level** JSON key in its emitted output
  (i.e., not nested inside a `hookSpecificOutput: {...}` object) — detectable
  by grepping the script for `JSON.stringify({...permissionDecision...})`
  patterns where the enclosing object literal has no `hookSpecificOutput`
  sibling key. This is pattern-matching source, not behavior — false
  negatives are likely (e.g., dynamically constructed JSON).
- Stronger detection (behavior-based, but requires invoking the script):
  execute the wrapper's `command` against a synthetic `PreToolUse` input
  fixture and validate the emitted stdout against the pulled
  `pre-tool-use.command.output.schema.json` with a JSON-Schema validator; a
  schema-invalid legacy-shaped object is caught directly. This is the
  reliable predicate — no model call is needed, it's local JSON-Schema
  validation. `packages/cli` doesn't currently import a JSON-Schema
  validator (checked: no `ajv`/`zod`-schema-of-this-shape found for hooks);
  a plan should decide whether to hand-write the ~6 relevant field checks or
  pull in a validator.
- Reporting: since ariadnev cannot silently rewrite a third-party/foreign
  hooks.json entry it doesn't own (constraint in §4), the safe action is
  **diagnose + copy-pasteable remediation** (issue #134's own open question
  leans this way too — "only diagnosed with a copy-pasteable remediation").
  Auto-healing would require proving ownership of the wrapper script, which
  nothing in the corpus does today.

## 6. Remaining non-hook gaps (codex 0.153.1 vs what ariadnev installs)

- **`codex plugin` / marketplace system**: real, stable (`plugins: stable
  true` in `features list`), lets third parties ship skills+agents+hooks as
  one unit via a marketplace manifest. Ariadnev has no equivalent packaging
  or install path — out of scope for #134 specifically (which is hooks-only)
  but is the largest surface gap for "full parity" in the broader sense the
  task description raises. Not investigated further (task scope is hooks).
- **`command` cell still plausibly fixable**: unrelated to hooks, but the
  existing `none` verdict predates 0.153.1; worth a `codex debug prompt-input`
  re-probe in the same session as the hook work since it's the same
  read-only tool already in the codebase's evidence methodology. Not
  reprobed this session (would require installing a command artifact into a
  scratch tree, out of the read-only/no-source-edit constraint given for
  this research task).
- **`AGENTS.md` handling**: unchanged since 0.147.0 observation — still
  `observed` and not part of this gap.
- **PostToolUse `additionalContext` bug found in the existing corpus**:
  `kit/hooks/plan-format-kanban/hook.cjs:99` emits
  `{ continue: true, additionalContext: warnings.join('\n') }` for a
  `PostToolUse` binding. Per the fetched `post-tool-use.command.output.schema.json`,
  top-level `additionalContext` is not a valid property (only
  `hookSpecificOutput.additionalContext` is, and PostToolUse's
  `hookSpecificOutput` additionally requires `hookEventName:"PostToolUse"`).
  This is a **pre-existing latent Codex-incompatibility**, independent of
  #134's PreToolUse focus, that a Codex-adapter pass should catch. Flagging,
  not fixing (out of scope — advisory only, no source edits).
- **Hooks that already look Codex-correct** (no change needed once the
  adapter/install work lands): `descriptive-name` (comment explicitly
  documents the Codex constraint it satisfies), `secret-output-guardrail`,
  `simplify-gate`, `subagent-init`, `team-context-inject`,
  `cook-after-plan-reminder` (all emit nested `hookSpecificOutput` with a
  correct `hookEventName`, or the `{continue,decision,reason}` legacy-valid
  shape that IS schema-valid for PreToolUse/PostToolUse). `privacy-block` and
  `scout-block` use the exit-2+stderr path, inferred-safe per §3.
  `session-init`'s plain-text SessionStart stdout is inferred-safe per §3's
  SessionStart tolerance discussion — inference only, not directly observed.

## 7. Risks and unknowns

- **Plain-text SessionStart tolerance is inferred, not directly observed on
  this exact codex-cli 0.153.1 build.** If wrong, `session-init` — the
  single most load-bearing hook (fires every session) — breaks on Codex
  install day one. This should be the first thing a real (budgeted,
  credit-spending) probe validates before shipping, or gated behind a
  feature flag until confirmed.
- **Handler fields beyond `type`/`command`/`timeout`** (`command_windows`,
  `statusMessage`, `additionalContextLimit`, `async`, `mcp_tool` type) are
  docs-only claims, never seen on this machine's actual hooks.json. Don't
  design the installer around them without independent confirmation.
- **Merge-warning behavior** ("mixing hooks.json and inline `[hooks.state]`
  triggers a warning") is docs-only; not tested. Low risk since ariadnev
  would only ever write to `hooks.json`, never to the TOML `[hooks]` table
  directly (the TOML `[hooks]` block observed on this machine is Codex's own
  trust-state cache, not a place ariadnev should write hook *definitions*).
- **No JSON-Schema validator currently in `packages/cli`** for the hook
  output shapes — a plan implementing the Codex adapter needs to decide
  whether to hand-roll validation (KISS, matches repo's existing
  hand-rolled-adapter style in `packages/cli/src/adapt/`) or add a
  dependency. Hand-rolling 4-5 small shape checks (PreToolUse,
  PostToolUse, PermissionRequest, SessionStart output shapes) is more
  consistent with the repo's existing "no ESLint, hand-rolled everything"
  posture (`CLAUDE.md`) than pulling in ajv.
- **`test-codex-runtime.mjs` is pinned to `expectedRuntimeVersion = "0.147.0"`**
  (`packages/cli/scripts/test-codex-runtime.mjs:19`) and gated behind
  `ARIADNEV_LIVE_CODEX=1` (not set here, not run). A parity plan touching the
  codex row should note this pin needs bumping to 0.153.1 alongside
  `spec-verified.ts`'s `observedVersion`, but that script spends model
  credits and was correctly NOT run for this research task.

## 8. Unresolved questions

1. Does codex-cli 0.153.1 actually tolerate plain-text `SessionStart` stdout,
   or was that behavior specific to an older/different build referenced by
   the GitHub issues found via search? Needs one real (budgeted)
   `codex exec`/interactive probe with `session-init` installed, before
   relying on it in a shipped adapter.
2. Is `PreCompact`/`PostCompact`/`Interrupt`/`SessionEnd` actually reachable
   in the current TUI+exec flows, or only in `app-server`/experimental modes?
   Schema files exist but no trust entries for `PostCompact`/`Interrupt` were
   observed on this machine, unlike the other 8 events which do have trust
   entries.
3. Exact behavior when a hooks.json group's hash changes (e.g. ariadnev
   ships a hook update) — does trust silently re-prompt, silently disable,
   or silently continue running the old-hash-trusted version until
   re-approved? Determines whether "update = re-trust needed" is a UX note
   the installer must surface every release.
4. Whether `codex plugin` packaging is the eventual right vehicle for
   ariadnev's hook (and skill/agent) distribution to Codex instead of direct
   file writes — raised by issue #134's own "install/config target" open
   question but not resolved here; deliberately out of this research's scope
   (hooks-focused per the task brief).

Status: DONE
Summary: Codex 0.153.1 hooks are a real, stable, schema-strict feature (`hookSpecificOutput` nested shapes, `additionalProperties:false`); the hook cell in `spec-verified.ts` is stale and can be lifted to `observed` off `config.toml`'s `[hooks.state]` trust-parse evidence, project-local `.codex/hooks.json` is a proven second install surface, and the install design must read-modify-write the shared `hooks.json` to coexist with Orca/herdr/plugin entries already present on real machines.
Concerns/Blockers: SessionStart plain-text tolerance and PreCompact/Interrupt/SessionEnd reachability are inferred from secondary sources only, not directly observed on 0.153.1 — flag for a real (credit-spending) probe before the plan finalizes the adapter design; a pre-existing PostToolUse schema violation was found in `kit/hooks/plan-format-kanban/hook.cjs` unrelated to #134's PreToolUse focus.