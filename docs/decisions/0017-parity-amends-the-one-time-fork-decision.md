# 0017. Behavioral parity amends the one-time-fork decision

Date: 2026-08-28
Status: Accepted. Amends
[0011](./0011-upstream-is-a-one-time-fork.md).

## Context

ADR 0011 decided that the copy taken from upstream is final: no upstream ref is
recorded, none should be added, and *"improvements made upstream after 2.12.0 do
not arrive"*. It weighed three postures and chose the one that costs nothing
ongoing, on the explicit grounds that this is a private tool with one maintainer
and no external users.

On 2026-08-28 the maintainer asked for behavioral parity with upstream at a named
version, 2.14.0. That request touches 0011 directly, and it would be dishonest to
act on it while leaving 0011 reading as though nothing had changed. It would be
equally dishonest to declare 0011 superseded, because most of it still holds.

0011 itself anticipated something like this. Its revisiting clause says the
answer to new upstream content *"is still not 'turn on re-sync'"* — it is to port
the specific wanted content by hand. This amendment stays inside that clause.

## Decision

**ADR 0011's core decision stands: ariadnev does not track upstream. This
amendment records that a named-version behavioral parity target now exists, and
that it is pursued by reimplementation rather than by synchronisation.**

What does **not** change:

- No upstream ref is recorded, and none is added. There is no *CLI* source to
  record a ref against: the upstream binary is a closed Mach-O arm64 executable.
  Two honest qualifications. Upstream *skill content* is readable on disk and one
  phase imports a tree of it — that is ADR 0008's ordinary by-hand port, not a
  sync. And `parity-manifest.json`, once committed, is a behavioral snapshot
  pinned to one version — the nearest thing to a recorded ref this repo will
  hold. It feeds tests, never a merge, so the sync path 0011 declined stays
  unbuilt and unavailable.
- No re-sync mechanism is built. The `metadata.origin` markers keep the narrowed
  meaning 0011 gave them: provenance, not the input to a synchronisation
  mechanism.
- The corpus is still free to drift, and a rewritten ported file still loses its
  marker per ADR 0008's revisiting clause.

What **does** change:

- Diffability against upstream was *"explicitly not a constraint"* under 0011.
  There is now a constraint, but it is a **behavioral** one, not a textual one:
  observable command behavior at 2.14.0, as defined in
  [0016](./0016-what-parity-with-upstream-means.md).
- The method is **cleanroom behavioral reimplementation against a live oracle**.
  The upstream CLI is installed; its `--help` output and `--json` envelopes are
  observable and are captured into the plan as contracts before any test is
  written. This is 0011's "port that content by hand" applied to behavior instead
  of files.
- 0011's premise still holds in the sense that matters: no third party depends on
  ariadnev's interfaces, so no compatibility contract is owed outward, and the
  low-ceremony posture stays correct. It should not be read as "nobody runs
  this" — the installer RCE closed in `260822-1407` phase 0 was live on real
  installs, which is why 1.3.0 waits for the signed channel. Parity is a product
  decision by the maintainer, not a new obligation to anyone outside.

## Consequences

The cost 0011 accepted — upstream improvements do not arrive — is now paid down
once, deliberately, at one named version, by rewriting behavior rather than by
copying code. It does not become a standing obligation. Upstream's next release
creates no work and no drift to reconcile.

Because the oracle is a binary rather than a source tree, every parity claim has
to rest on an observation someone actually made. That is a stricter evidentiary
bar than diffing would have imposed, not a looser one, and it is the reason the
plan requires an oracle-capture step per phase.

The brand-drift gate keeps upstream identifiers out of the tree, and this
amendment does not soften it. Reimplementing observable behavior never requires
carrying upstream's names into the source; where the plan's tooling has to invoke
the upstream binary, phase 1 owes a decision on how that satisfies the gate.

## Revisiting

If a second named-version parity target is ever requested, that is the signal
0011's revisiting clause was really pointing at: a repeated, mechanical need. At
that point the question of a real sync path becomes worth asking from a concrete
history rather than a hypothetical one. One parity target is a port. Three would
be an unbuilt pipeline.
