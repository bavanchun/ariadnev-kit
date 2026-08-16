---
title: Release ariadnev 1.1.0 and propagate it to the edge
date: 2026-08-16
summary: "Cut, published, and propagated 1.1.0; closed the evidence-backed parity plan with Phase 4 left deliberately unmet"
---

# Release ariadnev 1.1.0 and propagate it to the edge

## What happened

Closed out the evidence-backed parity plan by shipping it. PR #22 merged at
`16d7416`, the Changesets "Version Packages" PR bumped to 1.1.0 at `64100bb`,
`release.yml` cross-compiled the five binaries and held a draft on tag
`ariadnev@1.1.0`, and `finalize-release.yml` — dispatched from the tag's own ref,
which the workflow asserts — published it. The release object reports
`immutable: true`.

Web propagation ran entirely through the committed-input path in
`ariadnev-web`: `3f3dedc` pins the 1.1.0 docs bundle, `74ac40c` records the
qualification evidence, `f9e2db7` composes both immutable deployment inputs, and
`45b6504` commits the staging and production cutover records. Both environments
deployed via `deploy.yml`; nothing was touched by hand.

## What the release actually delivers

105 skills (from 103), including `av:av` and `av:plan-i18n` — neither takes the
ported-skill lint exemption. 89 orphaned reference files cleared, with
`av validate --strict` and a CI gate so a new one cannot land. Eval scenario
coverage went from 26 to 105 and is now derived from `kit/skills/` at runtime
rather than asserted in prose. `av update --to <version>` exists.

## Verified live, not assumed

- `ariadnev.com/version` → `1.1.0`; `?version=1.0.0` → `1.0.0`, so the pinned
  selector the downgrade path depends on survived the cutover.
- `docs.ariadnev.com` skill reference carries 105 entries including both new
  skills; `/en/stable/` resolves to 1.1.0.
- `probe-public-edge.mjs` healthy; the `edge-health` workflow green.
- The real round-trip: a sandbox 1.0.0 install upgraded to 1.1.0 with plain
  `av update`, then `av update --to 1.0.0` took it back. This was Phase 5's one
  open checkbox — it could not be closed before a newer release existed to
  downgrade *from*.

## Decision

Phase 4 (a tier-2 baseline against a real runner) shipped **skipped, with its
criterion left unchecked**. The blocker is structural rather than budgetary:
`createBehavioralLauncher` rewrites `HOME` and refuses the ambient user home, so
the runner only sees the kit installed into that sandbox — and `claude` cannot
authenticate under a rewritten `HOME` while `codex` only authenticates from a
`CODEX_HOME` carrying `auth.json`, which on this machine holds AgentKit rather
than ariadnev. Running the pilot anyway would have produced 100% environment-
caused failures, which is precisely the unclassified outcome that phase's own
risk section forbids. Rewording the criterion to something achieved would have
been worse than leaving it open, so it stays open.

## Worth remembering

Three frozen artifacts were legitimately invalidated by this work and each was
re-derived rather than re-stamped: the eval suite counts (now read from disk),
the context-retrieval benchmark (regenerated; decision and all eight gates
unchanged), and the install roster. The roster stayed an explicit hand-edited
list on purpose — deriving it from disk would defeat the inventory lock it
exists to be.

The production preflight reports `immutableReleases: false`. That is a read
limitation, not a finding: `GITHUB_TOKEN` gets 403 on that endpoint under every
grantable permission. Confirmed `true` out-of-band before publishing.

## Next steps

- Rotate `CLOUDFLARE_DEPLOY_TOKEN` and `CLOUDFLARE_WAF_TOKEN` before any deploy
  after 2026-08-31.
- Soak, then decommission the legacy `vcskill` Worker (302 → 301) — it is still
  the first-cutover rollback target and is frozen until that window closes.
- Wire the docs a11y harness into the gate.
- Phase 4 remains available if a credential path is ever authorized.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
