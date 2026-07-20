# Test Gate

Run this checklist before declaring any implementation done. It replaces a
separate test skill — the gate lives inside the cook pipeline.

## 1. Choose the right scope

Start narrow, then widen only when shared surface changed:

| Change | Minimum test run |
|---|---|
| One module, internal | That module's test file |
| Shared helper / exported symbol | Module tests + every caller's tests |
| Public contract (API, schema, CLI flag, env var) | Full suite + typecheck + build |
| Config / build files | Full suite + a real build |

When delegating the run to the `vc-tester` agent, it maps changed files to tests
by its Strategy A–E table (co-located → mirror-dir → import-graph → config →
high-fan-out) and auto-escalates to the full suite on config/high-fan-out
changes — the agent-side detail of the scope rules above.

## 2. Execute

1. Run the narrowest suite. All green? Widen per the table.
2. Run lint/typecheck if the repo has them (`package.json` scripts, Makefile).
3. For bug fixes: confirm the new regression test fails on the old code
   (stash or revert mentally — the test must encode the bug).

## 3. Interpret honestly

- A flaky test is a finding, not noise — rerun once; if it flips, report it.
- Skipped/`.todo` tests you added must be called out in the final report.
- Coverage drops on touched files need a reason or a new test.
- Never edit an assertion just to make it pass; if the expectation truly
  changed, the commit message must say the contract changed.

## 4. Evidence

The final report must quote real output: test counts, suite duration, or the
failing→passing transition. "Tests pass" without numbers does not clear the
gate. Label evidence by proof layer (unit/integration/e2e/platform — defined
in `references/risk-lanes.md`) when the change crosses more than one; a phase
can skip a layer if the report states why.

## No test infrastructure?

Say so explicitly and offer: (a) add the minimal runner (one config + one
test), or (b) proceed unverified with the user's consent recorded. Silence is
not an option.
