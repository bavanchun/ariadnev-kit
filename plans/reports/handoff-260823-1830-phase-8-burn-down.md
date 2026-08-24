# Handoff — phase 8 skill content burn-down (Tier B batch 1 → tail)

**From:** coordinator session (Opus 4.7). **To:** delegated general-purpose agent (any model).
**Date:** 2026-08-23. **Timezone:** Asia/Saigon.
**Repo:** `/Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit`.
**Current `dev` head:** `74cb36e`. **Plan:** `plans/260822-1407-ariadnev-kit-correctness-and-operational-hardening/plan.md`, phase 8 = `phase-08-skill-content-burn-down.md`.

Read this file end-to-end before touching anything. Every rule here is load-bearing; several were paid for in a Mac reboot, a session timeout, or a required-check trap that blocked a PR forever.

---

## 1. What is in this handoff

You own the phase 8 content burn-down from Tier B batch 1 to its tail, **plus one loose end (Task 0) — close out PR #51**. In dependency order:

0. **PR #51 close-out** — CI red on the last push; the coordinator decided to stop chasing it and hand the diagnosis to you. See §8-A below for the current state and the exact scope: diagnose, decide (fix vs. defer), execute, report.
1. **Tier B batch 1 second-read → fix → fix-diff re-read → fix → PR.** Author commit already exists in a worktree.
2. **Tier A batch 2 second-read → fix → fix-diff re-read → fix → PR.** Author commit already exists in a worktree.
3. **Tier B batch 2 author → second-read → fix → fix-diff re-read → fix → PR.** Four skills, worktree does not exist yet.
4. **Tier A batches 3-7 (~59 skills)** in batches of 4-8, same protocol per batch. Includes the `plans-kanban` content decision (see §11).
5. **Reference-file splits** for the six files >800 lines (list in phase-08).

Execute strictly one task at a time. After each PR is opened (with the local gate green and CI running), **STOP** and message the coordinator (`main`) for review before starting the next. Never chain two PRs without a review handoff.

## 2. What is NOT in this handoff (do NOT touch)

- **PR #54** (`feat/ci-two-tier-gate`) — coordinator merges.
- **Merging any PR.** Coordinator merges. You open, watch, report.
- **Branch protection changes** (`gh api …/protection`). Coordinator only.
- **`dev` or `main` direct commits.** Every change goes through a `feature/*` PR into `dev`.
- **Release cutting.** Coordinator + maintainer.
- **Regenerating the frozen retrieval-corpus benchmark** (`bun packages/cli/scripts/benchmark-context.mjs --write`) unless you edit a corpus member (§10).

## 3. Absolute constraints — machine, workflow, git

These come from user corrections earlier today. Break them and the user will stop the session.

### 3.1 Local machine is a 16 GB Mac. Full test suite crashes it.

**NEVER run any of these locally:**
- `pnpm test`, `pnpm run test`, `pnpm run test:*`, `pnpm --filter ariadnev test`, or any command that runs the vitest project as a whole.
- `pnpm exec vitest run` at the repo root without narrow path arguments.
- More than one agent doing vitest at the same time (this handoff is single-agent already).

**Allowed local checks — light only:**
1. `pnpm run lint` (typecheck)
2. `node packages/cli/scripts/check-brand-drift.mjs`
3. `bun packages/cli/src/index.ts validate --check --strict`  ← the burn-down gate
4. Narrow vitest on touched paths, always with **both** worker flags:
   `npx vitest run --minWorkers=1 --maxWorkers=2 <specific-paths>`
   (`--maxWorkers=2` alone triggers `RangeError: minThreads and maxThreads must not conflict`. Include `--minWorkers=1`.)

CI is the verifier. The local gate is a smoke test to avoid pushing broken code.

**After every batch: reconcile orphan vitest workers.** If any remain (they leak on watchdog kill), `pkill` them:
```
ps -Ao pid,ppid,command | awk '$2==1 && /vitest/ {print $1}' | xargs -r kill
```

### 3.2 One push per PR. Never push to see what CI says.

