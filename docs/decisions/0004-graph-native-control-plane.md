# 0004: Graph-native local execution control plane

## Context

vcskill 0.10.0 distributes and adapts a high-quality kit, but its prose workflow
relationships are not executable authority. The behavioral baseline also shows
that command-level observation cannot prove routing, trajectory, or side-effect
safety. Growing the skill roster before fixing that control boundary would add
surface area without improving execution evidence.

## Decision

1. vcskill gains a small, versioned Graph IR for local workflow execution. JSON
   files under `kit/workflows/` are the authority; diagrams and prose are derived
   projections only.
2. V1 represents seven node types (skill, agent, tool, deterministic function,
   gate, human, terminal) and seven edge types (success, failure, conditional,
   retry, handoff, approval, cancel). It includes explicit state ownership,
   redaction, authority, proof, timeout, retry, handler, and resume-version
   contracts.
3. Provider and model configuration stays outside the graph. Runtime adapters
   bind provider-neutral handlers after compilation; a provider-specific graph
   fork is a design failure.
4. Workflow files are execution-only `KitWorkflow` assets. They do not extend
   `ArtifactType`, provider capability matrices, install plans, or receipt
   contents.
5. Graph input is untrusted. Parsing is strict and size-bounded, rejects unknown
   fields and duplicate keys/IDs, resolves state and edge references, and fails
   closed on unsupported versions or undeclared side-effect authority.
6. The first canonical workflows are read-only delivery, root-cause bugfix, and
   safe-change delivery. Static compilation, shadow conformance, event-sourced
   recovery, and runtime adapters remain separate proof layers.
7. Local files are the default backend. A graph database, semantic context graph,
   cloud scheduler, or visual editor is adopted only after a matched benchmark
   proves material outcome or safety gain over the simpler baseline.

## Consequences

- Workflow semantics become inspectable, lintable, resumable, and portable while
  existing provider installs remain unchanged.
- V1 intentionally cannot express arbitrary code, provider flags, prompt
  templates, distributed scheduling, or UI layout. New fields must be justified
  by an observed execution boundary rather than general workflow-language appeal.
- Resume compatibility is explicit: graph, skill-contract, policy, and evaluator
  versions are pinned in the IR and later checkpoints bind their compiled digest.
- Static validity is not behavioral proof. Promotion still requires shadow,
  failure-injection, cross-runtime, safety, and performance evidence.
- The broader skill expansion remains paused through this benchmark cycle; this
  decision changes execution architecture, not the accepted kit roster.

## Reversibility

The graph inventory is separate from installable artifacts and has no public run
command in this phase. Reverting the loader, parser, and workflow assets restores
the previous distribution behavior without migrating provider installations.
