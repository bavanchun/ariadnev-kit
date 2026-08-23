# Calibration tail read — issue-to-plan and the final fix pass

Independent second read of the two surfaces the calibration batch never had
read: `kit/skills/issue-to-plan/` (never read at all) and the final fix pass
(`88799ba` = `0b0e211` on dev; `cc51476` = `bab0dac` on dev — the kit trees of
each pair are identical, checked with `git diff <a> <b> -- kit/`).

Method: every hunk read in the context of the current full file and of every
file it cites; each name, flag, path, count, and behaviour claim checked with
`ls`, `grep`, `git show`, `<cmd> --help`, or the CLI source. Classes are the
frozen five; `redundant` is listed separately and not counted.

Baseline for "inherited": `git show c888d2e:<path>`. Origin for "introduced"
names the dev commit that added the text.

## Summary

| Surface | Substantive | Introduced | Inherited |
|---|---|---|---|
| issue-to-plan | 5 | 2 (`57a2e38`, the batch) | 3 (`c888d2e`) |
| ariadnev (`0b0e211`) | 1 | 0 | 1 (`c888d2e`, left inconsistent by the fix) |
| handover (`0b0e211`) | 1 | 1 (`0b0e211` adds "team state"; "CI" from `3cced69`) | 0 |
| advise (`bab0dac`) | 0 | — | — |
| debug (`bab0dac`) | 1 | 1 (`bab0dac`) | 0 |
| deploy (`bab0dac`) | 0 | — | — |
| graphify (`bab0dac`) | 0 | — | — |
| preview (`bab0dac`) | 0 | — | — |
| vibe (`bab0dac`) | 1 | 0 | 1 (`57a2e38`, the batch; visible in the hunk's file) |
| xia (`bab0dac`) | 0 | — | — |

Regressions introduced by the final fix pass itself (`0b0e211` + `bab0dac`):
**2** (handover "team state"; debug "root cause is proven" gate). Both are
small, but both are real: one overclaims a sibling skill's scope, the other is
a gate a documented terminal status cannot pass.

## issue-to-plan — `kit/skills/issue-to-plan/SKILL.md`

Only file in the skill (no `references/`, no `scripts/`). 283 lines.

| # | Class | Origin | Line | What | Evidence |
|---|---|---|---|---|---|
| 1 | overclaim | introduced `57a2e38` | 279 | "`av:vibe` runs the same issue all the way to a merged PR" | `kit/skills/vibe/SKILL.md:19` "with optional merge"; `:42` merge only under `--ship`; `:210` "Optional merge and CI convergence". Default vibe stops at a reviewed PR. |
| 2 | contract-mismatch | introduced `57a2e38` | 261-262 | Gate: "the run stops at a pushed plan branch" | Step 3 Stop rule (`:106-109`): a gate-stop run creates no worktree and pushes no branch, and Output format (`:252-255`) explicitly covers that run. The gate cannot be ticked on the skill's own documented stop path. |
| 3 | contract-mismatch | inherited `c888d2e` | 238-250 | Output format has no slot for the HTML plan path | Step 4 (`:128-129`) captures it; the handoff template (`:188`) carries `HTML plan:`; Quality gate 6 (`:269-271`) audits "every artifact path in the handoff". The closing block lists `Plan:` and `AgentWiki:` only. |
| 4 | contract-mismatch | inherited `c888d2e` | 241 | `Decision:` enum `proceed|needs-decisions|duplicate|reject|defer|not-worth` | Step 7 (`:145-146`) lists "already handled" and "out of scope" as gate-stop decisions; step 3 (`:100`) pairs "duplicate / already handled". Neither has a slot. |
| 5 | overclaim | inherited `c888d2e` | 78-79 | "Fetch title, body, comments, labels, and linked PRs: `gh issue view ... --json number,title,body,labels,comments,state`" | `gh issue view --json` field list (run locally): PR linkage is `closedByPullRequestsReferences`; the command as written fetches no PR data. |

Checked and found sound: `/av:plan validate` / `red-team` (`kit/skills/plan/SKILL.md:144-145,170-171`); the whole-plan consistency sweep (`plan/SKILL.md:158-163`); `--html`/`--wiki` (`plan/SKILL.md:81,83`); `/av:git cp` (`git/SKILL.md:24`); `../av-cook/references/plan-state-files-first.md` exists; `av:cook` exists; `gh label create --color --description` is valid; the eval scenario's trigger words ("validated, red-teamed", "GitHub issue", "plan", "do not implement or open a PR") survive in the description, and "scout"/"brainstorm" remain in `when_to_use` and `keywords`.

### Redundant (not counted)

- Gate 2 (`:261`) restates `:21` ("does NOT implement, cook, ship, or open a PR").
- Gate 3 (`:263`) restates `:29-30` ("title, body, and requirements are NEVER overwritten ... only comments and labels are added").
- Gate 4 (`:265`) restates `:35-37` and the Security bullet `:230-231`.
- Workflow position last sentence (`:281-283`) restates `:23-25` ("orchestrates ... never bypasses those skills' gates").

Left in place: gates are checklists and the batch wrote them as such; nothing here is deleted.

### Nits

- `:44-46` example URLs use `bestariadnevs/ariadnev`, a rename artifact; no such org. Replaced with `owner/repo` placeholders.
- Gate 5 (`:267`) names the default label literally though `--plan-ready-label` can rename it. Reworded to "the plan-ready label".
- `:66-67` "created if missing; otherwise fall back" — the fallback applies when creation fails (Failure modes `:211-215`), not "otherwise". Reworded.

## ariadnev — `0b0e211` (`88799ba`)

Hunks: SKILL.md Step 2 Codex bullet, Step 4 dialect pointer, worked route, Quality gates preamble; `chaining-patterns.md` intro + Marketing Sequences; `subagent-timing.md` row 32 + Codex dialect; `task-taxonomy.md` plan-campaign row.

| # | Class | Origin | File:line | What | Evidence |
|---|---|---|---|---|---|
| 6 | fabricated (inherited) + stale (introduced) | inherited `c888d2e`; left inconsistent by `0b0e211` | `references/subagent-timing.md:27,34,35,39` and `references/task-taxonomy.md:24` | Trigger table still names agents that do not exist: `scout` (27), `content-reviewer` (34), `campaign-debugger` (35), `analytics-analyst`, `database-admin` (39). Row 32, rewritten by the fix, now says "this kit ships no content agents" while rows 34-35 two lines below still illustrate content agents. The taxonomy's create-content row names a "content-reviewer role". | `ls kit/agents/` — 16 files, none of those names; the explorer is `Explore` (`kit/agents/explore.md:2`). `av:scout` is a skill, not an agent. The fix commit message says it removed "four agents that do not exist"; it removed one row's four and left five more. |

Checked and found sound: Codex installs to home regardless of scope (`packages/cli/src/providers/resolver.ts:52-56`); `--global` exists (`av install --help`); `codex debug prompt-input` is the observed listing surface (`spec-verified.ts:93-94`); `toolNames: none(...)` (`spec-verified.ts:103`) supports "nothing in this repo observes a Codex in-session spawn tool"; `av:copywriting`, `av:design`, `av:ai-artist` exist and their descriptions cover the claimed uses; the taxonomy's "Risk modifier table" is `### Risk` under `## Modifiers`; `../av-find-skills/references/domain-routing.md`, `../av-cook/references/workflow-routing.md`, `../av-preview/references/visual-explanation-routing.md`, `kit/rules/primary-workflow.md` all exist; `av:av`, `av:plan-i18n`, `av:orchestrate`, `av:team`, `av:find-skills` exist.

### Nits

- `chaining-patterns.md` "## Marketing Sequences" lists no sequences (by design after the fix); heading left, not worth churn.
- `task-taxonomy.md:25` "analytics skill" — no such skill ships; the table's closing note says slots come from Step 2 inventory, so left alone.

## handover — `0b0e211` (`88799ba`)

Hunks: Handoff validation list, Artifacts report line, Workflow position Related; `references/scenarios.md` Scenario 4.

| # | Class | Origin | File:line | What | Evidence |
|---|---|---|---|---|---|
| 7 | overclaim | "team state" introduced `0b0e211`; "CI" introduced `3cced69` | `SKILL.md:243-244` | "`av:watzup` owns human-facing status from branches, CI, repository history, and team state" | `kit/skills/watzup/SKILL.md` contains no "CI" and no "team" (grep count 0 for both); its description is "branch, worktree, detached-HEAD state, unfinished plans with checkbox progress, roadmap milestones, ranked next steps". |

Checked and found sound: the Validation summary has exactly four checks and they match the four bullets (`handoff/references/artifact-schema.md:136-147`); the "Not captured in this session" stand-in rule lives in `redaction-patterns.md:50-68` and `artifact-schema.md:72-73`; `handoff-version` rejection is anticipated in `artifact-schema.md:21`; run-dir layout matches `orchestrate/SKILL.md:250-262`; Trap 3 mapping matches `job-spec-template.md:42-52`; `av:advise`, `kongming`, `av:pm`, `av:watzup` exist; runtime-catalog IDs match `SKILL.md:79-82`; the Gemini wording precedent exists (`use-mcp/SKILL.md:71`).

## advise — `bab0dac` (`cc51476`)

No substantive finding. Step 6, the artifact table, and the last gate now agree: a flagless run writes nothing; under `--agent` the advisor writes the report and state file, which are "the ones the flags asked for". `ask_user capability` is the neutral tool name used throughout; `ui-ux-designer`, `docs-manager`, `git-manager`, `advisor`, `Explore` all exist; `av:ask`, `av:plan`, `av:cook`, `av:brainstorm`, `av:scout` exist.

## debug — `bab0dac` (`cc51476`)

| # | Class | Origin | File:line | What | Evidence |
|---|---|---|---|---|---|
| 8 | contract-mismatch | introduced `bab0dac` | `SKILL.md:156-157` | Restored gate "Root cause is proven, not guessed" | Output format (`:133-134`) allows `Status: Under investigation` with "the narrowest boundary reached", and (`:136-137`) "an investigation that ends with only hypotheses says so"; the very next gate (`:159-161`) legislates for that run. The same commit moved the phase-3 minimal test to `av:fix` (`:36`), so this skill never tests its hypothesis — an `Under investigation` run cannot tick "proven". The gate needs scoping to the statuses that claim a cause. |

Checked and found sound: `systematic-debugging.md:39-46` — phase 3 step 2 is "SMALLEST possible change to test hypothesis", so "the phase-3 minimal test ... change[s] code" holds; `av:fix` activates `av:debug` at its step 2 and then implements (`fix/SKILL.md:204`); `av:test`, `av:scout`, `av:problem-solving`, `av:docs-seeker`, `av:repomix`, `av:agent-browser`, `av:chrome-profile` exist.

## deploy — `bab0dac` (`cc51476`)

No finding. 15 playbooks under `references/platforms/` (counted), 14 rows in Detection Signals (Vultr absent), Vultr under Enterprise/Scale in step 4, `docs/deployment.md` is step 1's first check (`:37`).

## graphify — `bab0dac` (`cc51476`)

No finding. The sentence now defines affiliation by this skill's own install line (`pip install graphifyy`), which is a claim about the skill, not about PyPI.

## preview — `bab0dac` (`cc51476`)

No substantive finding. The restored toggle gate matches `references/html-css-patterns.md:131-165` ("first child of `<body>`", "considered incomplete") and `generation-modes.md:166,207`.

### Redundant (not counted)

- Gate at `SKILL.md:187-189` restates `:116` ("MANDATORY — Theme Toggle ... Pages without the toggle are considered incomplete"). Restored deliberately by the fix; left in place.

## vibe — `bab0dac` (`cc51476`)

Hunks: step 4 linkage sentence, step 7 finalize paragraph, step 10 merge paragraph.

| # | Class | Origin | File:line | What | Evidence |
|---|---|---|---|---|---|
| 9 | stale | inherited `57a2e38` (the batch), in the hunk's file | `SKILL.md:3` description "Use for autonomous runs that should finish at a merged PR"; `:286-287` "it terminates in a merged, CI-green PR" | Contradicts `:19` "with optional merge", `:42-43` (merge only under `--ship` / `--both`), `:210` "Optional merge". Same overclaim issue-to-plan copied (finding 1). |

Checked and found sound: `av plan status --plan` reads or sets; `status` writes unconditionally (`packages/cli/src/cli/plan-command.ts:266-281`); `av plan close` = "Mark the plan completed" with `--plan`; ship Step 9b sets `in-progress` when work is partial (`ship/references/ship-workflow.md:204-206`); `av plan archive` refuses unless `completed`/`cancelled` or `--force` (`plan-command.ts:343-346`); `av plan list` prints `*` on the current plan, name, status, `completed/phases` (`plan-command.ts:181-200`), no flags beyond `--json`; `av plan update <phase> <status>` with only `--plan`/`--json`; `av plan search <query>` exists.

## xia — `bab0dac` (`cc51476`)

No substantive finding. `--fast` skips phases 3 and 4 (`:38`), so a `--compare --fast` report has no Analyze pass; step 6 now correctly says a plan exists "outside `--compare`".

### Nits

- `:143-144` "rests on the phase-2 map alone" — phase 1 (Recon) also feeds the Head-to-Head (source map, local map). Reworded to "the recon and map phases".

## Disposition

All nine substantive findings fixed in `fix(kit)` commits on this branch;
redundant items left untouched; nits fixed where the edit was a few words in a
file already being changed. No quality gate was deleted.

## Fix-diff re-read

A fresh `general-purpose` subagent read `git diff origin/dev..HEAD -- kit/`
after the first fix commit (`55438a2`), with only the frozen classes and ground
truths as its brief. It verified the agent roster, skill directories, `gh`
field list, `av plan` help, the plan/git/cook/xia citations, and both eval
scenarios against the edited descriptions. It reported **3 substantive
findings (stale 2, contract-mismatch 1), 1 redundant, 3 nits** — all
substantive ones in `issue-to-plan/SKILL.md`, all opened by my fix.

| # | Class | File:line | What | Disposition |
|---|---|---|---|---|
| R1 | stale | `issue-to-plan/SKILL.md:66-67` vs `:216-217` | My reworded default ("when creation fails, fall back") contradicted the Auth gap failure mode ("cannot create labels ... stop"). The pre-edit "otherwise" was vague; the edit made the contradiction explicit. | Accepted. Auth gap now covers comment, label-edit, and push; label creation alone is the Missing label case, where the decision label falls back and the plan-ready label is reported as the missing capability. `5faf4e2` |
| R2 | stale | `issue-to-plan/SKILL.md:241` vs `:97-109`, `:176` | Extending the Decision enum with `already-handled` / `out-of-scope` left step 3's decision list and the evaluation comment template unable to emit them. | Accepted. Step 3 now reads "reject / defer / out of scope", the stop rule lists out of scope, and the template enum carries both. `5faf4e2` |
| R3 | contract-mismatch (low) | `issue-to-plan/SKILL.md:262-263` | The gate I reworded enumerated two legal end states and missed an Auth-gap stop at step 6 after the worktree exists but before the push. | Accepted. Gate now allows "a pushed plan branch or a reported blocker" after the gate, and "no branch or worktree" on a gate stop. `5faf4e2` |
| — | redundant | `debug/SKILL.md:158-159` | The tail I added to the restored gate restated gate 3 and the Output format. | Accepted; tail dropped, gate kept. `5faf4e2` |
| — | nit | `xia/SKILL.md:142-143` | "since phase 3 was skipped" — `--fast` skips 3 and 4. | Fixed. `5faf4e2` |
| — | nit | `vibe/SKILL.md:288` | "stops at a reviewed plan" reads as human-reviewed; the review comes after. | Fixed: "validated, red-teamed plan". `5faf4e2` |
| — | nit | `debug/SKILL.md:156` | `Mitigated` is defined nowhere. | Not taken: the enum is inherited and defining it is outside this read. |

Regressions in my own fix, as measured by the re-reader: **3 substantive on 1
skill** (0 on the other 6 files). Every one was a line adjacent to an edit
that the edit left inconsistent — the same failure shape as the batch's fix
passes, at a lower rate. Validator, lint, and the kit/cli test run were clean
after both fix commits.
