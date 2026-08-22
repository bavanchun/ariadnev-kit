# 0013. The lint exemption is a shrinking list, not a property

Date: 2026-08-22
Status: Accepted. Supersedes the severity split in
[0008](./0008-porting-upstream-content.md).

## Context

ADR 0008 downgraded house-style lint findings to warnings for any skill carrying
`metadata.origin: ported`. The reasoning held at the time: the alternative was
either rewriting content the port promised to copy verbatim, or dropping the bar
for everything.

What it produced, measured on 2026-08-22:

- **101 of 105 skills** carry the flag. Four do not — `av`,
  `obsidian-second-brain-note`, `plan-i18n`, `pm`.
- Those 101 are not *leniently checked*. Three of the six house checks are
  skipped outright for them, so nothing distinguishes "passes" from "was never
  asked". The corpus is **unmeasurable**, which is a different and worse thing
  than lenient.
- The downgrade produced **87 warnings that no command read**, and it *skipped*
  a further **301 checks** outright (101 × Output format, 101 × Quality gates,
  99 × Workflow position) — those were never findings at all. `Kit.warnings` was
  populated by `load-kit.ts` and consumed by one test. "Reported as a warning
  rather than ignored" was not true of the 87, and was not even attempted for
  the 301.
- The exempt class can only grow. Adding `origin: ported` to a new skill is one
  frontmatter line, and nothing reports that the exempt set got larger.

ADR 0011 also removed the strongest objection to editing ported content:
upstream is a one-time fork, not tracked, so diffability against it is
explicitly not a constraint.

## Decision

Exemption is by **name, in `kit/skills-lint-exempt.json`**, not by a property of
the artifact.

The mechanics are copied from `kit/skills-pending-port.json`, which already
solves this shape in this repo: a checked-in list, read at the impure boundary,
with a shrink-only test.

1. `isPorted(artifact)` is deleted. `lintSkill(artifact, references, exemptNames)`
   takes the set.
2. The list is read in `load-kit.ts`, which has a kit root. `skill-lint.ts` stays
   pure — its module contract is that every rule is unit-testable without a
   filesystem, and reading JSON inside it would make ~15 fixture tests depend on
   the real repo.
3. **Both** call sites flip. The second one, the reference-orphan severity in
   `validate-command.ts`, is easy to miss and is exactly what phase 8 needs.
4. A test fails when a listed skill already passes every check unaided. Without
   it the list is the old exemption with extra steps.
5. `lintSkill` returns a third channel, `held`, and `av validate` prints its
   count. A backlog nobody can see is not a backlog.

   Two things this had to get right, both found by review after a first attempt
   got them wrong. The held count must exclude findings that hold for *every*
   skill — the duplicate-heading heuristic contributes 159 — or the number
   overstates the backlog and cannot reach zero even with the list empty. And
   the three skipped checks must actually run for listed skills, into `held`,
   or the largest part of the backlog stays invisible. First attempt printed
   `246 warning(s) held`, of which 159 were unrelated and 301 were missing.
   It now prints **388 held, 159 warnings**, as separate numbers.

### `REFERENCE_MAX_LINES` moves 300 → 800

Measured over the 463 reference files the loader actually sees: **83 exceed 300,
6 exceed 800.** A limit that most of the corpus-by-weight violates is not a
limit, it is a warning generator — and it was suppressed for precisely the files
that tripped it, so it never bound anything. 800 leaves six real outliers
(822–1718 lines) to answer for themselves.

"Actually sees" is load-bearing. `readReferenceFiles` does not recurse, so
`references/<subdir>/*.md` is never linted at all. Counted recursively the corpus
is 500 files, **89 over 300 and 8 over 800** — two outliers no line limit can
reach, and `install-plan.ts` copies them to users regardless. That blind spot is
older and wider than this ADR; it is recorded here because the measurement above
would otherwise read as a statement about the corpus rather than about the
linter's field of view.

ADR 0008's table counted 740 files with the longest at 2249. That was the
upstream source tree before porting, walked recursively and including files that
are not skill references. Neither number contradicts the other; they count
different things.

### Anti-filler checks: one gate, two advisories

The premise was that a required section can be present and empty — the fixture
corpus already ships exactly that. Five candidate checks were run against the
four authored skills **before any gate code was written**, on the rule that a
check an honest author fails is a bad check, not a finding.

| Candidate | Exemplars | Disposition |
|---|---|---|
| Workflow position names an `av:<slug>` | 4/4 pass | **gate** |
| Quality gates has ≥3 bullets | 4/4 pass | advisory — see below |
| Output format shows a fence, table, or list | `av` fails: deliberate prose | `review-section-quality.mjs` |
| Required sections contain a backticked term | 2 of 4 fail | `review-section-quality.mjs` |
| Cross-corpus body uniqueness | — | dropped; `description-collision.ts` already does calibrated Jaccard with a reason-required allowlist. A weaker exact-match parallel would be worse than the module that exists. |

Two notes on that table.

**The Quality-gates bullet count cleared the exemplars but is still not a gate.**
Every fixture in the test suite would have needed editing to satisfy it, for a
threshold with no principle behind the number 3. The measurement is recorded here
in case it is ever wanted; the churn is not worth it now.

**The Workflow-position gate accepts an explicit "none".** A standalone skill
legitimately relates to nothing, and `av add-skill` scaffolds `Related: none.` —
without the escape the scaffold would produce a skill that fails on creation, and
authors would be pushed to invent relationships. The spec already uses this shape
for `Proof/risk: N/A — <reason>`.

The escape is anchored to a whole line: an optional label, then the word. A
first version accepted `none` anywhere in the section, which also accepted
"none of the downstream skills depend on it" — prose, and exactly what the rule
exists to reject. An escape wide enough to admit prose is not an escape, it is
an off switch.

**None of these detect filler.** A short generator satisfies all of them. They
are a floor. The actual control is second-reader review, budgeted in phase 8.

## Consequences

- The exempt set is a number that can be watched. It starts at **101** skills
  and **388** held findings.
- The backlog is ratcheted in both directions: membership shrinks by deletion,
  and a checked-in high-water mark stops the finding count growing. Without the
  second half a listed skill could gain findings freely — a longer SKILL.md, a
  new over-cap reference, a deleted section — with CI green, which is exactly
  the channel phase 8 exercises while editing 101 listed skills.
- The ratchet measures `lintSkill` only. The second exemption site — the
  reference-orphan severity in `validate-command.ts` — is not covered by it. In
  practice CI runs `validate --check --strict`, which promotes orphans to errors
  for listed skills too, so the gap is narrower than it looks: it is open to a
  local non-strict run, not to the build. Fold orphans into the ratchet if that
  ever bites.
- Deleting the last entry deletes the file, `exemptSkillNames`, and the
  `exemptNames` parameter. The mechanism is designed to be removed.
- A non-empty list when phase 8 closes means the plan does not close — it
  replans. An allowlist with no deadline is the thing this ADR replaced.
- `metadata.origin: ported` stays as provenance. It no longer decides severity,
  and the two must not be re-coupled.
- Ported content is now edited freely where it improves the skill. ADR 0011 is
  what permits this; ADR 0008's verbatim-copy promise expired with the fork.