- Land every fix locally first. Run the local gate. Only then `git push -u origin <branch>`.
- Docs/plan updates that belong with a change go **in the same push**, never as a follow-up commit to an open PR.
- If CI fails after that single push, batch every follow-up fix into one push. Do not push per commit.
- Do not open a PR "to see if it lints". Open a PR only when it is final.
- Rationale: `Lint · Build · Test` is ~13 min. GitHub Actions Pro budget is finite. See memory `ci-minutes-git-workflow-discipline-2026-08.md`.

### 3.3 Git branch discipline

- `dev` is off `main`. `feature/*` is off `dev`. **Never code on `main`.**
- One PR per feature. Target = `dev`. Base of the fresh branch = current `origin/dev`.
- If `dev` moves under you, rebase onto `origin/dev` before pushing (and re-run the local gate; the merge may need an embed regen — §5).
- Do not force-push a branch someone else is watching without `--force-with-lease`.
- Do not delete a branch whose worktree is still checked out; remove the worktree first.
- **Conventional commits, no AI references.** Session trailer required, exactly:
  ```
  <type>(<scope>): <imperative subject>

  <body>

  Claude-Session: https://claude.ai/code/session_01Ro5TsSW8S7Vr3ssMDT86Xh
  ```
  `<type>` = `feat` | `fix` | `refactor` | `docs` | `chore` | `test` | `perf`. `<scope>` = the touched surface, usually `kit` for skill content.

### 3.4 Worktrees live under `.claude/worktrees/`

Never `/private/tmp/…`. Reboot wipes `/tmp`; the last agent lost work that way. Existing worktrees for this handoff:
- `.claude/worktrees/agent-a86fa137e3422b66c` on `feat/skill-tier-b-batch-1` @ `c7117ef` (Tier B batch 1 author commit) — **locked, do not remove**.
- `.claude/worktrees/agent-a87b8c06bea61e230` on `feat/skill-tier-a-batch-2` @ `81c76aa` (Tier A batch 2 author commit) — **locked, do not remove**.
- `.claude/worktrees/agent-a8fb5244b40de0b5a` on `feat/skill-tier-a-calibration` @ `18be10e` — old, may be stale. Ignore unless you need to inspect it.

For a new batch, create a worktree like:
```
cd /Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit
git worktree add -b feat/skill-<batch-slug> .claude/worktrees/skill-<batch-slug> origin/dev
```
When a PR merges, remove the worktree first, then delete the branch:
```
git worktree remove --force --force .claude/worktrees/skill-<batch-slug>
git branch -D feat/skill-<batch-slug>
```

### 3.5 Safety and secrets

- Never print or commit raw secrets, tokens, JWTs, keys, dotenv values. Use `[redacted]`, variable names, counts, or high-level status.
- Never commit `.env*`, `.pem`, `.key`, or personal data.
- No `pnpm install`. Assume dependencies are installed. If a script errors on a missing dep, stop and report — do not install.
- No database or schema mutations in this handoff. If a task somehow implies one, stop and message coordinator.
- Never `push --force` a shared branch. `--force-with-lease` only, and only after a rebase you performed.

## 4. Repository facts you need

- Package manager: **pnpm**. Node: recent LTS. Runtime for the CLI itself: **Bun**.
- Typecheck lives at `pnpm run lint` (not `pnpm typecheck`).
- Kit source: `kit/skills/<name>/SKILL.md` + `kit/skills/<name>/references/*.md`. Agents: `kit/agents/*.md`. Workflows: `kit/workflows/*.md`.
- The CLI installs from `packages/cli/src/kit/kit-embedded.generated.ts` (22 MB, committed). Regenerate with `pnpm --filter ariadnev generate:embedded`. **You must regenerate the embed whenever you change kit content.** The regen is deterministic; two workers regenerating from the same content produce byte-identical output. Do it in the same commit as the content change (a lint script fails otherwise).
- Validator (from source, no install): `bun packages/cli/src/index.ts validate --check --strict`. It counts held findings against `kit/skills-lint-exempt.json` (currently 80 skills). The shrink ratchet fires only under `--strict`; do not use it with more entries than `origin/dev`.
- Brand-drift check: `node packages/cli/scripts/check-brand-drift.mjs`. Path is `packages/cli/scripts/`, not `scripts/`.
- Agent lint (enforced on `dev`): every agent's frontmatter `name` must equal its file stem, with the single exception in `NAME_CASE_EXCEPTIONS` (`explore` → `Explore`). Do not add exceptions.

