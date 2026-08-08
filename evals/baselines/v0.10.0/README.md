# vcskill v0.10.0 behavioral baseline

This directory freezes the pre-graph behavioral baseline for vcskill 0.10.0.
`summary.json` is the machine-generated result, while `environment.json` pins
the independently captured source, runtime, invocation, cache, and privacy
conditions needed to interpret it.

## Scope

The population contains 66 cells:

- 52 skill cells: one positive trigger and one nearest-negative route for each
  of the 26 shipped skills.
- 14 deep golden tasks spanning read-only, bugfix, change, safety, recovery,
  and kit-level behavior.

Every cell ran in a fresh controller-owned synthetic fixture. The executor
received only the task prompt through standard input. It did not receive the
scenario contract, expected route, evidence vocabulary, budgets, or fixture
identity.

## Frozen identities

| Component | Identity |
|---|---|
| vcskill kit | `vcskill@0.10.0`, commit `41eee05b1ebf3ecd7404baa05c6972cecbbd6c40`, tree `0f25711289bb53db26a5e88254660b3ef13bf304` |
| Behavioral harness | commit `4fa4108ac3c2fa37b61443cb7dddec96df0a01e8`, tree `59a7c8bae1860cd252598ba588479d4ddf1c51e7` |
| AgentKit source | CLI/kit `2.8.0-beta.8`, commit `fdf5302ebb2238f3c1a95e8a0e834f3bc2735cca`, registry manifest SHA-256 `7d9cec4404112bd4d2e1afc1aa91af0cc861b849d4f2a37c7617ec4239256f20` |
| Runtime | Codex CLI `0.147.0`, model `gpt-5.4-mini`, `workspace-write` sandbox |

The host toolchain categories and exact runner argv are in
`environment.json`. Machine-specific paths and credential values are excluded.

## Method and trust boundary

The controller independently records process lifecycle, elapsed time,
capability preflight, disposable-container mutations, and verified artifacts.
Executor stdout is transient input and never becomes observation provenance.
Printed routing, safety, or trajectory labels therefore cannot promote a
dimension to pass.

The run used one repeat per cell. The default three-repeat policy is useful only
when stochastic routing or trajectory events are independently observable;
those trusted event sources do not exist in the current runtime seam. Running
three identical untrusted-output trials would add cost without producing a
valid routing-variance estimate. The harness's three-repeat retention and
aggregation behavior is covered separately by deterministic tests.

The release gate is fail-closed and dimension-preserving:

- any observed safety failure, outcome failure, failed run, or missing skill
  cell fails the gate;
- an unavailable trusted observation keeps the affected run incomplete;
- latency cannot average away quality or safety failures;
- tokens, context size, retries, and interventions are reported only when a
  trusted runtime source exists.

## Captured result

The frozen run retained all 66 cells and correctly failed the release gate:
4 runs failed, 50 remained incomplete, and 12 were unsupported at capability
preflight. One safety failure and one timed-out outcome crossed hard release
floors; three runs exceeded their latency budget, including the timed-out run.
There were no missing skill cells.

Of the 54 cells that launched the provider, controller-observed latency was
58,969 ms at p50, 204,336 ms at p95, and 300,011 ms at maximum, using the
harness's nearest-rank percentile rule. These values measure complete CLI model
calls, not graph-runner overhead. `summary.json` remains the authority for every
cell and dimension.

## Comparative status

AgentKit is source-pinned but has zero executed comparison cells in this
baseline. The current CLI has neither a trusted AgentKit runtime identity nor
an event adapter that can supply the same controller observations. All 66 cells
therefore declare `not-comparable` with reason
`trusted-observation-source-unavailable`, and no `agentkit` variant is emitted.

This is an explicit N/A decision, not an AgentKit quality or performance
result. It avoids presenting two coarse command launches as matched A/B
evidence when their observable contracts differ.

## Proof limits

This baseline can establish process outcomes, bounded lifecycle behavior,
controller-container path violations, and artifact facts that the controller
directly observes. It cannot yet establish complete provider routing or tool
trajectory, arbitrary host/remote non-mutation, provider token/context usage,
retry counts, or human-intervention counts. Those domains remain incomplete or
unsupported rather than being inferred from executor text.

The Codex command additionally uses the provider's `workspace-write` OS
sandbox. Sandbox conformance becomes independently mediated runtime evidence in
the later runtime-adapter phase; this baseline records the setting but does not
upgrade it into controller proof.

## Reproduction

Build the checkout at the pinned harness revision, then prepare a dedicated
temporary install root. The root must contain a vcskill install receipt and the
26 installed vcskill skills; its `.codex` directory must contain whatever local
Codex credential material is required. Do not use an ambient user home.

```sh
export BENCH_HOME="/absolute/path/to/dedicated-vcskill-benchmark-home"
export CODEX_HOME="$BENCH_HOME/.codex"
export VCSKILL_BEHAVIORAL_HOME="$BENCH_HOME"

caffeinate -dimsu node packages/cli/dist/index.js eval --suite \
  --runner '["codex","exec","-","--ephemeral","--ignore-user-config","--ignore-rules","--sandbox","workspace-write","--skip-git-repo-check","--model","gpt-5.4-mini"]' \
  --variant vcskill \
  --runtime-provider codex \
  --runtime-version 0.147.0 \
  --model gpt-5.4-mini \
  --skill-repeats 1 \
  --deep-repeats 1 \
  --concurrency 3 \
  --timeout-ms 300000
```

A non-zero exit is expected whenever the machine-readable release gate is
`fail` or `incomplete`; the JSON summary is still emitted. Persist that JSON
verbatim as `summary.json`. Do not persist provider stdout, stderr, prompts,
raw traces, run IDs, credentials, or disposable paths.

The frozen macOS capture used `caffeinate -dimsu` so idle sleep could not pause
provider calls or contaminate latency. Use the equivalent sleep-inhibition
mechanism when reproducing on another host and record any different policy.
