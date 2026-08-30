# Scout: AgentKit 2.14.0 hooks vs ariadnev hooks — gap report

Date: 2026-08-30. Read-only; no tests run. Diffs normalized for `ak→av`, `.agentkit→.ariadnev`, `CK_/AK_→AV_`, `lib/→_lib/`, `ck-config-utils→av-config-utils`, `ak-prefs-client→av-config-client`. Only behavioral deltas reported.

Path aliases:
- `AK` = `/Users/vchun/Codes/My-projects/vcskill-kit/.claude/hooks` (installed ak 2.14.0, project scope)
- `AKC` = `/Users/vchun/.agentkit/cache/kits/engineer/<provider>/2.14.0/engineer` (ak per-provider kit cache — authoritative for cursor/codex/pi shapes)
- `AV` = `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit/kit/hooks`
- `CLI` = `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit/packages/cli/src`

## 1. Inventory

Bindings (claude-code) are identical on both sides for all 14 scripts — see §3. Column "Δ" = normalized diff after stripping require-path shim (`AV_LIB` probe) and renames.

| Script | Events (matcher) | Behavior | Libs used | Δ ak vs av |
|---|---|---|---|---|
| session-init | SessionStart(*) | project/pm/framework/branch detect, `AV_*` env, session-state snapshot, `.shadowed/` cleanup | config-utils, hook-logger, session-state-manager, statusline-session-cache, session-state-renderer, project-detector (+av: provider-paths) | **ak+ storage-gc (dead, §2E)**; av+ `held` shadowed skills, `claudeConfigDir` |
| subagent-init | SubagentStart(*) | compact brief for spawned subagent | config-utils, context-builder, hook-logger, session-state-renderer | rename-only |
| team-context-inject | SubagentStart(*) | team shared context into subagent | config-utils, session-state-renderer | rename-only |
| privacy-block | PreToolUse(Read\|Write\|Edit\|Bash) | block .env/keys/creds, APPROVED: path, exit 2 | hook-logger, privacy-checker, config-utils | hook rename-only; **lib privacy-checker differs (§2A)** |
| scout-block | PreToolUse(Bash\|Read) | block generated-tree reads; `.ckignore`/`.avignore` | scout-checker, config-utils, scout-block/{error-formatter,broad-pattern-detector}, hook-logger (+av provider-paths) | hook: av+ `claudeConfigDir`; **lib scout-checker + path-extractor differ (§2B,§2C)** |
| descriptive-name | PreToolUse(Write) | reject vague filenames | config-utils, hook-logger | rename-only |
| secret-output-guardrail | UserPromptSubmit | warn against echoing secrets | config-utils, hook-logger, secret-keywords | rename-only |
| simplify-gate | UserPromptSubmit | gate ship-shaped prompts on diff size | config-utils, config-client | rename-only (`/(?:ck:)?`→`/(?:av:)?`) |
| dev-rules-reminder | PostToolUse(Write\|Edit), UserPromptSubmit | surface dev rules | hook-logger, context-builder, config-utils | rename-only |
| plan-format-kanban | PostToolUse(Edit\|Write) | keep plan files kanban-shaped | hook-logger | rename-only |
| session-state | PostToolUse(Agent\|Task\|TodoWrite\|TodoRead), Stop, SubagentStop | persist per-project session snapshot | config-utils, session-state-manager | rename-only; **but av runtime marker never written → no-op (§2F)** |
| usage-quota-cache-refresh | PostToolUse(*), Stop, UserPromptSubmit | refresh statusline usage cache | hook-logger, usage-limits-cache | rename-only (UA string) |
| cook-after-plan-reminder | Stop | remind to run cook after accepted plan | config-utils, session-state-renderer | rename-only |
| precompact-capture | PreCompact(*) | capture state before compaction | config-utils | **ak+ cleanGitEnvironment, readBoundedStdin, pi runtime (§2D)** |

Shared libs (`AK/lib` 27 files vs `AV/_lib` 27 + 4 av-only + 2 relocated dirs):