## 5. Frozen retrieval corpus — check before every kit edit

Editing any of these files invalidates the compiled retrieval graph and requires a benchmark regen (§10):
- Skills: `ask brainstorm code-review cook docs-seeker fix git plan research scout security-scan ship test`.
- Agents: `debugger`, `code-reviewer`.
- Workflows: any of the 3 kit workflows.

If your batch touches one of these, after your fixes:
```
bun packages/cli/scripts/benchmark-context.mjs --write
git add evals/reports/context-graph-benchmark.json
```
Commit the regen with the content change (same commit, or immediately after in the same push).

The `cook` and `fix` skills are already in Tier B batch 1's author commit — a benchmark regen has already been recorded in that commit (`evals/reports/context-graph-benchmark.json`). Verify it was included; if your fix pass touches those two skills further, regen again.

## 6. The authoring bar — what "meets Phase 8" means

Every SKILL.md must have, in this order and with these exact headings:
- `## Output format`
- `## Quality gates`
- `## Workflow position`

Plus the numerical caps:
- SKILL.md ≤ **300 lines** (the widened cap; do not raise).
- Each `references/*.md` ≤ **800 lines**.
- Frontmatter `description:` ≤ **200 chars**, must begin with a trigger verb and preserve the trigger words used in the skill's eval scenarios (do not rewrite so the eval can no longer route).
- `name:` matches the directory / file stem.

The `kit/skills-lint-exempt.json` list is **shrink-only**. Removing a skill from the list is the primary evidence that your batch worked. Adding one is forbidden. If you cannot bring a skill to the bar, leave it on the list and explain in the PR body — do not silently keep the exemption.

## 7. Finding taxonomy (frozen classes)

Second-read and fix-diff re-read findings are labelled by class. Never demote a `fabricated` finding to `optional`.

- `fabricated` — the text asserts something that is not true of the CLI, kit, or repo (a command, flag, file, field, or contract that does not exist).
- `overclaim` — the text overstates a capability, guarantee, or scope.
- `stale` — the text describes an old design still bearing an authoritative voice.
- `contract-mismatch` — the text disagrees with a schema, JSON contract, or interface declared elsewhere in the same kit.
- `redundant` — the text repeats itself. Listed for hygiene, not counted against the fix pass.

Any class other than `redundant` **must** be addressed in the fix pass. `fabricated` is highest priority.

## 8. The per-batch protocol

Every batch follows the same seven steps. Do not skip. Do not reorder.

### Step 1 — Inspect the batch

- Read `plan.md` and the phase-08 phase file. Confirm which skills are in this batch.
- If the author commit already exists (Tier B batch 1, Tier A batch 2): `git log -1 --stat` in the worktree, understand what changed, note any `kit/skills-lint-exempt.json` shrink and any benchmark regen.
- If starting from scratch: list the target skills and current line counts (`wc -l kit/skills/<name>/SKILL.md`).

### Step 2 — Second read (the reader is the coordinator's proxy)

Read the author's diff end-to-end. For every skill in the batch, verify each claim against the actual repo:
- Every command / flag / file / field cited must exist. Grep the repo to prove it.
- Every workflow position claim must match the plan's routing and the other skill's `Workflow position` reciprocally.
- Every reference in `references/` referred to by SKILL.md must exist and its file name must match.
- The description must trigger the eval scenarios it needs to trigger (find the eval scenarios under `packages/cli/src/eval/**` or `evals/**` and confirm keyword overlap).

Produce a **findings list** in `plans/reports/audit-<yyyymmdd>-<hhmm>-<batch-slug>-second-read.md`:

```md
# Audit — <batch-slug> second read

## <skill-name>
- [fabricated] Line N of SKILL.md: cites `av kit init --force`; `av kit` only registers `install-path` and `refresh`.
- [overclaim] References file "coming soon" — plan does not commit to it.
- …
```

