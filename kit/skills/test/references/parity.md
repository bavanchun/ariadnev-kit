# Parity: vc:test vs ak-test

Source baseline: `ak-test` v1.0.0 (decision 0003, AgentKit baseline).

## Kept

| From ak-test | Why |
|---|---|
| "Never ignore a failing test" core rule | The non-negotiable that makes a green report trustworthy |
| Multi-language runner auto-detection | Same target audience; unchanged value |
| Typecheck-before-suite ordering | Catches cheap errors before the slow run |
| Coverage + build verification | A gate needs both, not just pass/fail |
| UI/browser testing branch | Real need for frontend targets |
| Subagent delegation | Maps to the `vc-tester` agent |

## Dropped (with reason)

| Dropped | Reason |
|---|---|
| Team-mode / task-surface coordination block | Belongs to `vc:pm`/orchestration, not the test runner; out of trigger |
| Three separate reference files (execution/ui/report) | Folded the common case into SKILL.md to stay tight and orphan-free; runner-specific commands are discoverable, not worth a static doc |
| `when_to_use` / `category` / `keywords` frontmatter | Not in the vc allowlist; taxonomy → `metadata.category` |
| Prescriptive "80%+" coverage default | Replaced with "the project's own threshold" — guessing a number produces false gates |

## Improvement (parity-or-better)

- **Proof-vocabulary alignment.** Results are classified by the shared proof layers
  (`unit`/`integration`/`e2e`/`platform`) so `vc:test`'s verdict plugs straight into
  the same gate `vc:cook`, `vc:code-review`, and `vc:ship` consume — ak-test emits a
  free-form report with no shared taxonomy.
- **Threshold honesty.** Coverage is judged against the project's configured
  threshold rather than a hardcoded 80%, removing a class of false PASS/FAIL.
