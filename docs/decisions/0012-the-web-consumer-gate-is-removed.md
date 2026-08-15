# 0012 — The web-consumer gate is removed, and what would bring it back

- Status: accepted
- Date: 2026-08-15
- Supersedes the consumer binding described in 0002 and 0009

## Context

The release pipeline carried a gate that bound each release to a downstream
consumer. It pinned an exact commit of `bavanchun/ariadnev-web` plus digests of
that repo's contract files, checked the commit out in CI, ran an allowlisted
command inside it against the freshly built release assets, required the
resulting report to declare `status: pass`, and folded every one of those
digests into the release provenance attestation.

The intent was sound: prove a release is actually consumable downstream, not
merely that it compiles.

It never ran. Three facts, each verified before removal:

- `.github/release/web-consumer-lock.json` never existed. Only its schema did.
- `ariadnev-web` has no entry point that writes a report to the path the lock
  would name. There is no consumer contract for the gate to verify.
- None of the twelve releases cut to date carries an attestation asset at all.
  Every one ships exactly a checksums file and five binaries.

So the gate's verified branch had never executed, and its failure branch blocked
everything. `build-binaries.mjs` threw without the lock, which made even a local
build impossible.

## Decision

**Remove it, rather than make it conditional.**

Conditionalising would have kept a branch that has never run, testable only
through fixtures, standing guard over the release path — and it would have given
the attestation two shapes, in a schema whose entire value is that its fields
are reliably present.

The deciding argument is this repository's own rule for things it cannot verify.
An unverified `(provider, artifact)` cell is skipped and logged, never guessed.
Fail-closed is correct for a check that *can* pass. A check that cannot pass is
not fail-closed; it is a permanent outage wearing the costume of rigour.

What replaces it is smaller and real: `smoke-binary.mjs` runs the freshly built
host binary and proves it starts, loads its embedded kit, and answers. For a
tool with one user, the consumer is that user's machine.

`schemaVersion` on the release-artifact attestation moves to 2. Nothing published
carries version 1, so no chain breaks — but the bump is what keeps "this gate
never existed" from reading, later, as "this gate was quietly dropped".

## Consequences

The release path is build → smoke → attest → stage → upload, and it can run.

Provenance no longer makes any claim about downstream consumption. It still binds
the workflow, the generator, the product SHA, the previous stable source, and
every asset digest. The removed claim was never true of any artifact anyway.

The predecessor mechanism is untouched. It resembles the gate — an exact tag, an
exact SHA, digests — but it is independent, and over-deleting it was the main
hazard during removal.

The deleted design is preserved at tag `archive/web-consumer-gate`.

## Revisiting

The signal is concrete: the day a release breaks `ariadnev-web` and it is
discovered at usage time rather than at release time, or the day this project
starts hand-checking the web app against a release before tagging. Either means
the consumer concept was load-bearing after all.

If that happens, **rebuild the gate from that repository's real entry point.** Do
not restore the archived design. It was authored without a consumer to answer to,
so its eleven chained digests are a guess about a contract that did not exist —
and reviving a guess verbatim would reproduce the original error with more
confidence than it deserves.
