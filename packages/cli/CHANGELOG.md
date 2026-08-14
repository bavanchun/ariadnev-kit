# vcskill

## 0.12.0

### Minor Changes

- Initial published kit surface with 26 skills, decisions ledger, and anchor
  verification. Ships the graph-native local execution harness with versioned
  workflow contracts, static graph linting, event-sourced checkpoints, safe
  resume/cancel lifecycle, and provider-neutral Codex and Claude Code adapters.
  The first public execution surface is read-only; workspace-changing execution
  remains policy-denied until a public approval and side-effect adapter exists.

  Ships behavioral and performance gates for the full skill catalog and 14
  golden tasks, recovery/idempotency cases, cross-runtime conformance, and a
  benchmark-proven deterministic artifact context graph. Paused runs fail
  closed after incompatible graph or runner upgrades and remain inspectable
  and cancellable.
