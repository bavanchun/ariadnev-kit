# Antigravity Provider Runtime — Evidence Ceiling Research

Advisory only. Zero model-spend commands used throughout (`--help`, local listing
subcommands, `find`/`cat`/`strings` on disk). No `agy -p`/interactive/prompt run.

## 1. Live `agy` 1.1.25 capability surface

`agy --version` → `1.1.25` (verbatim).

Top-level flags (from `agy --help`): `--add-dir --agent --continue --conversation
--dangerously-skip-permissions --disable-slash-commands --effort --input-format
--json-schema --log-file --mode --model --new-project --output-format --print
--print-timeout --project --prompt --prompt-interactive --sandbox`.

Subcommands and safety classification (all invoked with `--help` and/or bare,
no `-p`/`--prompt`/interactive):

| Subcommand | Safe (local/listing) | Prompt-spending | Notes |
|---|---|---|---|
| `agent` / `agents` | ✅ | — | "List available agents." Ran bare: **empty output**, exit clean. Same command under both names (`Usage: agy agent`). |
| `models` | ✅ | — | Ran bare: hits network ("Fetching available models...") but does not invoke a model — lists 14 model IDs/labels. Borderline network-dependent, zero token spend. |
| `mcp list/add/remove/enable/disable` | `list` ✅, others mutate config (not run) | — | `agy mcp list` printed 2 configured servers (chrome-devtools-mcp, supabase), matches `~/.gemini/config/mcp_config.json` verbatim. |
| `plugin`/`plugins` `list/import/install/uninstall/enable/disable/validate/link` | `list` ✅, `validate [path]` likely local-only (not run — untested) | — | `agy plugin list` / `agy plugins list` → "No imported plugins." (6 plugins are enabled via `config.json` but none "imported" via this subsystem — different concept, see §2.) |
| `changelog` | ✅ | — | Local. Ran bare: prints release notes back to 1.1.24+ verbatim, no network/model call observed (near-instant). |
| `install` | mutates shell profile/PATH — not run | — | Declared purpose only, not executed (would touch `~/.zshrc` etc., out of scope for a read-only probe). |
| `update` | not run | — | Would fetch/install a new binary; out of scope. |
| `mic-serve` | not run (starts a server) | — | Irrelevant to this task. |
| `-p`/`--prompt`/`--prompt-interactive`/bare `agy` | — | 🚫 FORBIDDEN | Never invoked. |

**Zero-spend inventory usable for probes**: `agy agent`, `agy mcp list`, `agy
plugin list`, `agy changelog`, `agy --version`, all `--help` variants.

## 2. `~/.gemini/` layout map

Two distinct trees exist under `~/.gemini/`, and conflating them is the
easiest mistake:

- **`~/.gemini/config/`** — the customization root the vendor's own bundled
  docs (§3 below) name as agy's "Global Configuration" discovery path.
- **`~/.gemini/antigravity-cli/`** — the CLI's private runtime/state dir
  (conversations, cache, oauth token, **and its own separate
  `settings.json`/`mcp_config.json`/`skills/`/`builtin/`**). This is where
  `agy`'s actual process reads its live settings and ships built-in skills.
- **`~/.gemini/antigravity/`, `~/.gemini/antigravity-backup/`,
  `~/.gemini/antigravity-browser-profile/`, `~/.gemini/antigravity-ide/`** —
  other Antigravity surfaces (Antigravity 2.0 app, IDE, browser automation
  profile). Not `agy`. Out of scope but explains the sprawl.
- **`~/.gemini/settings.json`** (top-level, NOT under `config/`) — contains a
  **Claude-Code-shaped hook config** (`UserPromptSubmit`/`BeforeTool`
  events, `$CLAUDE_PROJECT_DIR`, `.claude/hooks/*.cjs` commands). This is a
  **different, unrelated tool's file** sharing the `~/.gemini` home (evidence:
  its event names and payload shape match Claude Code's hook contract, not
  agy's — see §3). Do not treat this as an antigravity signal.

`~/.gemini/config/` contents relevant to ariadnev, with observed-vs-present
marked:

