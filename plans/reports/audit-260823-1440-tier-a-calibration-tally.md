# Tier A calibration — independent defect tally

Auditor: independent agent. Read-only on the repo; no file under `kit/` or
`packages/` was touched. Evidence base: 15 reader transcripts under
`/Users/vchun/.claude/projects/-Users-vchun-Codes-My-projects-vcskill-kit/7a8dd36a-ff0f-4377-ac41-a0006912b7cc/subagents/`,
PR #48's body (used as an index and verified transcript-by-transcript), and
`git diff c888d2e..origin/feat/skill-tier-a-calibration` with the eleven
per-commit diffs on that range.

---

## 1. Headline

**Denominator D = 14.**

| Metric | Result |
|---|---|
| **Introduced** — skills with ≥1 substantive defect the authoring or fix pass created | **14 / 14** |
| **Inherited** — skills with ≥1 substantive defect already false in the pre-batch file | **6 / 14** |
| Substantive findings total (acted on, frozen classes) | 79 |
| — of which introduced | 66 |
| — of which inherited | 12 |
| — of which origin unclear | 1 |
| Fix-pass regressions (defects the fix-diff re-read found in the fix pass's own work) | 31 |
| Disputed | 0 |
| Unverified | 0 |

**Excluded from the denominator (1 skill):**

- `issue-to-plan` — **UNKNOWN**. Changed on the branch (37 lines, commit
  `369287b`) but no transcript in the subagent directory targets it in either
  pass. I confirmed this mechanically: no transcript's opening prompt names
  `issue-to-plan` as the file under review. Absence of a transcript is not
  evidence of zero defects; it is evidence of zero measurement.

**Sampling-policy bracket, stated mechanically from the thresholds:**

> introduced = 14, and 14 ≥ 4 → **100% second reads for all 69 remaining skills.**

The bracket is not close and is not sensitive to the classification calls in
§5. The lowest defensible introduced count — demoting every duplication
finding, every reader-marked optional, and every borderline class call — is 13
(only `ask` would drop out, since its sole introduced finding is the weakest in
the batch). 13 is still more than triple the ≥4 threshold.

---

## 2. Per-skill table

Substantive = acted-on reader finding in one of the four frozen classes
(`fabricated` / `overclaim` / `stale` / `contract-mismatch`). Nit counts are
indicative: they aggregate reader-labelled nits, reader-labelled optionals, and
duplication findings I reclassified (see §5).

| Skill | Second-read transcript | Fix-diff re-read transcript | Subst. | Intro. | Inherit. | Fix-pass regr. | Nits | Disputed | Status |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| ask | `agent-af900715415099fc5` | `agent-a4c502cc7ce34ae30` | 2 | 1 | 1 | 0 | 2 | 0 | counted |
| watzup | `agent-a993e576bed671a5b` | `agent-ab781129422a3acc4` | 4 | 2 | 2 | 2 | 4 | 0 | counted |
| databases | `agent-ac03093afa6568bfa` | `agent-ab781129422a3acc4` | 7 | 7 | 0 | 2 | 5 | 0 | counted |
| backend-development | `agent-af900715415099fc5` | `agent-a4c502cc7ce34ae30` | 3 | 3 | 0 | 2 | 6 | 0 | counted |
| docs | `agent-a4188cf47f89514be` | `agent-a4c502cc7ce34ae30` | 5 | 5 | 0 | 2 | 5 | 0 | counted |
| debug | `agent-a561ca879621b8571` | `agent-addbdad1afb577bc3` + `agent-a3800ca77cbef5c9f` | 5 | 5 | 0 | 4 | ~11 | 0 | counted |
| preview | `agent-a561ca879621b8571` | `agent-addbdad1afb577bc3` + `agent-a3800ca77cbef5c9f` | 4 | 4 | 0 | 2 | ~14 | 0 | counted |
| graphify | `agent-a561ca879621b8571` | `agent-addbdad1afb577bc3` + `agent-a3800ca77cbef5c9f` | 5 | 5 | 0 | 3 | ~11 | 0 | counted |
| deploy | `agent-a561ca879621b8571` | `agent-addbdad1afb577bc3` + `agent-a3800ca77cbef5c9f` | 7 | 7 | 0 | 4 | ~10 | 0 | counted |
| vibe | `agent-a8eafaf0ae04a3ce4` | `agent-a3800ca77cbef5c9f` | 4 | 3 | 1 | 1 | 6 | 0 | counted † |
| handover | `agent-a553f62705ba3ce45` | `agent-a158f04b9bdb18b96` | 9 | 6 | 3 | 2 | ~13 | 0 | counted |
| ariadnev | `agent-ac749a88cb0db12a4` | `agent-a158f04b9bdb18b96` | 12 | 8 | 4 | 6 | ~9 | 0 | counted |
| xia | `agent-aa5ca73c57e085b01` | `agent-a3800ca77cbef5c9f` | 8 | 6 | 1 ‡ | 0 | ~11 | 0 | counted |
| advise | `agent-a09f0396aa03336ba` | `agent-a3800ca77cbef5c9f` | 4 | 4 | 0 | 1 | 8 | 0 | counted |
| **issue-to-plan** | **none found** | **none found** | — | — | — | — | — | — | **UNKNOWN** |
| **Totals (D = 14)** | | | **79** | **66** | **12** | **31** | | **0** | |

† `vibe` — the pair exists and both passes reached a verdict, so by the
denominator rule it counts. But the pair covers only the plan-CLI correctness
fix (`97340c7`). vibe's larger sections rewrite in `369287b` — 86 lines of
`SKILL.md` plus a new 54-line `references/github-artifacts.md` — received
neither pass. Its numbers are therefore a floor, not a measurement.

‡ `xia` also carries 1 finding with `origin: unclear` (X1), counted in neither
headline.

**PR #48 index verification.** Every row of the PR body's transcript table was
checked by opening the transcript and reading its opening prompt. All 15
mappings are correct; no mislabelled row. The PR body's two `unknown` cells
(`vibe` sections work, `issue-to-plan`) are also correct. The PR body's
`agent-a561ca879621b8571` row covers four skills in one transcript, and
`agent-a3800ca77cbef5c9f` covers seven — both confirmed from the prompts.

---

## 3. Finding ledger

Origin key: `I` = introduced (text the batch wrote, or a falsity the batch's
edit created), `H` = inherited (text already present and already false before
`c888d2e`), `?` = unclear. Pass: `2R` = second read, `RR1` = first fix-diff
re-read, `RR2` = second fix-diff re-read.

### ask

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| A1 | contract-mismatch | I | 2R | New quality gate 5 demands an "unresolved" report slot the new Output format's closed five-item list has no room for | `369287b` — Output format item 6 `**Unresolved**` added, `ask/SKILL.md:53` |
| A2 | overclaim | H | 2R | Pre-batch description ("best practices evaluation, solution comparison") claims territory `evals/scenarios/skills/ask.json` marks `av:ask` forbidden on | `369287b` — description rewritten, `ask/SKILL.md:3` |

### watzup

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| W1 | contract-mismatch | H | 2R | Item 3 mandates an `X/Y todos · NN% done` annotation `attachPlanProgress` cannot always supply; relabelling `## Report Format` → `## Output format` made it binding | `369287b` — item 3 rewritten |
| W2 | overclaim | H | 2R | `docs/*roadmap*.md` is wider than `ROADMAP_NAME_RE` (`roadmap.cjs:12`), and omits `milestone.md` | `369287b` — item 4 rewritten |
| W3 | overclaim | I (fix) | RR1 | The fix-pass text over-attributes `no checkbox data` to git-ref plans only; a checkbox-free filesystem plan yields it too | `d857839` |
| W4 | stale | I (fix) | RR1 | New item 4 contradicts the untouched Default-behavior line 44, which still states the old glob | `d857839` — line 44 rewritten |

### databases

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| D1 | overclaim | I | 2R | Batch-written example `db_migrate.py --db mongodb status` exits 1 — `--uri` is required for every subcommand but `generate` | `369287b:65` |
| D2 | overclaim | I | 2R | Batch-written backup example omits the mandatory Postgres `--database`, and `/backups/` raises an uncaught `PermissionError` | `369287b:73` |
| D3 | stale | I | 2R | New description/Related boundary ("not for provisioning or hosting") contradicted five untouched body lines | `369287b:25-38` |
| D4 | overclaim | I | 2R | The `--dry-run` inventory implies `rollback` reverses something; on MongoDB it only forgets the migration | `369287b:88-99` |
| D5 | contract-mismatch | I | 2R | Output format demands before/after `EXPLAIN` in the skill's own from-scratch scenario, where no database is reachable | `369287b:128-133` |
| D6 | contract-mismatch | I (fix) | RR1 | Fix pass routed five named responsibilities to `av:devops`, which owns none of them | `d857839` |
| D7 | stale | I (fix) | RR1 | The same new boundary contradicts the untouched `mongodb-atlas.md` / `postgresql-administration.md` nav lines | `d857839` |

### backend-development

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| BD1 | contract-mismatch | I | 2R | New preamble tells the agent not to carry a benchmark over, then routes to eight of them one link away | `369287b:62-64` |
| BD2 | fabricated | I (fix) | RR1 | "benchmark figures that are undated" — all five reference files stamp `(2025)` on line 3 | `d857839` → "2025-vintage" |
| BD3 | contract-mismatch | I (fix) | RR1 | De-yearing the OWASP nav line dropped the file's real edition pin (`2025 RC1`) | `d857839:48` |

### docs

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| DO1 | overclaim | I | 2R | Workflow position presents `av:llms` and the `llms` argument as the same deliverable; `av:llms` is a superset | `369287b:162-168` |
| DO2 | contract-mismatch | I | 2R | Output format has no slot for `summarize`'s answer, and its Created/Updated column contradicts `agent-context`'s confirm-before-write | `369287b:118-131` |
| DO3 | contract-mismatch | I | 2R | All six new gates restate Maintenance Rules 25 lines above; the skill's real failure modes are unguarded | `369287b:134-146` |
| DO4 | contract-mismatch | I (fix) | RR1 | New gate 1 hard-codes a `docs/` layout the skill explicitly refuses to impose | `d857839` |
| DO5 | overclaim | I (fix) | RR1 | "docs land in the same change as the behavior" — ship's step 9 is an explicitly non-blocking background task | `d857839` |

### debug

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| DB1 | contract-mismatch | I | 2R | New "Diagnoses; does not apply the fix" contradicts four untouched places mandating Phase 4 Implementation. Blocking | `369287b` + `cc51476`, `:36`, `:101` |
| DB2 | contract-mismatch | I | 2R | "which owns the section order" — `reporting-standards.md` carries two conflicting orders | `369287b:149-152` (tie-break added) |
| DB3 | overclaim | I (fix) | RR1 | New gate requires the browser check to have run; `frontend-verification.md:78` mandates a documented skip line instead | `dfa01db` |
| DB4 | overclaim | I (fix) | RR1 | New gate requires the symptom reproduced; `systematic-debugging.md:22` contemplates the non-reproducible path | `dfa01db` |
| DB5 | contract-mismatch | I (fix) | RR2 | "Run phases 1-3 here" collides with the surviving no-code-change gate — phase 3 step 2 is an edit | `cc51476` |
| — | *out-of-class* | I (fix) | RR2 | Fix pass silently deleted the "root cause is proven, not guessed" gate — the load-bearing check of a skill whose purpose is proving cause | restored, `cc51476` |

### preview

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| P1 | fabricated | I | 2R | "no external CSS, JS, or font request" is false against the skill's own required references; obeying it strips Mermaid and Chart.js. Reader verdict **REJECT** | `369287b:184-186` |
| P2 | contract-mismatch | I | 2R | Output format omits the markdown viewer's preview URL, which `generation-modes.md:108-113` requires reporting | `369287b:175` |
| P3 | contract-mismatch | I | 2R | "View mode returns the server URL … and nothing else" — `view-mode.md:37-40` requires three things | `369287b:161-163` |
| P4 | contract-mismatch | I (fix) | RR1 | "or its markup re-read" is exactly what `generation-modes.md:83` forbids for diagram modes | `dfa01db` |
| — | *out-of-class* | I (fix) | RR2 | Fix pass deleted the theme-toggle gate while `SKILL.md:116` still calls it MANDATORY | restored, `cc51476` |

### graphify

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| G1 | stale | I | 2R | "The build writes four artifacts" hardened a 4-row table into a checkable count that is wrong (upstream documents six) | `dfa01db:69` |
| G2 | stale/fabricated | I | 2R | New gate asserts "a `graphify` package on PyPI is someone else's"; the project has zero release files and `pip install graphify` fails | `dfa01db:33-35` |
| G3 | overclaim | I (fix) | RR1 | "upstream is reclaiming the `graphify` name, which currently has no releases" — three unsourced assertions, none traceable in-repo | deleted, `dfa01db` |
| G4 | fabricated | I (fix) | RR1 | "Upstream documents … a `wiki/` tree behind `--wiki`" — `--wiki` is `av:plan`'s flag, not graphify's | deleted, `dfa01db` |
| G5 | fabricated | I (fix) | RR2 | "any `graphify*` package on PyPI is unaffiliated" disowns `graphifyy`, which the same paragraph tells you to install | `cc51476` |

### deploy

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| DP1 | overclaim | I | 2R | New description says "across 15 providers"; only 14 have a detection signal | count dropped, `:3` |
| DP2 | contract-mismatch | I | 2R | Rewritten description dropped all fifteen platform names — a trigger regression `deploy.json` cannot detect. Blocking | names restored, `:3` |
| DP3 | contract-mismatch | I | 2R | Gate "rollback path stated before production is overwritten" is unsatisfiable on a first deploy and contradicts §6 and the new Output format | `:203` |
| DP4 | contract-mismatch | I | 2R | Output format requires the detection file and exact command that `## Security Policy:160` forbids exposing | policy amended, `:165` |
| DP5 | overclaim | I (fix) | RR1 | Fix pass invented `production` as the default environment; `vercel` / `netlify deploy` bare commands target preview/draft | `dfa01db` |
| DP6 | overclaim | I (fix) | RR1 | "Vultr … reached via project-type recommendation" — Vultr is in neither the detection nor the recommendation table | `dfa01db` |
| DP7 | overclaim | I (fix) | RR2 | "reached **only** from step 4 or by naming it" skips detection step 1, which reads `docs/deployment.md` | `cc51476` |
| — | *out-of-class* | I (fix) | RR1 | Fix pass removed the `.env`/`.gitignore` gate, the one deleted check with no coverage elsewhere | restored, `dfa01db` |

### vibe

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| V1 | overclaim | I | 2R | Steps 7 and 10 assert `/av:ship` already wrote `status: completed`; ship's documented command is rejected by the live CLI, and the rewrite deleted the only working close — net effect, the plan is never finalized | `97340c7` + `cc51476`, `vibe/SKILL.md:192` |
| V2 | overclaim | I | 2R | "post-merge you are on the target branch, so `resolve` returns nothing" — vibe merges server-side and never leaves the feature worktree | `:215` |
| V3 | stale | H | 2R | Line 100's "if `resolve` reports an ambiguity" is index-era fiction; `runPlanResolve` does one map lookup | `:100` |
| V4 | overclaim | I (fix) | RR | Fix pass told the agent to close any plan not reading `completed`, destroying ship's deliberate partial marker | `cc51476:192` |

### handover

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| H1 | fabricated | I | 2R | `Artifacts: <… patch, diff, run log>` — orchestrate captures none of those names | `808b6d1`, `:167` |
| H2 | fabricated | I | 2R | "first bulletted next-action" — `artifact-schema.md:67` says the next actions are a numbered list | `:168` |
| H3 | fabricated | H | 2R | "(see Model routing below)" points at a section that does not exist | `:60` → "Job spec construction" |
| H4 | contract-mismatch | I | 2R | `Model:` is defined only for `runtime: internal`; the commonest branch (CLI, no `--model`) has no rule | `:178` (read from `status.json`) |
| H5 | overclaim | H | 2R | "`approval:` flipped to `inherit` … when `--yes`" drops Trap 3's destructive exception | `:61`, `:138` |
| H6 | contract-mismatch | I | 2R | Gate 6 demands an arbiter verdict for blocked jobs, which never dispatch | `:228` |
| H7 | stale | H | 2R | `## Handoff validation` had drifted from `artifact-schema.md`, losing the H1 check and the empty-section rule | `:95-110` |
| H8 | overclaim | I (fix) | RR | The fixed validation list credits `artifact-schema.md`'s Validation summary with a rule that lives in `redaction-patterns.md` | `88799ba` |
| H9 | contract-mismatch | I (fix) | RR | `scenarios.md` Scenario 4 expects `scoped-write` for work it calls destructive, contradicting the Trap 3 mapping the same commit tightened | `88799ba` |
| — | *out-of-class* | I | 2R | The new `references/scenarios.md` was missing from the embedded kit; `embedded-kit.test.ts` failed | `18be10e` |

### ariadnev

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| A1 | fabricated | H | 2R | `av-codex-agent-runtime` MCP server and `av codex-agent-runtime register` — neither exists; the port plan lists the command under non-goals | `5e63a46` |
| A2 | contract-mismatch | I | 2R | Output format's short-circuit line fits one of Step 0's three rows, and tells the agent to emit a route line for a pure-conversation question | `:212-215` |
| A3 | stale | H | 2R | Step 5 reproduced `task-taxonomy.md`'s Risk modifier table and had drifted in two rows (credentials, data migration no longer read as `high`) | deferral, `5e63a46` |
| A4 | contract-mismatch | I | 2R | The post-chain report is specified three times with three non-overlapping field lists, undercutting the new Output format | `:218` |
| A5 | fabricated | H | 2R | "engineer installs" describes a kit variant this product does not have | → "when installed" |
| A6 | fabricated | H | 2R | `av-orchestrate` / `av-team` / `av-find-skills` written where the invocable `av:<slug>` belongs, which also puts them outside both validators | → `av:` form |
| A7 | overclaim | I (fix) | RR | "Codex ships no in-session spawn tool" — `spec-verified.ts:103` records `toolNames: none(...)`; the fix swapped one unproven claim for its inverse | `88799ba` |
| A8 | fabricated | I (fix) | RR | Project-level `.codex/agents/` install path — `resolver.ts:52` installs Codex artifacts to home regardless of scope | `88799ba` |
| A9 | fabricated | H | RR | Step 4 still pointed at the `agent_<slug>` MCP dialect the same commit deleted (incomplete fix of A1) | `88799ba` |
| A10 | fabricated | I (fix) | RR | "This kit ships no marketing skills" is false — `copywriting`, `design`, `ai-artist` all ship unconditionally | `88799ba` |
| A11 | stale | I (fix) | RR | `chaining-patterns.md`'s intro still promised the sequences the same commit deleted | `88799ba` |
| A12 | fabricated | I (fix) | RR | `task-taxonomy.md:22` still cross-referenced the deleted marketing sequences | `88799ba` |

### xia

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| X1 | contract-mismatch | ? | 2R | `--fast` described two incompatible ways. Line 37 ("skip research and challenge phases") is pre-batch and already names a phase that does not exist; line 54's "skips phases 3 and 4" is batch-written and created the contradiction | `d584dd3:37` |
| X2 | contract-mismatch | I | 2R | The new Output-format handoff contract demands a decision matrix and risk score `--fast` never produces — every `--fast` run breaks its own contract | `:152-153` |
| X3 | contract-mismatch | H | 2R | "In non-fast mode, get approval before continuing" contradicts `--auto`, whose purpose is not stopping | `:137` |
| X4 | stale | I | 2R | The batch-written "do not restate them here" sentence inlines the risk bands and drops the framework's Action column, so 5+ criticals no longer read as "stop" | `:131-135` |
| X5 | contract-mismatch | I | 2R | Two new gates fail `--copy` by design and are unanswerable under `--compare` | gates rewritten |
| X6 | overclaim | I | 2R | New Workflow position files `av:plan` as "precedes" when phase 5 calls it — the section's own rule applied inconsistently | `:218-223` |
| X7 | contract-mismatch | I | 2R | Phase 5 reads as an unconditional `av:plan` delegation while Output format and Workflow position both assume `--compare` skips it | `:141` |
| X8 | fabricated | I | 2R | The batch-written delegate list lowercases `Explore`, whose declared name is `Explore` (pre-batch the same line named a `scout` agent that does not exist) | `:91` |

### advise

| # | Class | Origin | Pass | What | Acted on |
|---|---|---|---|---|---|
| AD1 | contract-mismatch | I | 2R | Artifact table's `Advice report \| always` contradicts the flagless-run rule and credits the wrong writer under `--agent` | `f7eec29:195` |
| AD2 | contract-mismatch | I | 2R | The `Path or URL` column holds trigger conditions, not paths | `:193-199` |
| AD3 | contract-mismatch | I | 2R | The GitHub row has no cell for the `gh` failure the skill explicitly refuses to fake | `:199` |
| AD4 | contract-mismatch | I (fix) | RR | The new flagless-run rule contradicts the new gate still promising "the report and the artifacts the flags asked for" | `cc51476` |
| — | *out-of-class* | I | 2R | Gate 1 does not self-check the skill's loudest rule, the `<HARD-GATE-ONE-QUESTION>` | `f7eec29` |

---

## 4. Disputed and unverified

**Disputed: none.** I searched the three controlling parent transcripts
(`agent-a8fb5244b40de0b5a`, `agent-aa7e5959ed577a8f2`, `agent-a02264585a796aa47`)
for the language of pushback (`disagree`, `declined`, `not applying`,
`disputed`, `leaving as is`, `reject that finding`) and found no instance of the
author arguing a finding down. I then checked the final branch state for every
substantive finding in §3 and confirmed each was applied. Several
reader-marked *optionals* were applied too (handover's `isolation: prompt-only`
correction, advise's `## Communication Style` deletion and URL-intake
restoration, ariadnev's marketing-route replacement, xia's `## Reference`
deletion, handover's "for example" hedge on the Artifacts line).

Three items were declined **by the readers themselves**, not by the author, and
are therefore not findings at all:

- The `Proof/risk:` spec point — four separate readers checked and found zero of
  105 kit skills carry it, including both named exemplars, and each explicitly
  refused to count it.
- ariadnev's `"when installed"` hedge — the re-reader was asked whether it is
  misleading and answered "No, and I would leave it."
- `ask`'s `disable-model-invocation` / eval-scenario tension — flagged
  out-of-diff and explicitly not counted.

**Unverified: none among substantive findings.** Every one was traced to a
concrete change in the final branch state. I did not individually verify the
disposition of every reader-marked nit (roughly 115 of them); nits do not enter
any headline, so this does not affect the numbers.

**One genuinely unmeasured surface, recorded rather than assumed:** commits
`88799ba` and `cc51476` — the last fix pass, touching 13 files across seven
skills — were never themselves re-read. Every prior fix pass in this batch
introduced new substantive defects (31 fix-pass regressions across 12 of 14
skills). The base rate says this one probably did too. That is an unmeasured
tail, not a zero.

---

## 5. Method notes

**Frozen classes are a closed list, and I enforced that.** Three finding types
that readers reported as substantive fall outside the four classes, and I moved
them:

1. **Duplication findings** ("this gate restates text 30 lines above"). The
   `agent-a561ca879621b8571` reader counted eight of these inside its
   substantive totals — 2 in debug, 3 in preview, 2 in graphify, 2 in deploy.
   Duplication is not `fabricated`, `overclaim`, `stale`, or
   `contract-mismatch`; it is closest to "ordering". **I reclassified all of
   them as nits.** This is the single largest deflation I applied and it lowers
   that transcript's headline from 20 substantive to 15. It does not move any
   skill's boolean.
2. **Reader-marked optionals in a substantive class.** The frozen nit
   definition ends with "or a suggestion the reader marked optional/non-blocking",
   which overrides class. The costly instance is ariadnev optional #7: the
   marketing worked route names ~18 skills and 3 agents that do not exist —
   textbook `fabricated`, demoted to a nit purely because the reader marked it
   optional (and said so only because "the surgery is larger than a wording
   fix"). **I followed the letter of the definition and counted it as a nit.**
   ariadnev's boolean is unaffected; had it been the only finding, this call
   would have mattered a great deal.
3. **Out-of-class defects.** Five findings are real, required a content change,
   and belong to none of the four classes: the missing embedded-kit entry that
   failed `embedded-kit.test.ts` (handover), three silent gate *deletions* by
   the fix pass (debug's root-cause gate, preview's theme-toggle gate, deploy's
   `.env` gate), and advise's unguarded hard gate. **All are excluded from the
   substantive totals and listed in the ledger as `out-of-class`.** The three
   deletions *are* counted in the fix-pass-regression column, since the column
   asks what the fix pass caused, not only what it wrote.

**Origin rule, and where I had to interpret it.** The stated test is textual:
did the offending text exist before `c888d2e`? I applied that test directly, by
`git show c888d2e:kit/skills/<slug>/SKILL.md`, for every finding whose origin
was not stated outright by the reader. Two readers labelled origin for me
(`agent-a553f62705ba3ce45` named findings 4/6/8/9 pre-existing;
`agent-ac749a88cb0db12a4` named 1/3/5/6 pre-existing) and I spot-checked both
against the pre-batch files rather than trusting the label.

The interpretation I had to make: **when the batch's edit made previously-true
or previously-inert text false, I called it `introduced`, not `inherited`.** The
frozen text supports this — inherited is defined as "ported text the batch
merely *exposed*", and a batch that falsifies text has not merely exposed it.
This affects ariadnev A11/A12 and watzup W4. The mirror case, where the reader
said the relabelling turned already-inaccurate prose into a binding claim
(watzup W1, W2), I called `inherited`, matching the reader's own framing.

One finding resisted both readings and is marked `origin: unclear` (xia X1): the
sentence the fix replaced is pre-batch and was already wrong, but the
contradiction the reader reported only exists because the batch added the other
half. It is counted in neither headline.

**How often did I have to decide nit-versus-defect?** Roughly fifteen times —
well past "a handful". That is signal about the definitions, and it clusters in
two places: the duplication class, which the readers were explicitly told to
hunt for but which the frozen list has no slot for, and the
optional/non-blocking override, which lets a `fabricated` finding become a nit
on effort grounds. If this tally is repeated on the remaining 69, both gaps
should be closed first, because they are exactly where a motivated count would
drift.

**A structural note on what "introduced" measures here.** 14/14 is not a subtle
result and it is not an artifact of generous counting. Twelve of the fourteen
skills carry an *unambiguous, blocking, factual* introduced defect — an
unrunnable command the batch wrote (`databases`), a description that lost its
fifteen trigger words (`deploy`), a gate that would strip Mermaid and Chart.js
from every page (`preview`), fabricated upstream outputs and a fabricated PyPI
hazard (`graphify`), "this kit ships no marketing skills" when three ship
(`ariadnev`), an instruction that destroys ship's deliberate partial marker
(`vibe`), captured artifact names orchestrate never produces (`handover`), a
contract no `--fast` run can satisfy (`xia`). The two weakest cases are `ask`
(one contract gap, plus one inherited overclaim) and `watzup` (both second-read
findings inherited; introduced status rests on its two fix-pass regressions).

**Direction of every remaining bias.** The denominator excludes the one
unmeasured skill rather than assuming it clean, `vibe`'s numbers are a floor
because half its change was never read, and the final fix pass is unmeasured.
Each of those pushes the count *down*, not up.

---

## 6. Unresolved questions

1. **Does the batch's "100% second read" claim hold?** Not literally. Of the 15
   skills, 14 have a complete pair; `issue-to-plan` has neither pass, and
   `vibe`'s pair covers only one of its two changes. If the calibration was
   meant to be a census, it is 14/15 by skill and less than that by changed
   line.
2. **Should the unread final fix pass (`88799ba`, `cc51476`) be read before the
   number is used to set policy?** Every measured fix pass produced regressions
   at a rate of ~2 per skill. Reading it would either confirm the pattern or be
   the first counter-example — and it is the only cheap way to learn whether
   the protocol's own last step is safe.
3. **Are duplication findings in scope for the authoring bar?** The reader
   prompts ask for them explicitly ("flag any gate that merely restates
   something already stated elsewhere") but the defect taxonomy has no class for
   them, so they land in the nit column and vanish from every headline. Either
   add a class or stop asking readers to hunt for them.
4. **Should a reader be allowed to mark a `fabricated` finding optional?** As
   the definitions stand, marking ~18 non-existent skill names "optional"
   converts a fabrication into a nit. That is a defensible authoring call and an
   indefensible measurement one.
5. **`issue-to-plan` is unmeasured and on the branch.** It received the same
   three-section treatment as the other fourteen, which produced at least one
   introduced defect in every skill that was actually read. It should be read
   before this PR merges, independently of what the sampling policy becomes.
