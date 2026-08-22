---
title: Planning the correctness and hardening work, and what the red team found in the plan
date: 2026-08-22
summary: "Audited ariadnev against AgentKit, planned the fixes, then had a four-lens red team demolish the plan — it would have bricked the maintainer's AgentKit install and shipped an RCE. Rewrote it. Then advisory review found the same RCE shape already live in install.sh."
---

# Planning the correctness and hardening work

## What happened

Started with a completeness question — how far is ariadnev from AgentKit — and it
turned into a plan, then into a demolition of that plan.

The audit itself was reassuring. 105 skills against AgentKit's 103, 101% of clean
shipped bytes, zero rebrand leakage, 14/14 hooks, a feature-identical statusline.
On the kit axis ariadnev is done. On the platform axis it is ~62%, and the missing
38% is almost entirely commercial-product surface — auth, analytics, GUI,
dashboard, registry. Nothing about quality.

What the audit *also* found was that `av validate` prints `all checks passed`
while ~33 cross-skill links are dead, because `reference-integrity.ts:15`
deliberately skips cross-skill paths. And that 101 of 105 skills take a lint
exemption that makes them unmeasurable rather than merely lenient — with
`kit.warnings` never read by any command, so the exemption is not
"downgraded and shown", it is write-only.

Then the plan. Then four hostile reviewers at Full verification tier.

## What the red team caught

Three findings each invalidated a phase's architecture, and I had verified none of
them before writing:

1. **The migration would have renamed 101 AgentKit directories.** The draft
   enumerated `~/.agents/skills` and prefixed every subdirectory. That root holds
   131 entries: 101 `ak-*`, 30 third-party, 0 `av-*`. It would have bricked the
   `ak` install the maintainer uses daily and hijacked 30 other tools' skills. A
   canonical-name allowlist doesn't rescue it either — `excalidraw`, `graphify`
   and `obsidian-second-brain-note` are simultaneously kit skill names and
   third-party dirs there. The decisive fact nobody had checked: there is no
   global ariadnev install at all, so the migration was solving a problem that
   did not exist while carrying enough power to destroy something that did.

2. **`ARIADNEV_BASE_URL` was remote code execution.** `update-command.ts:239-241`
   fetches the binary and `checksums.txt` from the same `${DOMAIN}`, with zero
   signature verification. Redirecting the base URL moves both sides of the
   comparison to the attacker's origin. I had written "checksum verification
   stays fail-closed against the overridden host" into a success criterion. It
   was false as designed.

3. **The link checker was a no-op.** A reviewer ran my own regexes against the
   corpus: all 21 target links resolved. Resolving by name with `av-` stripped
   makes `../cook/…` and `../av-cook/…` indistinguishable, so the gate could not
   express the defect it existed to catch. Worse, my step 6 instructed the author
   to rewrite six stale-root links into the *unprefixed* form — six new broken
   links, blessed green.

Two reviewers converged independently on #3, which is what made me stop patching
and rewrite instead.

## One finding I rejected

A reviewer reported 19 skills over 300 lines and 89 oversize reference files. They
ran `find`, which recurses into `kit/skills/document-skills/{pdf,pptx}/`.
`loadKit` does not recurse (`load-kit.ts:67-71`), so those are never linted. The
original counts stand — 17 and 83. I re-measured every figure myself rather than
propagating the correction, and caught one of my own errors doing it (a phase-2
success criterion said 8 files over the new cap; it is 6).

The instinct behind the rejected finding wasn't worthless, though: `install-plan.ts:79-92`
walks **recursively**, so those nested subtrees ship to users and run at runtime
while being permanently invisible to lint. Zero cross-skill links in them today; a
grep gate now keeps it that way.

## Then the advisory pass found the real one

`install.sh:10,36-37` — `BASE="${ARIADNEV_BASE_URL:-https://ariadnev.com}"`, and
both the binary and `checksums.txt` come from `$BASE`. The comment on line 39 says
"verify sha256 (fail closed)".

It is the exact vulnerability the red team killed in the draft, already shipped in
production. Four reviewers were pointed at `update-command.ts` and nobody looked
one directory up. An earlier draft of phase 5 even cited `install.sh:10` as a
*naming precedent* to follow.

One line per installer, and it deploys on merge because the edge Worker reads
`install.sh` from the repo.

## Lesson

Two, both about where review attention goes.

Reviewers find what they are pointed at. I scoped four lenses carefully at the
plan and got excellent results inside that boundary and nothing outside it — the
live vulnerability sat one directory above the file I named in every prompt. The
scoping that makes a review sharp is the same scoping that blinds it.

And: a gate that cannot express the defect is worse than no gate, because it
converts silence into a green checkmark. That was true of `av validate` before
this plan (the whole reason the plan exists) and it was true of the checker I
designed to fix it. The failure reproduced itself one level up, in the fix.

## Next steps

Plan at `plans/260822-1407-ariadnev-kit-correctness-and-operational-hardening/`,
9 phases, 25-42 days. Execution order 1, 2, 5 parallel → release(5) → 3 → 4 → 6 →
7 → 8 → 9. Phase 5 step 1 — the installer checksum pin — should not wait for the
rest of it.
