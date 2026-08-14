# Local runner architecture brief

Design a local-first runner that can resume after process loss. It must keep an
append-only audit trail, require explicit approval before mutations, and avoid
duplicating external effects after uncertain failures. The same workflow should
eventually run through two provider adapters.

Constraints: Node 18+, offline core, JSON contracts, no graph database, no
distributed scheduler, and no visual editor. The design is not accepted yet;
compare a linear state machine, a graph IR, and a durable-workflow dependency.

Acceptance must name the chosen boundary, non-goals, safety invariants,
benchmark gates, rollback, and dependency-ordered implementation phases.