| File | Δ |
|---|---|
| bounded-json-file, colors, config-counter, git-info-cache, immutable-revision-journal, private-json-store, secret-keywords, statusline-{activity-renderers,render-modes,session-cache,string-utils}, transcript-parser, scout-block/broad-pattern-detector | 0 |
| ck-config-utils→av-config-utils, pr-body-contract, project-handoff-store, session-state-manager, session-state-renderer, statusline-section-registry, usage-limits-cache, scout-block/{error-formatter,pattern-matcher} | rename/comment only |
| privacy-checker (554 vs 297 lines) | **ak+ shell-aware Bash extraction** §2A |
| scout-checker (376 vs 311) | **ak+ quote-aware / pipe / `&` split** §2B |
| scout-block/path-extractor | **ak+ sed/awk unquoted-subst skip** §2C |
| ak-prefs-client (208) vs av-config-client (171) | design divergence §2H (ak spawns `ak config prefs resolve --json`; av reads JSON + generated field table) |
| runtime-state-identity | ak `SUPPORTED_RUNTIMES` = claude-code, codex, **pi**; marker `.agentkit-runtime.json` vs `.ariadnev-runtime.json` §2F |
| project-detector | ak+ Pi extension-root output-style probe (L345) §2G |
| context-builder | ak+ response-language compliance line (L363-366) §2I |
| hook-logger | av+ `sanitizeDeep` redaction (better) |
| writing-language | **av dangling require** `./av-prefs-client.cjs` (L27; file absent) §2J — unused by any hook on either side |
| av-only: config-fields.generated, monthly-cost-cache, provider-paths, sanitizer | — |

Notifications (unbound to any event on both sides):

| | ak `AK/notifications/` | av `AV/_lib/notifications/` |
|---|---|---|
| Files | notify.cjs, lib/env-loader.cjs, lib/sender.cjs, providers/{discord,slack,telegram}.cjs, docs/slack-hook-setup.md, .env.example | notify.cjs, payload.cjs, senders.cjs, transport.cjs, README.md, __tests__/ |
| Transports | Discord webhook, Slack webhook, Telegram bot | same three |
| Credentials | env cascade `process.env > ~/.claude/.env > .claude/.env` (`TELEGRAM_BOT_TOKEN/CHAT_ID`, `DISCORD_WEBHOOK_URL`, `SLACK_WEBHOOK_URL`) | `~/.ariadnev/config.json` `notifications.*` (user layer only; https + host allowlist discord.com/slack.com/api.telegram.org) |
| Events | Stop, SubagentStop, AskUserPrompt, default | Stop, SubagentStop, Notification, SessionEnd |
| Payload | rich: project name, cwd, session id, agent type, timestamps, Discord embeds / Slack Block Kit | allowlisted: event title + subagent type only |
| Throttle | `$TMP/ck-noti-throttle.json`, 5 min | throttle file, 5 min, request timeout |

Runtime files:

| ak | av equivalent |
|---|---|
| `AK/hooks.json` — plugin manifest (`${CLAUDE_PLUGIN_ROOT}`, `command:"node", args:[...]`) rendered by ak CLI into settings.json / `.cursor/hooks.json` / `.codex/hooks.json` | per-hook `AV/<name>/hook.json` `{bindings:[{event,matcher,order}]}` → `CLI/kit/load-kit.ts` L130-168, `CLI/kit/hook-bindings.ts`, `CLI/install/hook-settings-merge.ts`. No plugin-mode (`CLAUDE_PLUGIN_ROOT`) delivery in av. |
| `AK/.agentkit-runtime.json` = `{"schemaVersion":1,"runtime":"claude-code"}` written by ak installer; read by `AK/lib/runtime-state-identity.cjs` L12, L82-95 | `.ariadnev-runtime.json` read by `AV/_lib/runtime-state-identity.cjs` L12, L82-95 — **no writer anywhere in `CLI/`**; `~/.claude/hooks/av/.ariadnev-runtime.json` absent on this machine |
| `.claude/.ckignore` (project baseline + git-root override); `~/.claude/.ckignore` = `!node_modules/cmdk` | `.avignore` same two locations; neither kit ships a baseline file → both use identical `DEFAULT_PATTERNS` |

## 2. Per-script behavioral diff (ak has, av lacks)

