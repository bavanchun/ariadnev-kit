# Behavioral evaluation contracts

This directory owns the frozen inputs and machine contracts for vcskill's
behavioral benchmark. It does not change the existing static or opt-in LLM
judge tiers.

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
