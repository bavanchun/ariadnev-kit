# 0005: Adopt a bounded deterministic artifact graph

## Context

The execution control plane needs reliable local context retrieval, but decision
0004 explicitly requires graph scope to earn its complexity against a simpler
baseline. The benchmark therefore froze 26 public kit, workflow, scenario, and
architecture artifacts plus 13 direct and relationship queries. Both candidates
received identical inputs, labels, required-path tasks, top-k, seed, and
cold/warm cache policy.

The baseline is a dependency-free lexical metadata index, not an intentionally
weak raw substring search. The candidate retains that index and adds only
relationships already asserted by source artifacts: workflow skill/agent
handlers, scenario skill subjects, `vc:*` references, and relative Markdown
links.

## Decision

Adopt the deterministic artifact relationship layer as a local context index.
Keep the lexical metadata index as its fallback and do not add a graph database,
embedding provider, vector store, semantic graph, temporal memory, or automatic
provider-context injection.

The checked [machine report](../../evals/reports/context-graph-benchmark.json)
records the deciding evidence on the frozen corpus:

- retrieval quality increased from 0.6073 to 0.8750 (+26.7656 points);
- required-path task success increased from 61.54% to 100% (+38.4615 points);
- mean returned context tokens did not increase;
- candidate query p95 stayed below 1 ms cold and warm in the recorded run, far
  below the 500 ms gate;
- provenance, refresh, deletion, and private-artifact exclusion all passed;
- the graph added 65 deterministic edges, 6,240 estimated index bytes, and no
  external dependency.

The semantic/temporal prototype was not run because the smallest candidate
already cleared the material-gain gate. Provider variance is not applicable to
this benchmark: retrieval and required-path evaluation are deterministic and
local, with no model call.

## Consequences

- Relational queries can recover the contracts referenced by workflows and
  golden scenarios without copying those relationships into query-specific
  metadata.
- Every result retains a repository-relative source path and SHA-256 content
  digest. Refresh rebuilds the small in-memory index, purges deleted artifacts,
  and excludes private inputs before relationship discovery.
- Structured workflow/scenario artifacts fail closed when malformed; frozen
  manifests reject unsafe, duplicate, missing, symlinked, or oversized files.
- This is an evidence-backed retrieval primitive, not authorization to grow a
  general knowledge platform. A semantic or temporal layer needs a new matched
  benchmark plus explicit retention, export, privacy, and complete-purge design.

## Reversibility

Remove `artifact-index.ts` and instantiate the retained lexical metadata index
against the same corpus/query contract. No stored database, migration, external
service, provider installation, or public CLI contract must be unwound.