### 2A. `AK/lib/privacy-checker.cjs` — shell-aware Bash path extraction
| ak | line | av state |
|---|---|---|
| import `splitCompoundCommand` from scout-checker | L13 | absent |
| `DENO_EVAL_OPTIONS_WITH_VALUES` | L20-31 | absent |
| `lexShellWords` quote-aware tokenizer, `<>()` delimiters | L140-183 | absent |
| `findEnvSplitString` (`env -S/--split-string`) | L185-218 | absent |
| `findEvaluatorSource` (node/bun `-e/-p/--eval/--print`, `deno eval`) | L220-272 | absent |
| `isRuntimeEnvironmentReference` (skip `process.env.X`, `Deno.env`, `Bun.env`, `import.meta.env`) | L274-276 | absent |
| `extractEvaluatorTokens` (backticks opaque) | L283-291 | absent |
| `extractCommandSubstitutions` balanced `$(...)` w/ quotes | L293-338 | absent |
| `splitPrivacyCommandSegments` (unquoted `\n`→`;`, recurse subst + env -S) | L340-375 | absent |
| `extractPaths` per-word: `VAR=value` unwrap, only dotenv candidates or `APPROVED:` | L377-415 | av `AV/_lib/privacy-checker.cjs` ~L130-160: regexes `/\.env[^\s]*/g`, `/\w+=[^\s]*\.env[^\s]*/g`, `/\$\([^)]*?(\.env[^\s)]*)[^)]*\)/g` |

Effect: av false-blocks `node -e "console.log(process.env.API_KEY)"` (regex yields `.env.API_KEY)"`), and misses quoted/escaped/`env -S`/nested-subst paths. av has **no test** for the Bash path (`hook-behavior.test.cjs` L65 covers Read only; no `_lib/__tests__/privacy-checker*`).

### 2B. `AK/lib/scout-checker.cjs` `splitCompoundCommand` L96-146
ak: quote-aware; splits on `&&`, `||`, `;`, lone `|`, lone `&` (not `2>&1`/`&>`); unterminated quote → fail-closed quote-blind split. av (~L80): `split(/\s*(?:&&|\|\||;)\s*/)` — no `|`/`&`. Effect: `npm run build | cat node_modules/x.js` passes av's scout-block because unanchored `BUILD_COMMAND_PATTERN` matches the head (ak comment L253-270). No av test covers it.

### 2C. `AK/scout-block/path-extractor.cjs` L200-213
Skips unquoted `s/pat/repl/`-shaped tokens after `PATTERN_ARG_COMMANDS` (L32). av lacks → `sed s/dist/build/ f` can false-block on `dist`.

### 2D. `AK/precompact-capture.cjs`
| ak | line | av |
|---|---|---|
| `cleanGitEnvironment()` strips `GIT_*`/`GIT_CONFIG_COUNT` before `git` spawn | L33-40, used L42-50 | inherits env |
| `readBoundedStdin(256KB)` → exit 0 on overflow | L56-69 | `fs.readFileSync(0)` unbounded |
| `pi` runtime branch (`data.runtime==='pi'` → cwd from payload, `bindSession`) | L73-80 | absent (no pi provider) |

### 2E. `AK/session-init.cjs` storage-gc — **dead in ak 2.14.0, do not port**
L168-330 (`formatCalendarDateToken`, `sweepPriorDayStorageGcLockfiles`, `claimDailyStorageGcLock`, `resolveStorageGcModule`, `runStorageGc`; call L346; `AGENTKIT_STORAGE_GC_DRY_RUN` L276). Resolves `../scripts/lib/storage-gc.cjs` or `../.agentkit/scripts/lib/storage-gc.cjs` — **neither exists** in the install (`.claude/scripts` absent) nor in `AKC/claude-code` (cache `scripts/` = set-active-plan, worktree, validate-skill-crossrefs.py, resolve_env.py; `.agentkit/scripts/` has no lib/). Only side effect: daily lockfile churn at `~/.agentkit/state/storage-gc-20260830.lock`. av-only in same file: `held` shadowed-skill guard (av L~95-130, L~364-367), `claudeConfigDir` (av L251).

