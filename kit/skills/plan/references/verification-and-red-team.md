# Verification and Red Team

Run this gate after the first complete draft and after any material plan edit.
It reviews the plan document and verifies its factual claims; it does not
implement or review production code quality.

Review and refine the whole draft for completeness, clarity, and actionability
before applying the evidence checks below.

## Scale verification by phase count

Tier detection counts phases in the plan:

| Phases | Tier | Active verification roles | Minimum sample |
|---|---|---|---|
| 1–2 | Light | Fact Checker | 5 claims per phase |
| 3–4 | Standard | Fact Checker + Contract Verifier | 10 claims per phase |
| 5+ | Full | All four roles | 15 claims per phase |

For each active role at the current tier, verify claims against the actual
codebase and return `VERIFIED`, `FAILED`, or `UNVERIFIED` with evidence.

- **Fact Checker:** paths, symbols, endpoints, config keys, and manifests.
- **Flow Tracer:** actual entry → guard → branch → target ordering, including
  early returns and async boundaries.
- **Scope Auditor:** state lifetime, instantiation sites, duplicate state, and
  isolation boundaries.
- **Contract Verifier:** all callers, imports, re-exports, tests, CLI/docs, and
  producers/consumers on both sides of the contract.

Never write “update all callers”. State the count and list each caller; above
ten, list the first ten and the total.

## Adversarial review

Apply up to four lenses, directly or through explicitly authorized reviewers:

1. Security adversary—auth bypass, injection, data exposure, privilege and supply chain.
2. Failure-mode analyst—race, partial failure, data loss, recovery and rollback holes.
3. Assumption destroyer—load-bearing dependencies and conditions that invalidate success.
4. Scope/complexity critic—YAGNI violations, premature abstractions, and scope creep.

The posture is hostile to unsupported assumptions, not a helpful or
complimentary review. Every finding must include codebase verification evidence
with at least one `path/to/file:line` citation. Reject evidence-free findings
with rationale `No codebase evidence`; do not adjudicate their merit.

Collect findings, deduplicate overlap, sort Critical → High → Medium, and cap
the actionable set at 15. Adjudication must be evidence-based. Preserve explicit
user decisions: if a finding would reverse one, present the original decision,
concern, trade-off, and concrete options before changing the plan.

## Validate implicit decisions

Scan for architecture, assumptions (`assume`, `expect`, `should`, `will`,
`must`, `default`), trade-offs, risks, dependencies, blockers, MVP/future scope,
and `[UNVERIFIED]` tags.

Questions should surface implicit decisions, not facts discoverable from the
repository. Each material question has two to four concrete options with one
clearly recommended and a free-form path. Record the full question, all options,
the answer, rationale, and phase impact in `## Validation Log`.

Correct a purely factual typo only from direct evidence. Never auto-reverse a
user decision; confirmation is required when a correction changes scope,
architecture, contracts, or accepted trade-offs.

Resolve `[UNVERIFIED]` claims where possible and append a verification summary:

```markdown
### Verification Results
- Tier: Light | Standard | Full
- Claims checked: <n>
- Verified: <n> | Failed: <n> | Unverified: <n>
- Failures: <file:line evidence and correction/decision needed>
```

## Order and consistency

Run adversarial red-team review before decision validation: accepted findings
may add risks, remove sections, or change constraints, so validation must assess
the final reviewed plan rather than a pre-review draft.

After applying any accepted edit:

1. Re-read `plan.md` and every `phase-*.md` file.
2. Build a short decision-delta list: renamed fields/APIs/files, changed scope,
   dependencies, ownership, order, criteria, and rejected assumptions.
3. Search all plan files for old terms, superseded assumptions, and duplicate
   embedded drafts or contracts from each delta.
4. Reconcile the hub summary, phases table, requirements, implementation steps,
   success criteria, risks, and validation/red-team logs.
5. Append a whole-plan consistency result with files reread, deltas checked,
   stale references fixed, and unresolved contradiction count.

If contradictions remain, list them as unresolved and ask the user. Never
present the plan as ready or recommend `vc:cook` until the consistency sweep
reports zero unresolved contradictions.