| Path | Exists on disk | Confirmed *discovered* by agy | Basis |
|---|---|---|---|
| `config/skills/` | ✅ (1 real skill: `obsidian-second-brain-note`, plus a `.venv`) | Not directly — but `agy-customizations/docs/skills.md` (vendor doc bundled inside the CLI itself, `~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/skills.md`) names `~/.gemini/config/` as "Global Configuration… Applies to all projects" | Vendor doc, not a runtime observation |
| `config/agents/` | ✅ (16 `.md` files, flat, e.g. `researcher.md`) | **No** — `agy agent`/`agy agents` returned empty despite this dir being populated | Ran; see §4 hypothesis on why |
| `config/hooks.json` | ✅ (live, written by third-party tool Orca) | **Yes, indirectly** — its shape matches the vendor's documented `hooks.json` schema exactly (event names, matcher/hooks wrapper, flat vs grouped structure per event) — i.e. some tool wrote a file that conforms 1:1 to agy's documented contract, which is strong circumstantial confirmation the schema doc is accurate, though not proof agy itself is firing these hooks on this machine right now | Cross-checked against `docs/hooks.md`, §3 |
| `config/hooks.json.bak` | ✅ | n/a | Auto-backup exists — some writer (agy or Orca) keeps one prior version. Relevant to install co-existence design (§6). |
| `config/mcp_config.json` | ✅ | **Yes** — `agy mcp list` echoed exactly its 2 entries | Ran `agy mcp list`, byte-identical to file content |
| `config/plugins/` | ✅ (6 plugins: android-cli-plugin, chrome-devtools-plugin, firebase, google-antigravity-sdk, modern-web-guidance-plugin, science) | Partially — `config.json`'s `plugins` map enables them, but `agy plugin list` says "No imported plugins" (different subsystem: "enabled/discovered" ≠ "imported" in agy's plugin model per `docs/plugins.md`) | Ran; cross-checked against `docs/plugins.md` |
| `config/config.json` | ✅ | **Yes** — content matches `docs/plugins.md`'s documented `{"plugins":{"<name>":{"enabled":true}}}` shape exactly | File read + doc cross-check |
| `config/sidecars/` | ✅ (empty) | Not observed | — |
| `config/skills.json` / `config/plugins.json` | **Absent** | n/a | Optional JSON registries per `docs/json_configs.md`; not present on this machine |
| Workspace `.agents/` (project-relative, e.g. `ariadnev-kit/.agents/`) | Not present in this repo | n/a | Per `docs/skills.md`/`docs/agy-customizations` this is agy's **higher-priority** discovery root (workspace beats global) — ariadnev currently only targets the global `~/.gemini/config/` per README matrix; worth reconciling if this repo's own `.agents/skills/` (used for codex/cursor/omp/generic today, per `paths.ts` L9) is *also* silently read by agy when running inside this repo |

## 3. The hook contract in full