Count findings by class per skill. Report the total in the file's summary.

### Step 3 — Fix pass

Edit the SKILL.md / references directly. Every finding except `redundant` must be resolved. When resolving `fabricated`, do NOT invent a replacement — if the honest answer is "this feature doesn't exist", write the honest answer or delete the claim. `plans-kanban` is the extreme case (whole skill's premise is void) — see §11.

For each skill you fix:
- Re-run `wc -l` to confirm ≤300.
- Re-count trigger-verb keywords in the description.
- If the skill is now free of held findings AND lint-clean, **remove it from `kit/skills-lint-exempt.json`**. This is the burn-down.
- If it still needs the exemption, leave it and note why in the PR body.

Regenerate the embed:
```
pnpm --filter ariadnev generate:embedded
```

If you touched a frozen-corpus member (§5), regenerate the benchmark and stage it with your changes.

### Step 4 — Fresh fix-diff re-read

Read your OWN diff (`git diff HEAD`) against the second-read findings. For every finding: confirm the fix landed and did not introduce a new claim.

Produce `plans/reports/audit-<yyyymmdd>-<hhmm>-<batch-slug>-fix-diff-reread.md`:

```md
# Fix-diff re-read — <batch-slug>

## <skill-name>
- FIX finding-1: `av kit init --force` → replaced with `av kit refresh`. Verified refresh exists. ✓
- REGRESSION new-1: [fabricated] wrote `av kit refresh --dry-run`; `--dry-run` is not registered on refresh. Must fix.
- …
```

Regressions in the fix pass **must** be fixed before push. This is the "calibration tail" the coordinator paid for twice today.

### Step 5 — Local light gate

Run every one of these, in order, from the worktree root:

```
pnpm run lint
node packages/cli/scripts/check-brand-drift.mjs
bun packages/cli/src/index.ts validate --check --strict
npx vitest run --minWorkers=1 --maxWorkers=2 packages/cli/src/kit
```

Every command must exit 0. Report each command's outcome verbatim (last 10 lines is enough).

If any fails, fix and re-run. Do NOT push a red gate.

### Step 6 — One push, then a PR

- If `dev` moved: rebase onto `origin/dev`, resolve conflicts, regenerate embed if needed, re-run the local gate.
- Commit the fixes as a single commit or per-topic commits, whichever reads clearer. Follow the trailer format in §3.3.
- `git push -u origin feat/skill-<batch-slug>` — one push, that's it.
- Open the PR:
  ```
  gh pr create --base dev --title "<type>(<scope>): <subject>" --body-file <path>
  ```
  Body must include:
    - **What changed** — bullet per skill, one line each.
    - **Exemption removals** — which entries left `kit/skills-lint-exempt.json`.
    - **Findings addressed** — counts by class per skill (from step 2 and step 4).
    - **Frozen-corpus regen** — yes/no, which files.
    - **Local gate output** — the four command outcomes.
    - **Known limits / deferred** — any skill that stayed on the exemption list and why.

### Step 7 — Watch CI, then STOP

- `gh pr checks <PR#> --watch --interval 60 --fail-fast` — wait for `Lint · Build · Test` (or the fast gate if two-tier is in force by then).
- If CI reports red: read the failure, fix locally, batch every fix into one push (§3.2), watch again.
- If CI is green: **STOP**. Do not merge. Message the coordinator (`SendMessage to: "main"`) with a report in this shape:

```
Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
Batch: <batch-slug>
PR: #<n>
Skills merged from exemption: <n>
Skills that stayed exempted: <list + reason>
Local gate: 4/4 green
CI: <green | red — job name — snippet>
Concerns / Blockers: <optional>
Next batch (per §9): <slug>
```

Then wait for the coordinator's review before starting the next batch. Do not run ahead.

## 9. Task sequence (execute strictly in order)

### Task 0 — Close out PR #51 (`feature/av-invocation-lint`)

**Coordinator's note (do not skip):** the coordinator finished the review's substantive fixes and pushed. CI failed on the first push (`fe597c8`) at the brand-drift gate — the allowlist reason string contained `ak config start` and the `[upstream-bare-alias]` matcher rejected it. The coordinator rephrased and pushed again (`bad335a`). At the moment of this handoff update, the second CI run has not reported. Assume nothing about that run — read it fresh (`gh pr checks 51`) before doing anything.

**State on entry:**
- Branch: `feature/av-invocation-lint`.
- Worktree: `.claude/worktrees/av-lint-fix`.
- HEAD: `bad335a` (six commits ahead of dev — rebased onto `origin/dev` before the last push).
- Local light gate (last-run, on `bad335a`): 4/4 green.
  - `pnpm run lint`: clean.
  - `node packages/cli/scripts/check-brand-drift.mjs`: clean.
  - `bun packages/cli/src/index.ts validate --check --strict`: `0 error(s), 12 warning(s)`. Twelve warnings are held by `kit/av-invocation-allowlist.json` (plans-kanban + coding-level) plus severity-warning-by-design `--summary` option flags on `journal create` (SKILL.md + journal-writer agent).
  - `npx vitest run --minWorkers=1 --maxWorkers=2` on touched paths: 115/115.
- `kit/av-invocation-allowlist.json` has 2 entries; `MAX_INVOCATION_ALLOWLIST_ENTRIES = 2`.
- Docs updated: `README.md` (validate row), `docs/av-skill-authoring-spec.md` (checklist), `docs/decisions/0013-lint-exemption-is-a-shrinking-list.md` (follow-up section explaining two lists).

**What the coordinator already delivered in this branch (six commits):**
1. `e90f670` — HIGH-1: `av run <workflow>` acceptsPositional.
2. `3cdd72a` — HIGH-3: pass command surface into validate (inverts the import cycle for eval-command / behavioral-eval-command).
3. `82b067a` — MEDIUM: script comment/error-string masking.
4. `fe597c8` — main pass: allowlist + count guard + Python/execa spawners + vacuous-denial tightening (`av-invocation-context.ts`) + `--to=1.0.0` fixture + `readFileSync` guard + docs.
5. `bad335a` — brand-drift fix: allowlist reason rephrase, embed regen.
6. (`e90f670`'s parent = `d9a85a5` is the original feat commit from before the review — already on the branch.)

**Your job:**
1. `cd /Users/vchun/Codes/My-projects/vcskill-kit/ariadnev-kit && gh pr checks 51 --watch --interval 60 --fail-fast` — read the current CI verdict on `bad335a`.
2. **If green:** message coordinator with the Status block (§8, step 7). Do NOT merge. Coordinator merges.
3. **If red:** open the failing job's log (`gh run view <id> --log-failed | grep -E "FAIL|Error|error|✗" | head -50`) and read it. Then decide:
   - **Easy, local, on-topic** (a typo, a missing import, a test that was already flaky and now hits the touched code): fix locally, run the full local gate (§8-5) again, commit as `fix(cli|kit): <one-line describing what CI caught>` with the session trailer, `git push` **once**, watch again.
   - **Not on-topic** (a shared flake, `packages/cli/src/eval/*` contention, coverage drift you did not cause): file it briefly in the PR body under "Known limits" and message the coordinator asking whether to defer #51 or fix the shared issue in a separate PR first. Do not chase.
   - **Structural** (typecheck failure the local gate missed, brand-drift on a doc string you can rephrase, embed regen conflict): fix once, push once, watch once. If it stays red on the second push, message the coordinator.
4. **Cap: two rescue pushes total.** After that, stop and report — the coordinator decides whether to defer the PR or take over. Do not spend a whole session on #51 alone; the phase-8 work waits.
5. Regardless of outcome, when you stop working on #51, send the Status/Summary block. If the branch is not green, say so plainly with the failing job's URL — do not phrase it as "I'm still working on it".

**Local gate reminders specific to #51's code:**
- Narrow vitest paths for this PR: `packages/cli/src/cli/validate-command.test.ts packages/cli/src/cli/command-surface.test.ts packages/cli/src/kit/av-invocation-lint.test.ts packages/cli/src/kit/av-invocation-scripts.test.ts`. Do NOT run wider unless a CI failure names a specific test outside this set.
- If CI cites `packages/cli/src/eval/*`: that is the known behavioral-observer / behavioral-runner contention flake documented in memory `ariadnev-cicd-cloudflare-audit-2026-08.md`. It is not your bug. Defer per (3) above.
- Do NOT touch `packages/cli/src/index.ts` unless CI's failure directly demands it — that file is the top of the import chain and the coordinator's HIGH-3 fix went out of its way to keep it lean.

Once #51 is green (or explicitly deferred), start Task A.

### Task A — Tier B batch 1 fix pass
- Worktree: `.claude/worktrees/agent-a86fa137e3422b66c` (branch `feat/skill-tier-b-batch-1`, HEAD `c7117ef`).
- Author touched skills: `cook`, `design`, `fix`, `markdown-novel-viewer`, `mcp-builder` (5 removed from exemption).
- Author commit already regenerated the embed and the benchmark. Verify it.
- Frozen-corpus members touched: `cook`, `fix`. If your fix pass touches them further, regen the benchmark.
- Proceed from step 2 (second read).

### Task B — Tier A batch 2 fix pass
- Worktree: `.claude/worktrees/agent-a87b8c06bea61e230` (branch `feat/skill-tier-a-batch-2`, HEAD `81c76aa`).
- Author touched skills: `agent-browser`, `ai-artist`, `ai-multimodal`, `autoresearch`, `better-auth`, `bootstrap`, `brainstorm`, `chrome-profile`, `code-review`, `codex-goal`, `coding-level`, `common` (12 removed from exemption).
- Author's commit message already lists 7 corrections you should verify — `ai-artist`'s `extract_prompts.py`, `codex-goal`'s `av-<slug>` prose, `coding-level`'s `av kit init --force`, etc. Confirm each is honestly resolved (§7).
- Frozen-corpus members touched: `code-review`, `brainstorm`. Regen benchmark if you touch them.
- Proceed from step 2.

### Task C — Tier B batch 2 author + fix
- New worktree: `.claude/worktrees/skill-tier-b-batch-2` off `origin/dev`.
- Skills: `agentize`, `orchestrate`, `shopify`, `ui-styling`, `web-frameworks`.
- Start from step 1 (nothing exists yet). Author + second-read + fix + re-read in one agent session? No — split: author commit first (`feat(kit): bring <skill> to the authoring bar` per skill or one bundle), then re-enter step 2. One PR per full batch is fine.
- Frozen-corpus members touched: none of these are corpus. Skip §5.

### Task D — Tier A batches 3-7
- ~59 skills remaining after `common`. Batch in groups of 8-12 to keep PRs reviewable. Suggested slugs: `tier-a-batch-3` through `tier-a-batch-7`. You choose sizing; keep each PR under ~1500 net lines of diff.
- Must include: `backend-development` (widely referenced by other skills — verify reciprocity), `preview` (visualization skill — check its evals), and `plans-kanban` (SPECIAL — see §11).
- Frozen-corpus members: any of `ask`, `docs-seeker`, `git`, `plan`, `research`, `scout`, `security-scan`, `ship`, `test` — regen benchmark on touch.

### Task E — Reference splits
- Six reference files >800 lines. Phase-08 file names them; grep `references/*.md | wc -l` if the plan text has stale numbers.
- Split by topic, one file per concern, keep each ≤800. Update the SKILL.md's references to the new file names. No content deletion — pure reorganization.
- One PR per skill (they're big diffs).

## 10. Frozen-corpus regen mechanics

`bun packages/cli/scripts/benchmark-context.mjs --write` reads the compiled retrieval graph and writes `evals/reports/context-graph-benchmark.json`. It's deterministic given identical kit content. If your regen produces a diff other than what the content change would explain, stop — something drifted in the graph compiler, and that is out of scope for this handoff.

Commit the regen with the content change (same commit) so a reviewer sees the coupling.

## 11. `plans-kanban` — content decision, not a routine fix

This skill's whole premise is a dashboard the upstream ak-kit shipped as `ak config start`. This CLI never registered `av config start` (only `av config prefs` and `av config layers`). Its SKILL.md, its launcher script, and everything it references are pointed at a command that does not exist.

**Do NOT rewrite `plans-kanban`'s prose to fit a smaller feature.** That would leave a skill whose reason to exist is void. The correct outcome is one of:
- The kanban feature is decided to exist and is built into the CLI. That is not this handoff — stop and message the coordinator.
- The skill is deleted and its evals/references cleaned. That is a content decision the coordinator holds. Ask.

Until the coordinator answers, leave `plans-kanban` on `kit/skills-lint-exempt.json` and on `kit/av-invocation-allowlist.json` (already added by PR #51). Note in the batch PR body that this skill is deferred and why.

## 12. When to send a message back to the coordinator

Send a message (`SendMessage to: "main"`) — do not spawn or fork agents — in exactly these cases:

1. **After every PR is opened and CI is green.** The Status/Summary block from step 7.
2. **When you cannot proceed** — a `fabricated` claim you cannot honestly resolve without a product decision (like `plans-kanban`); a test failure that indicates a real regression outside your batch; the `dev` branch protection blocking your PR.
3. **When you find a defect you must record but not fix in this batch.** For example, a validator rule that's wrong. Include the defect in the PR body's "Known limits" and note it in your Status report.
4. **When a step in this handoff document conflicts with what you see in the repo.** Do not silently follow the repo — surface the conflict so the handoff can be corrected.

**Do NOT** send a message for every step of every batch — that defeats the handoff. One message per batch is the target: at the end, after CI is green.

## 13. Prohibited actions (recap, absolute)

- Running the full test suite anywhere.
- Merging any PR.
- Pushing more than once per PR without a red-CI reason.
- Modifying branch protection or repo settings.
- Committing to `main` or `dev` directly.
- Creating worktrees outside `.claude/worktrees/`.
- Force-pushing without `--force-with-lease`, or force-pushing at all when the branch is not your own.
- Installing dependencies (`pnpm install`, `npm install`, etc.).
- Printing raw secrets or committing them.
- Adding entries to `kit/skills-lint-exempt.json`. The list is shrink-only.
- Demoting a `fabricated` finding to `optional`.
- Editing `docs/design-guidelines.md`.
- Editing `plans/*.md` for anything other than the audit reports named in §8. The plan file itself is coordinator-owned.
- Spawning subagents. This handoff is single-agent, sequential.

## 14. References the agent should read as needed

- Phase file: `plans/260822-1407-ariadnev-kit-correctness-and-operational-hardening/phase-08-skill-content-burn-down.md` (bar, taxonomy, tier lists).
- Plan index: same directory, `plan.md` (progress table, dependency map).
- Prior audits (patterns to imitate): `plans/reports/audit-260823-1440-tier-a-calibration-tally.md`, `plans/reports/audit-260823-1500-calibration-tail-read.md`.
- Authoring spec: `docs/av-skill-authoring-spec.md`.
- ADRs: `docs/adr/` — read the ones your fix touches.
- CI: `.github/workflows/ci.yml` (once PR #54 merges, the fast gate `Lint · Validate · Unit` runs on PRs into `dev`; until then, `Lint · Build · Test` is the check).

## 15. Success — what "you finished" looks like

For each task A → E:
- One PR merged (by coordinator, not you).
- Every listed skill removed from `kit/skills-lint-exempt.json` OR the skill is explicitly deferred with a coordinator-recorded reason.
- Embed regenerated. Benchmark regenerated if applicable.
- Every audit report (second read + fix-diff re-read) committed under `plans/reports/`.
- CI green.
- Your Status message received by the coordinator.

For phase 8 as a whole:
- `kit/skills-lint-exempt.json` reaches zero (or its remaining entries are explicitly deferred with recorded decisions).
- `av validate --check --strict` reports 0 held findings.
- Six reference splits complete.

**Do not declare phase 8 done yourself.** Report the state and let the coordinator close the phase.

---

Read this file again before starting. When you're ready to begin Task A, send the coordinator a one-line acknowledgement: `Acknowledged phase-8 handoff. Starting Task A — Tier B batch 1 second read.` Then start.