### 2F. Runtime marker — av session-state family silently no-ops
- ak writes `AK/.agentkit-runtime.json`; `AK/lib/runtime-state-identity.cjs` L12 `RUNTIME_MARKER_FILE`, L82 `defaultRuntimeMarkerPath` (= `<hooks>/..`), L86 `readRuntimeMarker`, L111 `runtime = options.runtime || readRuntimeMarker()`, L124 `!SUPPORTED_RUNTIMES.has(runtime) → return null`.
- av identical logic (`AV/_lib/runtime-state-identity.cjs` L111, L124) but `rg 'ariadnev-runtime|runtime\.json' CLI/` (non-generated) = 0 hits; no av hook passes `runtime:`; marker absent at `~/.claude/hooks/av/`.
- `createSessionStateContext` (`AV/_lib/av-config-utils.cjs` L127-131) returns null → `session-state`, `precompact-capture` (`requireBinding`), `cook-after-plan-reminder`, `team-context-inject`, and session-init's snapshot branch all exit without writing.
- Evidence: `~/.agentkit/session-states/v2/claude-code/` = 1084 files; no `~/.ariadnev/session-states` exists. Hook logs don't cover these hooks (no timer), so nothing reports it.

### 2G. `AK/lib/project-detector.cjs` L343-345, L361
Third output-style probe `<configDir>/<style>.md` (Pi extension root). av keeps first two. Pi-only.

### 2H. `AK/lib/ak-prefs-client.cjs` vs `AV/_lib/av-config-client.cjs` — divergence, not gap
ak: spawn `ak config prefs resolve --json` (`AK_OPERATIONS` L~50, 2 s timeout, `AGENTKIT_BIN` override, `AGENTKIT_HOOK_DEBUG` once-per-process stderr via `debugOnce` L~130-150, schema_version check). av: direct JSON read + `config-fields.generated.cjs` layer rule + webhook host validation (documented in `AV/README.md`). Only ak-only sub-feature worth noting: `HOOK_DEBUG` diagnostic (av: 0 hits).

### 2I. `AK/lib/context-builder.cjs` L363-366
`buildLanguageSection` emits "response language is configured … every agent and subagent MUST comply … resolve with `ak config prefs resolve --json`". av dropped the line (keeps `- Response: Respond in X`).

### 2J. `AV/_lib/writing-language.cjs` L27 (av defect, surfaced by diff)
`require('./av-prefs-client.cjs')` — file does not exist (`_lib` has `av-config-client.cjs`). Not required by any hook in either kit (dead module), but embedded in `CLI/kit/kit-embedded.generated.ts` L81 and installed.

### 2K. Notifications (`AK/notifications/` vs `AV/_lib/notifications/`)
ak-only: `lib/env-loader.cjs` (dotenv cascade L80-105), per-provider rich formatters (`providers/discord.cjs` L57-130 embeds; `slack.cjs` L36 Block Kit; `telegram.cjs` L27), `AskUserPrompt` title, `docs/slack-hook-setup.md`, `.env.example`, provider auto-enable by env-prefix presence (`notify.cjs` L64-71, L89-156). av deliberately sends event + subagent type only and refuses project-file destinations (README). Not a functional gap; a docs gap.

### 2L. Binding quirk (ak, not a gap)
`AK/hooks.json` and `.claude/settings.json` declare `UserPromptSubmit` as **two** `*` groups → `secret-output-guardrail` and `simplify-gate` run twice per prompt (also in `AKC/cursor/.cursor/hooks.json` `beforeSubmitPrompt`). av runs each once. Keep av.

## 3. Bindings diff

claude-code: every (event, matcher, script) pair identical (verified `AK/hooks.json`, `.claude/settings.json`, `~/.claude/settings.json` av entries, `AV/*/hook.json`). Only delta = §2L duplicate group.

Other providers (ak source: `AKC/<provider>/…`; av source: `CLI/providers/spec-verified.ts`, `CLI/adapt/paths.ts` L37 `CLAUDE_HOOKS_DIR=".claude/hooks/av"`, `CLI/install/install-plan.ts` `planHooks` skips unverified):

