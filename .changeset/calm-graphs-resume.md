---
"vcskill": minor
---

Add a graph-native local execution harness with versioned workflow contracts,
static graph linting, event-sourced checkpoints, safe resume/cancel lifecycle,
and provider-neutral Codex and Claude Code adapters. The first public execution
surface is read-only; workspace-changing execution remains policy-denied until a
public approval and side-effect adapter exists.

Ship behavioral and performance gates for all 26 skills and 14 golden tasks,
recovery/idempotency cases, cross-runtime conformance, and a benchmark-proven
deterministic artifact context graph. Paused V1 runs fail closed after incompatible
graph or runner upgrades and remain inspectable/cancellable.
