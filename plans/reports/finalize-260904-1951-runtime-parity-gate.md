# Runtime parity and gap closure — finalize gate

Branch `feat/runtime-parity-and-gap-closure`, 33 commits off `dev`. Both gates
delegated, both returned, review findings verified in source before action.

## Test gate

All five commands green.

| Gate | Result |
|---|---|
| `pnpm lint` | clean, exit 0 |
| `pnpm test` | vitest 2499/2499 · node:test 124 hooks/statusline + 139 scripts (1 skip) + 117 worktree |
| `pnpm coverage` | `adapt/` 99.42% stmt / 94.73% branch / 100% func — criterion is ≥90% |
| `check-brand-drift.mjs` | clean |
| `av validate` | 109 skills, 16 agents, 14 hooks, all checks passed |

The one skip is `installer-checksum-pin.test.mjs:162`, gated on `pwsh` being
installed; absent on this host, pre-existing. The known
`behavioral-runner.test.ts` cancellation-vs-timeout race did not fire.

## Review gate — 6/10, four findings acted on

Each was re-read in source before it was accepted. All four are defects in code
this branch introduced, in the writers that share a file with other tools —
which is where being wrong costs somebody else's config.

| Finding | Verified | Action |
|---|---|---|
| Ownership was a naked substring test, so a foreign command merely *naming* our hooks directory read as ours — uninstall would delete it, reinstall rebuild over it, and the statusline slot take over one the user chose | `owned-command.ts:20` | Compares the file the command runs, plus a separator so `…/av-legacy` is not read as a file inside `…/av` |
| A non-object JSON root took the registration as a named property and lost it at stringify time, reporting hooks installed into a file carrying none; a string root threw a raw TypeError | both new mergers' `parseFile` | Refused before the caller writes — the answer these already gave to unparseable bytes |
| A non-array event value reached `.filter` and aborted the install with a stack trace | `codex-hooks-merge.ts:91,118` | Named in the error instead |
| Declining the merge printed one paste block for what are now three registries, leaving the rest on disk unregistered and unmentioned | `install-command.ts:216` | One block per destination, deduplicated by file |

### What the ownership fix flushed out

Tightening ownership turned two `statusLine` tests red. Their `ownedDir` was the
fragment `/.claude/hooks/av/` — a trailing-slash suffix no caller produces:
`install-plan.ts:220` and `uninstall-plan.ts:259` both pass the resolved,
absolute, unterminated hooks directory, and the Windows block right beneath them
already did the same. The fragment only ever passed because the old check was a
substring test, so the test was encoding the defect rather than the contract.
The constant now matches what production passes; the assertions are unchanged.


## Findings examined and not acted on

- **Missing runtime marker resolves a non-Claude hooks tree to `<cwd>/.claude`.**
  Real, but the walk is the documented fallback for an unmarked tree, which is
  what the kit checkout and its tests are. Failing closed there would break the
  case the fallback exists for. The installer always writes the marker; this is
  a hand-damaged install.
- **Codex output schemas fetched for four events, assumed for the rest.** Two
  live emitters ride on unfetched schemas. Nothing to fix without fetching them,
  so the emitter header now says how far the evidence goes and which two schemas
  to fetch before widening it.
- **Claimed `additionalContext` reshaping in `dev-rules-reminder`.** Does not
  hold. The diff replaces `console.log(content)` with
  `emitPlainContext('UserPromptSubmit', …)`, whose claude-code branch returns
  the same `${body}\n`. Output byte-identical.
- **Three files crossed 200 LOC.** Noted; splitting them is not this branch's
  scope.

## Open

- Issue #134's criterion stays unticked until the PR that closes it exists.
- Antigravity `hooksInstall` stays `true`: the hooks register but cannot fire
  usefully, since agy's stdin is camelCase protojson carrying `conversationId`
  and not `session_id`, and its matchers use its own tool vocabulary. Kept as
  phase 2 decided.
