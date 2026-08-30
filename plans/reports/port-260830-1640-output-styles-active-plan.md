# Port: output-styles + active-plan pointer

Date: 2026-08-30. Gaps from `plans/reports/scout-260830-1604-agents-styles-statusline-ak-vs-av.md` §2 + P1 rows. Branch: `worktree-agent-a1f593ba0043d3ac8`. Upstream named by role only; brand scan of every touched file is clean (the one `ak-kit` hit is the pre-existing plans-kanban allowlist entry, untouched).

## Gap A — coding-level output styles

| File | Change |
|---|---|
| `kit/output-styles/coding-level-{0-eli5,1-junior,2-mid,3-senior,4-lead,5-god}.md` (new, 6) | Copied verbatim from upstream's output-styles dir; grep for brand strings (`agentkit|claudekit|\bak[-: ]|CK_`, case-insensitive) clean before and after copy; modes normalized to 644. `load-kit.ts:195` already loads the directory. |
| `packages/cli/src/config/config-schema.ts` | `codingLevel: projectField.int(-1, …)` top-level, project layer (matches the hook reader, which consumes top-level `merged.codingLevel`). -1 = disabled (default), 0-5 = inject. |
| `kit/hooks/_lib/config-fields.generated.cjs`, `schemas/av-config.schema.json` | Regenerated with the generator (`bun packages/cli/scripts/generate-config-schema.ts` — the checked-in `generate:config-schema` script), NOT hand-edited. Diff = the one new field in each. |
| `packages/cli/src/adapt/paths.ts` | New constant `CLAUDE_OUTPUT_STYLES_SIDECAR_DIR = ".claude/.ariadnev/output-styles"` (path constants live only here, per repo rule). |
| `packages/cli/src/install/install-plan.ts` `planHooks` | One receipted `action:"write", kind:"hook"` op per style into `<base>/.claude/.ariadnev/output-styles/<style>.md`, after the `_lib` tree — same pattern as the previous hooks agent's runtime-marker write (receipt/sha256/backup/uninstall all inherited; only reached when `isVerified(r.id,"hook")`). Content is `style.raw` verbatim — the hook strips frontmatter itself. |
| `packages/cli/src/install/install-plan.ts` `planOutputStyles` | `spec-verified.ts` untouched, so the native cell still skips; the skip reason for hook-verified providers now says "installed as session-init hook sidecar instead" so the install summary does not read as a loss. |
| `kit/hooks/__tests__/hook-behavior.test.cjs` | `runHook` gained an optional `hooksDir` arg + `sandboxHooks()` copy helper (same shape the hooks-marker branch used — this kit checkout sits under a real `.claude/`, so an uncopied hook resolves its config dir to the machine's real state). 3 new cases: level 3 + sidecar file ⇒ style body on stdout with frontmatter stripped; no `codingLevel` ⇒ nothing injected; pointer e2e (Gap B). |
| `packages/cli/src/install/install.test.ts` | claude-code full-kit case now asserts all 6 styles land in `.claude/.ariadnev/output-styles/` and NOT in `.claude/output-styles/`. No existing roster/count assertion broke (codex hook-skip count filters `kind === "hook"` hooks only; sidecar ops are behind the hook gate). |
| `kit/skills/coding-level/SKILL.md` | §How It Works now describes the real behaviour (config key → hook injection at next SessionStart; -1 ⇒ nothing; user-authored `output-styles/` wins the probe); output-format persist line and quality gate rewritten to match; Related line updated. Every `av …` invocation in the file is `av config prefs resolve` — verified against `av config --help` / `av config prefs --help` (`av config` has only `prefs resolve`; there is no `av config set`, so persistence is a config-file edit). |
| `kit/av-invocation-allowlist.json` + `packages/cli/src/cli/validate-invocations.ts` + `validate-command.test.ts` | The coding-level allowlist entry quarantined an `av kit init --force` citation that is no longer in the file; entry deleted and the shrink-only ceiling lowered 2 → 1 as the constant's own comment instructs (test comment updated; the ratchet asserts `<=`, so it stays green). |
| `kit/hooks/README.md` | 7 lines on the sidecar contract (who writes it, both probe paths, which wins, -1 semantics). |

### Probe order proven

`_lib/project-detector.cjs` `getCodingLevelGuidelines(level, configDir)` candidates, in order:

| # | Path | Who owns it |
|---|---|---|
| 1 | `<configDir>/output-styles/<style>.md` | user-authored native styles (win) |
| 2 | `<configDir>/.ariadnev/output-styles/<style>.md` | installer sidecar (this port writes here) |

`configDir` = `staticEnv.claudeSettingsDir` = `claudeConfigDir(__dirname, cwd)` (`_lib/provider-paths.cjs:25`): walk up from the hook (`.claude/hooks/av`) to the nearest `.claude`, else `<cwd>/.claude`. Installer writes `<base>/.claude/.ariadnev/output-styles/`; hooks install at `<base>/.claude/hooks/av/` ⇒ the two agree; no hook-side fix was needed. The hook-behavior test proves the full round trip with the shipped level-3 file.

## Gap B — active-plan pointer

| File | Change |
|---|---|
| `kit/hooks/_lib/av-config-utils.cjs` | New `pointer` source in `resolvePlanPath`, ordered `['pointer','session','branch']` (both in the function's fallback AND in `DEFAULT_CONFIG.plan.resolution.order`, which is what `loadConfig` actually merges in). Reads `<root>/.ariadnev/current-plan.json` — root = `sessionContext.sessionLaunchRoot || canonicalProjectRoot || process.cwd()` (the cwd fallback keeps the CLI-owned directive alive where session binding is not — binding requires the runtime marker whose writer is on the hooks branch). Guards: stat + 64KB cap before parse, JSON.parse in try, `schemaVersion === 1`, `byBranch` object, branch key via allowlisted `execSafe('git branch --show-current')` with the CLI's `'(no branch)'` fallback, plan name must equal `path.basename(name)` (no traversal), plan dir must exist; every failure falls through. Honors `paths.plans` override incl. absolute. Doc comment no longer names the never-shipped upstream setter script. `POINTER_FILE_MAX_BYTES` constant added. |
| Directive consumers | `pointer` counts as ACTIVE (directive), not SUGGESTED, at every `resolvedBy === 'session'` site: `getReportsPath` (plan-local reports dir), `extractTaskListId` (task-list id), `session-init/hook.cjs` (`AV_ACTIVE_PLAN`, session-state `activePlan` carry-forward), `subagent-init/hook.cjs` (Plan Context activePlan), `_lib/context-builder.cjs` (`- Plan:` line), `_lib/project-detector.cjs` (`Plan:` vs `Suggested:` in the SessionStart banner). |
| `kit/hooks/_lib/__tests__/plan-resolution.test.cjs` (new) | 9 cases: pointer resolves as directive; `paths.plans` override; malformed JSON falls through; missing file; pointer outliving its plan dir; wrong schemaVersion; `../` traversal refused; null session context resolves from cwd; pointer counts as directive for `getReportsPath` + `extractTaskListId`. |
| `kit/hooks/__tests__/hook-behavior.test.cjs` | e2e: sandboxed session-init with a CLI-shaped pointer file prints `Plan: …260830-1200-demo` (directive), not `Suggested:`. |
| `kit/agents/planner.md` | One line added before the "DO NOT implement" line: run `av plan use <plan-dir-name>` after writing the plan files. Verified against `av plan use --help`. File is exactly 120 lines (cap). |

Ordering rationale (why pointer first): nothing in this kit writes `state.activePlan` initially — session-init only carries an existing value forward — so `session` never outranks a deliberate `av plan use`; pointer-first also means re-pointing takes effect at the next event without stale session state shadowing it.

Pointer file shape mirrored from `packages/cli/src/plan/plan-pointer.ts` / `plan-command.ts:74-76`: `{ schemaVersion: 1, byBranch: { "<branch or (no branch)>": "<plan dir name>" } }` at `<cwd>/.ariadnev/current-plan.json`.

## Verification

| Check | Result |
|---|---|
| `node --test kit/hooks/_lib/__tests__/plan-resolution.test.cjs kit/hooks/_lib/__tests__/av-config-client.test.cjs kit/hooks/_lib/__tests__/sanitizer.test.cjs kit/hooks/__tests__/hook-behavior.test.cjs` | **35 pass, 0 fail** (9 new plan-resolution, 14 hook-behavior incl. 3 new, 9 av-config-client, 3 sanitizer) |
| `av validate --strict` (binary, from worktree root) | exit 0, "105 skills, 16 agents, 14 hooks, all checks passed, 131 warnings" — **but proven to validate the embedded 1.3.0 kit, not this worktree**: a deliberately broken probe hook (`hook.cjs` with no `hook.json`) in the worktree kit did not change the result. The compiled binary's `getKitRoot` cannot see a checkout from cwd. The worktree-kit lint therefore rides on vitest (`validate-command.test.ts` "keeps the real kit clean under --strict" lints the real kit with the live command surface). |
| Brand scan (all 24 touched/added files) | clean (one pre-existing plans-kanban allowlist reason mentions upstream; untouched) |
| `tsc` | not run — no node_modules in the worktree and installs are forbidden; TS changes checked by inspection (`kit.outputStyles: Artifact[]`, `style.raw: string`, `kind: "hook"` is a valid `ArtifactKind`, new paths constant exported/imported) |

## vitest specs the coordinator must run

| Spec | Why |
|---|---|
| `packages/cli/src/install/install.test.ts` | sidecar assertions added; exercises the new planHooks ops end-to-end |
| `packages/cli/src/cli/validate-command.test.ts` | allowlist ratchet (ceiling 2→1, entry removed); "keeps the real kit clean under --strict" is the lint proof for the rewritten SKILL.md, planner.md, and the 6 new style files |
| `packages/cli/src/config/config-schema.test.ts`, `json-schema.test.ts` | schema gained `codingLevel`; json-schema drift test compares the regenerated checked-in file |
| `packages/cli/src/config/resolve-config.test.ts`, `load-config.test.ts`, `filter-project-layer.test.ts`, `packages/cli/src/cli/setup-command.test.ts` | consume `CONFIG_FIELDS`/defaults — expected green, run because the enumeration changed |
| `packages/cli/src/install/e2e-install.test.ts`, `install-receipt.test.ts` (if present), `packages/cli/src/uninstall/*.test.ts` | the claude-code op plan grew by 6 receipted writes + 6 outputStyle skips |

## Unresolved questions

1. **Merge overlap with the hooks-marker branch** (`worktree-agent-ae50043c1f5b089b2`): both branches edit `install-plan.ts` `planHooks` (adjacent inserts after the `_lib` tree) and both extend `hook-behavior.test.cjs` `runHook` with the same optional `hooksDir` argument (mine also adds `sandboxHooks`). Semantically compatible; textual conflict likely — merge both hunks, keep one `runHook` signature.
2. Detached HEAD: the hook maps an empty `git branch --show-current` to `'(no branch)'`. If the CLI's `deps.branch()` returns `''` rather than null on detached HEAD, `av plan use` would file the pointer under `''` and the hook would miss it. Not verified here (CLI realDeps not traced); worst case the pointer is simply not resolved on detached HEAD.
3. `kit-embedded.generated.ts` untouched per brief — `build:binary` regenerates it, but any in-tree comparison is stale until `generate:embedded` runs (includes the 6 new style files).
4. `av install` on claude-code now lists 6 outputStyle skips with the "installed as session-init hook sidecar instead" reason next to 6 hook-kind writes. Accurate, slightly noisy; collapsing them needs an installer-summary decision out of scope here.
5. The statusline 📋 plan segment reads session state (`state.activePlan`), which the pointer only feeds after session-init has run once with a bound session (i.e., with the runtime marker installed). Until the marker branch merges, the pointer still drives SessionStart output, subagent Plan Context, reports paths, and `AV_ACTIVE_PLAN`, but not the statusline segment.
6. The commit carries no session trailer per the user's no-AI-reference commit rule.
