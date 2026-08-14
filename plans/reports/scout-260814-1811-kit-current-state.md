# Scout Report — vcskill kit current state

Date: 2026-08-14 · Branch: `main` @ `335399f` (== `origin/main`)

## Health

| Gate | Result |
|---|---|
| `npx vitest run` | 741 pass / 107 files (green on rerun) |
| `node --test` (hooks + release scripts) | 48 pass |
| `pnpm lint` (tsc --noEmit) | clean |
| Built binary `--version` | 0.12.0 |
| Upstream-brand grep (kit/, docs/, src/) | clean except 2 items below |

**Flaky test (confirmed):** `packages/cli/src/eval/behavioral-runner.test.ts` →
"fails closed when a host-external mutation has no trusted runtime event" —
`observer.pathViolations` was 1, expected 0. Fails under full-suite parallel load,
passes in isolation and on rerun. Non-deterministic state leak between behavioral runs.

## Kit payload (`kit/`, 130 tracked files)

- **26 skills**, all `vc:` prefixed, valid frontmatter, no stubs. 18 have `references/`; 0 have `scripts/`.
- **13 agents** (`vc-explore`, `vc-planner`, `vc-developer`, `vc-reviewer`, `vc-tester`, …).
- **3 rules**, **3 workflow graphs** (bugfix / read-only / safe-change delivery), **6 hooks** + `_lib`.
- `decisions.json` — schema v1, 26 skills pinned, claims audit-trailed (covered/rejected).
- `collision-allowlist.json` — empty (0 entries).

## CLI (`packages/cli`, vcskill 0.12.0)

- Single package, tsup build + `bun build --compile` release binary with embedded kit.
- ~17k LOC production across 156 files; 107 test files.
- Subsystems: harness 7.4k, eval 5.1k, cli 4.6k, kit 2.5k, release 2.2k, install 1.5k,
  graph 1.2k, adapt 748, providers 633.
- **16 commands**: install, uninstall, list, query, telemetry, doctor, backups, update,
  validate, coverage, contract, eval, run, resume, status, cancel (+ add-skill).
- Provider matrix: `claude-code` fully verified (incl. hooks + tool-names); `codex` verified
  minus hooks; `cursor` / `antigravity` / `opencode` / `generic` have unverified tool-names
  and gaps → installer skips + logs those cells.

## Open issues

1. **Stale plan statuses.** Both `plans/260814-1615-kit-rebrand-strip-upstream` (8 phases) and
   `plans/260814-1717-main-history-rewrite` still read `status: pending`, but the outcome is
   already on disk and in history: `main` is 91 commits (90 pre-rebrand + 1 squashed
   `feat(kit): initial vcskill kit`), 0 upstream terms in any commit subject, and local ==
   remote. This matches the rewrite plan's Option C. Plans need syncing to `completed`,
   or the residual phases named explicitly.
2. **`kit/skills/git/SKILL.md`** still carries `ck:git` in its description and
   `forked-from: "ck:git@1.0.0"` metadata — the only user-visible upstream reference left.
3. **`AGENTKIT_LANGUAGE`** appears once in `kit/decisions.json` (inside a *rejected* claim's
   rationale) and is mirrored into `packages/cli/src/kit/kit-embedded.generated.ts`.
4. **17 production files >200 LOC** vs the project's <200 rule: `codex-executor.ts` (566),
   `run-graph.ts` (561), `claude-code-executor.ts` (561), `context-query.ts` (535),
   `run-command.ts` (468), `run-side-effect.ts` (306).
5. **2 changesets unreleased**: CLI terminal-UI capability program (minor), deterministic
   docs bundle (patch).
6. `plans/` and `vchun/` are untracked; `worktrees/` is empty.

## Unresolved questions

- Are the two 2026-08-14 plans genuinely finished, or were only the history phases executed
  while the ledger/docs phases remain?
- Is `ck:git` attribution in the git skill intentional (credit) or a rebrand miss?
