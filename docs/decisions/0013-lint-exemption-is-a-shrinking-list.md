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
- The downgrade produced **246 warnings that no command read.**
  `Kit.warnings` was populated by `load-kit.ts` and consumed by one test.
  "Reported as a warning rather than ignored" was not true.
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
5. `av validate` prints the held-warning count. A backlog nobody can see is not
   a backlog.

### `REFERENCE_MAX_LINES` moves 300 → 800

Measured over the 463 reference files the loader actually sees: **83 exceed 300,
6 exceed 800.** A limit that most of the corpus-by-weight violates is not a
limit, it is a warning generator — and it was suppressed for precisely the files
that tripped it, so it never bound anything. 800 leaves six real outliers
(821–1717 lines) to answer for themselves.

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

**None of these detect filler.** A short generator satisfies all of them. They
are a floor. The actual control is second-reader review, budgeted in phase 8.

## Consequences

- The exempt set is a number that can be watched. It starts at **101**.
- Deleting the last entry deletes the file, `exemptSkillNames`, and the
  `exemptNames` parameter. The mechanism is designed to be removed.
- A non-empty list when phase 8 closes means the plan does not close — it
  replans. An allowlist with no deadline is the thing this ADR replaced.
- `metadata.origin: ported` stays as provenance. It no longer decides severity,
  and the two must not be re-coupled.
- Ported content is now edited freely where it improves the skill. ADR 0011 is
  what permits this; ADR 0008's verbatim-copy promise expired with the fork.
