# Behavioral evaluation contracts

This directory owns the frozen inputs and machine contracts for ariadnev's
behavioral benchmark. Tier 2 complements the existing static and opt-in LLM
judge tiers without changing their semantics.

## Running Tier 2

Run from a ariadnev source checkout after `pnpm build`. The runner is a strict
JSON argv array, is spawned directly without a shell, receives only the case
prompt on stdin, and starts in a fresh copied fixture:

```sh
ariadnev eval --suite \
  --runner '["agent-command","arg-1"]' \
  --runtime-provider provider-id \
  --runtime-version exact-version \
  --model exact-model
```

`--skill-repeats` defaults to three and `--deep-repeats` to one. Reduce a
repeat count only when the measured domain is unavailable (for example,
routing variance cannot be measured without independently mediated routing
events), and record that limitation in the baseline environment manifest.
Phase 2 exposes no capability override: `network.http`, `external.github`, and
other unmediated capabilities remain explicit `unsupported`/N/A and the runner
is not called. A later trusted adapter may register independently probed
capabilities; executor or CLI claims cannot do so.

The child process receives an explicit bootstrap environment allowlist rather
than the CLI's ambient environment. `HOME` and `USERPROFILE` point at the
disposable fixture. For a Codex runtime only `CODEX_HOME` may additionally pass
through so the provider can use an isolated credential/config directory;
`GH_TOKEN`, API-key variables, `NODE_OPTIONS`, and other ambient values are not
inherited. Use a dedicated temporary `CODEX_HOME` for benchmark capture.

By default, the child `HOME` is the disposable fixture. A benchmark that needs
installed provider skills may set `ARIADNEV_BEHAVIORAL_HOME` to a dedicated
absolute home created by `ariadnev install`. The launcher requires its
`.ariadnev/receipt.json` marker and rejects the ambient user home. Reports retain
only `isolated-ariadnev-install` or `fixture`, never the path. For Codex, point
`CODEX_HOME` inside the same dedicated home.

The command emits one allowlisted JSON document. It exits non-zero when Tier 1
fails, a hard release floor fails, or trusted evidence remains incomplete.
Provider stdout is transient evaluator input and has no report field. Timeout,
caller cancellation, missing executable, process crash, malformed output, and
fixture path violation remain separate failure classes.

Workspace observation uses one non-recursive watcher per existing fixture
directory and attaches watchers to newly observed directories. This avoids a
platform-specific recursive-watch dependency while retaining transient
write/delete evidence. If the host filesystem cannot provide watchers, the
action domain fails closed as `incomplete` with
`actions.path-watch-unavailable`.

The fixture path guard covers the controller-owned disposable container:
`workspace.write` is inside `workspace/`, while `workspace.unscoped-write` is a
sibling path inside that container. Arbitrary host paths and remote side
effects are represented by `external.*` actions. Phase 2 has no trusted event
source for those actions, so affected safety dimensions remain `incomplete`
and cannot pass the release gate. The benchmark runner must additionally use
its runtime's OS sandbox (the pinned Codex baseline uses `workspace-write`).
Provider-enforced sandbox conformance becomes controller evidence in Phase 7.

## Contract and trust boundaries

- `schema/scenario.schema.json` is the portable draft-2020-12 contract. Case
  IDs, artifact IDs, routing relations, and trajectory relations are object
  keys. A duplicate-aware JSON boundary rejects repeated decoded keys before
  `JSON.parse`, including escaped-equivalent keys; the JSON Schema and strict
  Zod parser then enforce the same relation-map shape.
- `scenarios/skills/` covers every shipped skill with a positive trigger and a
  nearest-negative route. `scenarios/golden/` contains deep workflow and kit
  tasks. Expected evidence, policies, budgets, and capability requirements
  remain controller-only.
- An executor receives only the selected prompt and a randomized disposable
  workspace path. It does not receive scenario, case, fixture, skill,
  vocabulary, expectation, or budget identifiers.
- Executor output is transient and untrusted. The controller derives lifecycle
  status and wall latency. Only branded harness/runtime observations,
  vocabulary-bound evaluator attestations, and verified artifact snapshots can
  enter a run envelope.
- A controller-created run context has a public random ID and a private identity.
  Execution, capability preflight, every observation and metric, attestations,
  and artifact proofs must belong to that exact context. Cross-run replay and
  duplicate criterion/subject attestations fail closed.
- `vocabulary/evidence-v1.json` fixes the producer, proof class, and criterion
  for every outcome-evidence ID, plus an explicit capability map (empty for
  local evidence). Artifact evidence is bound to the exact artifact digest it
  evaluated, and failure takes precedence over incomplete, pass, or missing.

Validation is not provenance. A well-formed executor claim is still ignored
unless an independent controller-side observer or verifier attests it.

## Frozen fixtures

`fixtures/catalog.json` maps every fixture ID to a synthetic corpus and pins its
SHA-256 tree digest. Materialization copies into a fresh randomized staging
directory, verifies the copied tree, atomically promotes it to `workspace`, and
only then initializes Git when requested. Git fixtures receive a clean `main`
baseline commit under an isolated environment with empty config, template, and
hooks directories. The corpus digest is verified again after Git initialization;
`.git` metadata is excluded from that digest.

Symlinks, empty corpora, path escapes, source drift, post-copy drift, and
overlapping destinations fail closed. Some bug and recovery corpora contain an
intentional failing regression because reproducing and repairing that failure
is the task. Never execute against the frozen source.

Capability preflight unions case-level operational requirements with the
capability maps of every required evidence criterion. For example,
`external.github` and `network.http` are not faked by local fixtures. The
controller records the sorted required and missing sets; if any are missing it
does not call the executor or verifier and scores the cell `unsupported`/N/A.
An executor-shaped `unsupported` claim remains untrusted output and cannot turn
a failure into N/A.

## Privacy, completeness, and artifact proof

Persisted envelopes are newly constructed from checked-in registries, pinned
controller configuration, closed enums, digests, numeric measurements, and
attestations. Raw prompts, transcripts, reasoning, tool arguments/results,
absolute paths, credentials, executor usage claims, and provider payloads have
no serialization path. Token-shape checks are defense in depth, not the privacy
boundary; structural exclusion is the boundary.

Negative assertions require complete trusted observation. An empty or partial
action stream cannot prove safety, and partial routing or trajectory streams
cannot prove forbidden behavior was absent. Until the Phase 2 mediated runtime
provides those observations, the affected dimensions remain `incomplete`.

`proveArtifactFile` opens one regular file inside the disposable workspace,
hashes and reads it once through the same descriptor, and runs the configured
semantic verifier over immutable canonical base64 for that exact byte snapshot.
The envelope retains only ID, kind, digest, byte count, run binding, and the
vocabulary-bound attestation. File existence alone never passes artifact
correctness.

Latency, tokens, context size, retries, and human interventions remain separate
dimensions. Missing trusted measurements are incomplete, absent budgets are
unscored, and known outcome, artifact, routing, trajectory, budget, or safety
failures fail the run. Safety is never averaged away.

Phase 1 does not claim hostile in-process executor isolation, complete runtime
telemetry, or protection against prompt/fixture fingerprinting. Process/tool
mediation and complete runtime observations begin in Phase 2; held-out fixture
variants are benchmark-governance work rather than an envelope feature.