| Provider | ak delivers | ak event/matcher shape | av |
|---|---|---|---|
| claude-code | 14 hooks, settings.json | PascalCase, Claude matchers | same |
| cursor | `AKC/cursor/.cursor/hooks.json` + `.cursor/hooks/*.cjs` | camelCase `beforeSubmitPrompt, postToolUse, preCompact, preToolUse, sessionStart, stop, subagentStart, subagentStop`; tools `Bash→Shell`, `Edit` dropped (Write only), `Agent\|Task\|TodoWrite\|TodoRead→Task`; commands relative `node ".cursor/hooks/x.cjs"` | none (`spec-verified.ts` L107 "no hook mechanism observed"); `adapt/tool-rewrites.ts` has no Bash→Shell |
| codex | `AKC/codex/.codex/hooks.json` + `.codex/config.toml` `hooks = true` | PascalCase; `PreCompact: manual\|auto`; `SessionStart: startup\|resume\|clear\|compact`; scout-block `Bash` only; privacy-block `Write\|Edit\|Bash` (Read dropped on both); commands `node 'engineer/.codex/hooks/x.cjs'` | none (L126); yet `runtime-state-identity` keeps `codex` in `SUPPORTED_RUNTIMES` |
| pi | `AKC/pi/.pi/extensions/agentkit-agent/index.ts` (extension, not hooks.json); hooks receive `runtime:'pi'` payload | — | no pi provider |
| omp, grok | Claude-shaped `hooks/hooks.json` only | — | none (L192, L220) |

Live state: `~/.cursor/hooks.json` still holds historical ak entries pointing at `.cursor/hooks/*.cjs` (relative; `~/.cursor/hooks/` is empty → dangling). `~/.codex/hooks.json` has no ak/av entries (orca/herdr only; `"PreCompact": null` leftover). Both historical per task brief.

## 4. Ranked gaps