Source: `~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/hooks.md`
— a doc file **shipped inside the `agy` binary's own builtin skill bundle**,
i.e. first-party but static documentation, not a live-fire observation.
Cross-checked against the live `~/.gemini/config/hooks.json` (Orca's file) —
**no disagreement found**; every field/event Orca uses is documented, and vice
versa (Orca just doesn't use `PostToolUse`'s absence... it does use both).

**File location & format**: single `hooks.json` in the customization root
(`~/.gemini/config/hooks.json` globally, or `<workspace>/.agents/hooks.json`).
Top-level keys are **hook names** (arbitrary, e.g. `"orca-status"`), each
mapping to an event-config object.

**Supported events** (5 total — fewer than Claude Code's 8+):

| Event | Fires | Matcher | Structure |
|---|---|---|---|
| `PreToolUse` | before a tool step executes | tool name regex, e.g. `run_command` (derived by lowercasing `CORTEX_STEP_TYPE_*` and dropping the prefix) | grouped: `[{matcher, hooks:[...]}]` |
| `PostToolUse` | after a tool step completes | same | grouped, same shape |
| `PreInvocation` | before the model is called | N/A (ignored) | flat: `[{type,command,timeout}, ...]` |
| `PostInvocation` | after tool calls finish | N/A | flat |
| `Stop` | execution loop terminates | N/A | flat |

No `SessionStart`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, or
`PreCompact` equivalent exists. `PreInvocation`/`PostInvocation` are
model-call-scoped, not session-scoped — they fire once per model turn, not
once per session.

**Matcher syntax** (`PreToolUse`/`PostToolUse` only): `"*"` or `""` = all;
exact tool name; `a\|b` alternation; `browser_.*` regex-style prefix.

**Handler fields**: `type` (only `"command"` supported — "prompt hooks are not
currently supported" per binary string), `command` (shell string, `sh -c` on
Unix, `~` expanded, cwd = the directory containing `hooks.json`), `timeout`
(seconds, default 30 per doc; Orca's file explicitly sets `10`).

**stdin payload** — common fields on every hook: `conversationId`,
`workspacePaths`, `transcriptPath`, `artifactDirectoryPath` (dir name varies
by surface: `antigravity-cli/` for the CLI, `antigravity/` for the 2.0 app,
`antigravity-ide/` for the IDE), `modelName`. All keys camelCase (protojson).

**Decision vocabulary** — by event:

- `PreToolUse` stdout: `{"decision": "allow"|"deny"|"ask"|"force_ask", "reason"?, "permissionOverrides"?, "overwrite"?}`. Example allow: `{"decision":"allow"}`. Example deny: `{"decision":"deny","reason":"no rm -rf"}`. Example ask (Orca's actual fallback, verbatim from `hooks.json`): `{"decision":"ask"}`. `overwrite` does a **shallow top-level merge** into the tool call's args (documented explicitly, not deep-merge).
- `PostToolUse` stdout: expects `{}` (empty object).
- `PreInvocation` stdout: `{"injectSteps": [{"ephemeralMessage": "..."}]}` — can also inject `{"toolCall":{...}}` or `{"userMessage":"..."}` steps.
- `PostInvocation` stdout: `{"injectSteps": [], "terminationBehavior": "force_continue"|"terminate"|""}`.
- `Stop` stdout: `{"decision": "continue"|<anything else>, "reason"?}` — only `"continue"` blocks the stop.

**Limitations documented**: command-type only (no HTTP/prompt hooks), hooks
run **synchronously and block the agent loop** (no async).

**Binary corroboration**: `strings` on `/Users/vchun/.local/bin/agy` contains
`"pre-tool hook %s not registered"`, `"stop hook %s not registered"`,
`"command hook cannot specify 'model'"`, `"command hook must specify
'command'"`, `"prompt hooks are not currently supported"`, `"failed to parse
mcp_config_json"`, `"unsupported hook event arguments type: %T"` — all consistent
with the doc's claims, from the actual shipped executable rather than just the
doc file.

**Live file vs docs**: no disagreement found. Orca's `hooks.json` is a superset
example (uses 5 events; doc's own example only shows 3) but every field it uses
matches the documented schema exactly.

Official vendor doc (not fetched — network URL cited by the bundled skill,
would require WebFetch/WebSearch which was available but the bundled doc was
sufficient and authoritative for this machine's exact CLI build): the skill
itself points to `https://antigravity.google/docs/hooks` for "the latest
updates" — not independently fetched in this pass; treat the bundled doc as
build-1.1.25-accurate and the live URL as a freshness check for future runs.

## 4. Per-cell verdict

| Cell | Current (`spec-verified.ts`) | Achievable level now | Exact zero-spend probe | Blocker |
|---|---|---|---|---|
| `skill` | convention | **convention, materially strengthened** | No local "list loaded skills" subcommand exists. Strongest available: cross-check `~/.gemini/config/` against the vendor's own bundled `docs/skills.md`, which explicitly names it as the global discovery root — already done here. Ceiling stays `convention` because no command lists *loaded* skills (unlike codex's `debug prompt-input` or opencode's `debug skill`). | No `agy skills list` / `agy debug` equivalent exists in the subcommand inventory (§1) |
| `agent` | convention | **convention, but flag the mismatch** | `agy agent` (ran, zero-spend) returned **empty** despite 16 `.md` files in `config/agents/`. Do NOT flip to `observed` — an empty listing while files sit in the target dir is evidence the *current path/shape is wrong*, not evidence of a working load. See hypothesis below. | Best current fix-and-reverify probe: restructure one test agent to `config/agents/<name>/agent.md` (nested, changelog names the file `agent.md`) with frontmatter fields the changelog documents (`mainAgent`, `subagent`, `hidden`, `inheritMcp`, `commandExecutionPolicy` — NOT `name`/`tools`/`memory` as ariadnev's kit format uses), then rerun `agy agent` and check for a name. This is a concrete next-session task, not evidence gatherable this session. |
| `command` | none | **none** — stays | No command-listing surface found (no `/slash-commands list` local subcommand; TUI `/help` is interactive) | No zero-spend probe exists |
| `rules` | convention | **convention, materially strengthened** | Vendor doc (`docs/rules.md`) explicitly documents `GEMINI.md`/`AGENTS.md` walked from CWD to repo root, no frontmatter support — matches the existing convention rationale precisely | No local surface renders "loaded rules" without a live run |
| `scripts` | convention | convention — stays | Shares `.agents/skills` root; no separate discovery surface | — |
| `env` | convention | convention — stays | Template file only, nothing reads it locally | — |
| `hook` | **none** | **convention** (upgrade recommended) | `~/.gemini/config/hooks.json` exists, live, and its schema is fully vendor-documented (§3) with the doc bundled inside the CLI binary itself — this is materially stronger than a "neutral cross-tool layout" convention claim used elsewhere in the table (e.g. `.agents/`). Recommend upgrading to `convention` with a note citing the bundled doc + binary string corroboration, NOT `observed` (no live fire was watched). | Ceiling is `convention` not `observed` because no hook was watched actually firing under agy control (Orca's presence, not agy's, produced the observable file) |
| `outputStyle` | none | none — stays | No equivalent concept in any doc or binary string found | No neutral convention exists either |
| `statusline` | none | **convention** (weak, optional upgrade) | `antigravity-cli/settings.json` has a literal `"statusLine": {"type": "", "command": "", "enabled": true}` key — a real, user-configurable statusline concept exists in agy's own settings schema, unpopulated on this machine | Recommend `convention` only if the note is explicit that the *key* is confirmed present in agy's settings schema but no working example was observed rendering anything |
| `toolNames` | none | **none stays, but the mapping is now known** | `strings` on the binary yields the literal system-prompt fragment `"When taking actions, always use specialized tools such as grep_search, find_by_name, view_file, write_to_file, edit_file, multi_replace_file_content, and list_dir."` plus `codebase_search`, `run_command`, `manage_task`, `manage_subagents`, `manage_inbox`, `send_message`, `invoke_subagent`, `edit_notebook`, `propose_code` as separate literals, and the full `CORTEX_STEP_TYPE_*` enum (124 values) which the hook doc says map 1:1 to matcher-usable tool names via `lowercase(strip("CORTEX_STEP_TYPE_", name))`. This is **static binary string extraction**, not a runtime observation — a real invocation could still show different names actually sent to the model (system prompts can differ from user-facing docs). Keep `none` in the ladder's strict sense; the mapping itself is documented in §5 as INFERRED for the plan to use once a probe run is authorized. | Zero-spend ceiling for this cell is `none` per the ladder's own definition (needs the provider "seen to load" — a live run) |

`observedVersion`: string is `"1.1.25"` (verbatim `agy --version`). No
separate build/commit hash surfaced by `--version`; `agy changelog` gives a
per-version bullet list keyed by the same `1.1.25` string, sufficient to pin.
Recommend recording exactly `"1.1.25"` (matches the existing `codex-cli
0.147.0` / `omp/18.0.4` style) with `observedOn` left `null` until a live probe
runs — this session confirms *config layout and hook schema*, not a live
tool-call/skill-load observation, so `observed` cannot be claimed for any path
cell yet.

## 5. Tool-name mapping findings (INFERRED — static binary extraction, not a live observation)

From `strings /Users/vchun/.local/bin/agy` (build tied to the "1.1.25"
`--version` output; re-extract if the binary updates):

| Canonical kit name | Antigravity literal found | Confidence |
|---|---|---|
| Bash | `run_command` | High — appears in doc's own matcher example, in a system-prompt fragment, and as a `CORTEX_STEP_TYPE_RUN_COMMAND` step type |
| Read | `view_file` (also a lone `read_file` literal appears in an unrelated Action= sub-agent template — likely legacy/internal, not the primary tool name) | High for `view_file`, low for `read_file` |
| Write | `write_to_file` | High (system-prompt fragment) |
| Edit | `edit_file`, and/or `multi_replace_file_content`, `propose_code` (an older/alternate name, `CORTEX_STEP_TYPE_PROPOSE_CODE` step type exists) | Medium — three distinct-looking literals for adjacent concepts, unclear which is primary vs deprecated without a live run |
| Grep | `grep_search` | High |
| Glob | `find_by_name` (per the embedded search-priority doc table: `grep_search` > `find_by_name` > `view_file` > `search_web`) | High |
| Task/subagent | `invoke_subagent` (`CORTEX_STEP_TYPE_INVOKE_SUBAGENT`), plus `manage_subagents` for lifecycle control | High |
| TodoWrite | No direct equivalent found. `manage_task` exists but its documented semantics (`manage_task(Action="list"/"kill"/"send_input")`) govern **background/async tasks**, not a user-facing todo list — do not map TodoWrite→manage_task without further evidence | Low — recommend leaving unmapped |
| AskUserQuestion | No standalone tool literal found. `"ask_user"` and `decision=ask_user` appear only inside an internal "PolicyGuardian" gating context, not as a callable tool name | None — do not map |
| Codebase-wide semantic search (no kit equivalent) | `codebase_search` (`SEMANTIC_CODEBASE_SEARCH_TYPE_*`) | High existence, no kit mapping needed |

This entire table is **binary-string-derived, static analysis** — genuinely
zero-spend, but it is not the ladder's `observed` category (which requires the
provider to be *run* and *seen* to load/use the name). Recommend the plan
treat this as a high-confidence hypothesis to *design against*, and require
one real `agy -p` run (spending the user's credits, with consent) before
flipping `toolNames.verified` to `true`.

## 6. Install / co-existence design constraints

1. **`hooks.json` is multi-tenant by design.** Top-level keys are hook
   *names* chosen by the writer (Orca uses `"orca-status"`); the doc states
   "Multiple named hooks … for the same event type are merged and executed
   sequentially." ariadnev must add its own top-level key (e.g. `"av"` or
   `"ariadnev"`) and merge-write, never replace the file wholesale — Orca's
   entry must survive.
2. **Back up before writing.** `config/hooks.json.bak` already exists next to
   the live file — some writer in this ecosystem keeps one prior version.
   ariadnev's own atomic-write + keep-last-3 convention (per repo CLAUDE.md)
   is compatible and should be used identically here.
3. **Global vs workspace precedence.** Per `docs/agy-customizations` priority
   order, workspace `.agents/hooks.json`/`.agents/skills/` etc. **outrank**
   `~/.gemini/config/`. If ariadnev ever also writes to a project's
   `.agents/` tree (it already does, for codex/cursor/omp/generic per
   `paths.ts`), an antigravity user running `agy` inside that same repo may
   pick up those files too, ahead of the global config — this is a
   cross-provider interaction the matrix doesn't currently model and is worth
   a follow-up question (§8).
4. **`config.json`'s plugin-enable map is separate from `hooks.json`/
   `mcp_config.json`.** If ariadnev ever ships an antigravity *plugin* bundle
   (skills+rules+hooks+mcp in one namespaced unit, per `docs/plugins.md`)
   rather than writing loose files into `config/`, it would need to add an
   entry under `config.json`'s `"plugins"` map to enable it — a different
   merge target than `hooks.json`.
5. **Agent file shape is likely wrong today.** The 16 files at
   `config/agents/*.md` are flat, single-file, and use ariadnev's own kit
   frontmatter (`name`/`tools`/`description`/`memory`). The vendor's changelog
   documents Markdown custom agents as `agent.md` files with a different
   frontmatter vocabulary (`mainAgent`/`subagent`/`hidden`/`inheritMcp`/
   `commandExecutionPolicy`), and the binary contains the literal path
   `.agents/agents/` (workspace-relative), mirroring `.agents/skills/`'s
   `<name>/SKILL.md` nesting pattern. If ariadnev's installer wrote these
   files, the write path/shape should be revisited before spending a live
   probe to reverify — a shape fix is cheaper than more zero-spend
   investigation and directly explains the empty `agy agent` listing.

## 7. Risks and unknowns

- **Doc-vs-runtime drift.** All of §3's contract and §5's tool names come from
  a doc file and a binary, both bundled with *this machine's* 1.1.25 build.
  Antigravity ships frequent point releases (1.1.24→1.1.25 changelog alone
  has 10 items); the mapping is a snapshot, not a guarantee for future
  versions.
- **`agy models` and `agy plugin list/import` may be network-dependent** even
  though they spend no model tokens — `agy models` printed "Fetching
  available models..." before returning, implying an API call. This is a
  softer boundary than "purely local" and should be flagged in any probe
  script as "network, not model-spend."
  - Note also `.gemini/config/plugins/*` shows 6 *enabled* (via `config.json`)
    plugins that `agy plugin list` reports as zero *imported* — two different
    subsystems inside agy's plugin model that aren't reconciled by any doc
    read this session.
- **`~/.gemini/settings.json`'s Claude-shaped hooks are a false trail.** Any
  future grep for "antigravity hooks" that doesn't filter by directory will
  find this unrelated file and misattribute Claude Code hook semantics to
  antigravity. Worth a code comment if a probe script ever walks `~/.gemini`.
- **Agent-discovery root is unconfirmed.** §2/§4/§6 lay out a strong,
  falsifiable hypothesis (wrong file shape/frontmatter) for why `agy agent`
  returns empty, but it is INFERRED, not proven — the only way to confirm is
  either a live run (spends credits) or trial-and-error zero-spend file
  restructuring + rerunning the zero-spend `agy agent` listing (which is
  itself zero-spend and safe to iterate on).

## 8. Unresolved questions

1. Does `agy agent` require a specific CWD/workspace-trust state to surface
   global agents, or is the empty result purely a file-shape/frontmatter
   mismatch? (Testable zero-spend: restructure one agent file per §6.5 and
   rerun `agy agent` from inside a `trustedWorkspaces` entry.)
2. If ariadnev's install ever writes into a project's `.agents/` tree, does a
   colocated `agy` session actually read it ahead of `~/.gemini/config/`
   (per documented precedence), and does that interact with the neutral
   `.agents/skills` convention already shared with codex/cursor/omp/generic?
3. Is `~/.gemini/config/agents/*.md` (16 files) ariadnev's own prior install
   output, or a third party's? Git-blame/install-log on this machine wasn't
   checked — needed before deciding whether to "fix the shape" of an existing
   ariadnev artifact or "avoid colliding with" a third party's.
4. Live vendor docs at `antigravity.google/docs/hooks` etc. were not fetched
   (bundled doc was sufficient and machine-build-accurate); a future pass
   should WebFetch them to catch any drift between docs bundled at 1.1.25 and
   the currently-published web docs.
5. Does a real (credit-spending) `agy -p` run's actual tool-call trace match
   §5's static-string-derived mapping? Required before flipping
   `toolNames.verified`.

Status: DONE
Summary: `agy` 1.1.25's zero-spend surface plus its own bundled first-party docs and binary strings substantially de-risk the antigravity row — hook schema and tool-name mapping are now well-evidenced (though still short of `observed`), and the empty `agy agent` result plus binary path literals (`.agents/agents/`, `agent.md`, non-kit frontmatter fields) point to a concrete, fixable file-shape mismatch rather than "no mechanism."
Concerns/Blockers: None blocking — all findings are read-only and the report flags every INFERRED vs OBSERVED claim; five unresolved questions are listed for the follow-up plan, the most actionable being the agent file-shape fix (§6.5) which is testable with more zero-spend `agy agent` reruns before any credit-spending probe is needed.
