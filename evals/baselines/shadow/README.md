# Shadow conformance baseline

This directory records the evidence boundary for graph shadow mode. Shadow data
contains only graph/run IDs, sequence, event enums, optional elapsed time, and
adapter provenance. Prompts, paths, arguments, tool output, and state values are
not accepted by the event schema. Local JSONL uses directory mode `0700`, file
mode `0600`, and a bounded event count.

## Pinned v0.10.0 audit

The Phase 2 baseline has 14 deep golden cells: 13 workflow and one kit cell. All
14 persisted their outcome score but intentionally recorded
`routing.runtime-events` and `trajectory.runtime-events` as unavailable. The
shadow compatibility audit therefore reports:

| measure | result |
|---|---:|
| golden cells audited | 14/14 |
| observed route events | 0 |
| route mapping rate | N/A |
| accepted residual classification | 14 `legacy-telemetry-unavailable` |
| outcome regressions | 0 |
| claimed observed safety conformance | none |

This is an explicit accepted classification, not fabricated parity. Historical
cells retain their original verdict and outcome dimension. Prospective runtime
events must meet either 95% route mapping or have every residual explicitly
accepted; safety deviations can never be waived. Active side effects remain
blocked. Phase 7 may exercise only the default-deny read-only slice and must emit
prospective events before any stronger promotion claim.

Reproduce the audit and conformance fixtures from the repository root:

```bash
pnpm exec vitest run packages/cli/src/eval/trajectory-conformance.test.ts \
  packages/cli/src/harness/shadow/shadow-run.test.ts
```