| # | Pri | Gap | ak source → av target | Port | Effort |
|---|---|---|---|---|---|
| 1 | P1 | Runtime marker never written; session-state/precompact/cook-reminder/team-context dead (§2F) | `AK/.agentkit-runtime.json` (writer = ak installer) → `CLI/install/install-plan.ts` `planHooks` (write op `<base>/.claude/hooks/av/.ariadnev-runtime.json` = `{"schemaVersion":1,"runtime":"claude-code"}`), `CLI/uninstall/uninstall-plan.ts`, `CLI/doctor/diagnose.ts` (verify), `CLI/install/install-receipt.ts`; test in `AV/__tests__/hook-behavior.test.cjs` asserting session-state writes | write marker at install; add doctor check | S |
| 2 | P1 | privacy-checker Bash extraction (§2A) | `AK/lib/privacy-checker.cjs` L13, L20-31, L140-415 → `AV/_lib/privacy-checker.cjs` (replace command branch ~L130-160; export helpers) + new `AV/_lib/__tests__/privacy-checker.test.cjs` | all 9 functions + new `extractPaths` command branch; depends on #3 | M |
| 3 | P1 | scout-checker quote-aware `\|`/`&` split (§2B) — bypass of scout-block | `AK/lib/scout-checker.cjs` L73-146 → `AV/_lib/scout-checker.cjs` ~L73-80; drop `.trim()` at av ~L210; update comment ~L207 | function body + tests | S |
| 4 | P2 | path-extractor sed/awk skip (§2C) | `AK/scout-block/path-extractor.cjs` L200-213 → `AV/_lib/scout-block/path-extractor.cjs` same fn | 14-line guard | S |
| 5 | P2 | precompact-capture hardening (§2D, minus pi) | `AK/precompact-capture.cjs` L33-40, L42-50, L56-69 → `AV/precompact-capture/hook.cjs` | `cleanGitEnvironment`, `readBoundedStdin` | S |
| 6 | P2 | av defect: dangling `av-prefs-client` require (§2J) | — → `AV/_lib/writing-language.cjs` L27 → `./av-config-client.cjs`; regenerate `kit-embedded.generated.ts` | one-line fix, or delete module if truly unused | S |
| 7 | P2 | cursor + codex hook delivery (§3) | `AKC/cursor/.cursor/hooks.json`, `AKC/codex/.codex/hooks.json`, `AKC/codex/.codex/config.toml` → `CLI/providers/spec-verified.ts` (cursor/codex `hook` cells need *observed* evidence first), `CLI/adapt/paths.ts` (per-provider hooks dir), `CLI/install/install-plan.ts planHooks` (target file `.cursor/hooks.json` / `.codex/hooks.json`, not settings.json), new event-name + tool-matcher map (camelCase; `Bash→Shell`; drop `Edit`; task tools→`Task`; codex `PreCompact manual\|auto`, `SessionStart startup\|resume\|clear\|compact`) | adapter + writer + marker `runtime:"codex"` | L |
| 8 | P3 | context-builder response-language compliance line (§2I) | `AK/lib/context-builder.cjs` L363-366 → `AV/_lib/context-builder.cjs` `buildLanguageSection` (reword to `av config prefs resolve --json`) | 3 lines | S |
| 9 | P3 | notifications docs + AskUserPrompt title (§2K) | `AK/notifications/docs/slack-hook-setup.md`, `.env.example` → `AV/_lib/notifications/README.md` (setup steps for Slack/Discord/Telegram); optional `Notification`≈`AskUserPrompt` alias in `payload.cjs` `EVENT_TITLES` | docs only; keep allowlisted payload + config-only creds | S |
| 10 | P3 | `HOOK_DEBUG` diagnostic (§2H) | `AK/lib/ak-prefs-client.cjs` `debugOnce` → `AV/_lib/av-config-client.cjs` `readJson` catch (env `ARIADNEV_HOOK_DEBUG`) | once-per-process stderr | S |
| 11 | P3 | `.ckignore` read-fallback for migrating users | — → `AV/_lib/scout-checker.cjs` `findProjectCkignore` L~156 + `AV/scout-block/hook.cjs` L109: try `.avignore`, else `.ckignore` | optional | S |
| — | no-port | storage-gc (§2E): module absent in ak itself | — | if wanted, design fresh under `~/.ariadnev/operational` | — |
| — | no-port | Pi runtime (§2D pi branch, `SUPPORTED_RUNTIMES` 'pi', §2G) | — | only if a pi provider lands | — |
| — | no-port | ak duplicate `UserPromptSubmit` group (§2L); plugin-mode `hooks.json` (`CLAUDE_PLUGIN_ROOT`) | — | av is correct; plugin delivery only if marketplace distribution becomes a goal | — |

## 5. Unresolved questions

1. Was the missing `.ariadnev-runtime.json` writer an oversight or does av intend `createSessionStateContext` to default `runtime` to `claude-code`? (Not a git repo here — no history to check.) Either fix resolves #1; marker is the cleaner contract if codex lands.
2. Does av intend cursor/codex hook support? `runtime-state-identity` keeps `codex`; `spec-verified.ts` says none. #7 needs a live "hooks fire" observation per provider before `spec-verified` can flip.
3. Is `writing-language.cjs` meant to be loaded by av:ship / av:review-pr skills (via `node -e`)? If yes, #6 is user-visible; if no, delete it.
4. ak storage-gc: is `scripts/lib/storage-gc.cjs` shipped in a later ak release, or only in ak's monorepo (`kits/core/scripts/lib`)? Affects whether "no-port" should become "watch".
5. `~/.cursor/hooks.json` dangling ak entries and `~/.codex/hooks.json` `"PreCompact": null` — out of scope for av, but worth a cleanup note to the user.

```
Status: DONE_WITH_CONCERNS
Summary: Bindings are at parity on claude-code; the real gaps are three security/robustness libs (privacy-checker shell parsing, scout-checker pipe splitting, path-extractor sed skip) plus one av installer defect — the runtime marker is never written, so av's whole session-state family silently no-ops (ak has 1084 state files, av has none).
Concerns/Blockers: #1 is an av bug, not an ak port, and nothing in av's logs or tests would have caught it; av has zero tests on the Bash path of privacy-block or on compound-command splitting, so #2/#3 must land with tests. Cursor/codex hooks (#7) need live evidence before spec-verified can change.
```
