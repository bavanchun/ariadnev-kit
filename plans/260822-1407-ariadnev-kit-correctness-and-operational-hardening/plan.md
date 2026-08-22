---
title: "ariadnev kit correctness and operational hardening"
description: "Fix the broken cross-skill links and the validator blind spot that hides them, move skill dirs to an av- prefix via a receipt-driven heal, sign the update channel, harden the backup restore path, and retire the ported-skill lint exemption across the whole corpus."
status: pending
priority: P1
effort: "25-42d + 3h"
tags: [kit, cli, lint, security, quality]
created: 2026-08-22
---

# ariadnev kit correctness and operational hardening

## Overview

`ariadnev@1.1.0` passes 1234/1234 tests and `av validate` prints
`all checks passed`. Both statements are true and neither means the kit is
correct. An audit on 2026-08-22 found ~33 broken cross-skill links across four
distinct shapes, a validator that cannot see any of them by design, and a lint
exemption that makes 101 of 105 skills unmeasurable rather than merely lenient.

A four-lens red team then found that the first draft of this plan would have
made things worse: its migration design would have renamed 101 AgentKit
directories and 30 third-party directories in a shared root, and its
`ARIADNEV_BASE_URL` design would have turned one environment variable into
remote code execution. Both are corrected below. The corrections are recorded
rather than quietly applied, because the failure modes are instructive.

## Contract

**Outcome** — `av validate` is a true statement about the entire kit: every
cross-skill link resolves in installed coordinates, every skill and agent meets
the house authoring bar with no exemption, the update channel is authenticated
independently of its transport, and the mutating commands are safe to run
concurrently and scriptable as JSON.

**Constraints**
- CI stays green on `main` at every merge. No phase may leave `pnpm test` red.
- Every phase is independently revertable.
- **Never touch a path ariadnev does not own.** Ownership is proven by the
  receipt, never inferred from a directory listing. The shared skill roots are
  multi-tenant.
- ADR 0011 stands: upstream is a one-time fork, not tracked. Diffability against
  AgentKit is explicitly **not** a constraint on content edits.

**Non-goals**
- AgentKit's commercial-product surface: auth/licensing, analytics, GUI, HTTP
  dashboard/API, projects registry, sessions/activity, content-search.
- `av backups create`. AgentKit's `create` snapshots a database; ariadnev has
  none. Porting it would ship dead surface.
- **A directory-renaming migration for the prefix.** Dropped by decision — see
  "Corrections" below.
- The tier-2 eval baseline left open by plan `260816-1845` phase 4.
- `ariadnev-web`.

## Urgent: a live vulnerability this plan did not create

`install.sh:10,36-37` and `install.ps1:8,16` fetch the binary **and**
`checksums.txt` from `${ARIADNEV_BASE_URL:-https://ariadnev.com}`. The comment at
`install.sh:39` reads "verify sha256 (fail closed)" — it compares an attacker's
binary against the attacker's own checksums. This is the exact shape the red team
killed in this plan's draft `av update` design; nobody looked one directory up,
and an earlier draft of phase 5 even cited `install.sh:10` as a naming precedent
without noticing.

It is shipped and live today. The fix is one line per installer — pin the
checksums fetch to the hardcoded domain — and because the edge Worker serves
`install.sh` by reading it from the GitHub repo, **it deploys on merge with no
binary release**. That is **phase 0**, and it should ship before anything else here starts.

**Status: closed 2026-08-22, live.** Merged as PR #23 and confirmed against
production — the live installer now refuses a trojan served with its own matching
checksums.txt. Review turned up four more defects in the same code, all fixed and
recorded in the phase file.

## Corrections adopted from the red team

Four reviewers (security, failure-mode, assumption, scope) produced 19
evidence-backed findings; a post-review advisory pass added five more amendments.
Three changed the plan's architecture, not its estimates. Recorded so the
reasoning survives.

**1. No renaming migration.** The draft specified a migration that enumerated a
skill root's subdirectories and prefixed each one. Measured on the live machine:
`~/.agents/skills` holds **131 entries — 101 `ak-*`, 30 third-party, 0 `av-*`**.
That migration would have renamed AgentKit's entire install and 30 other tools'
skills. A canonical-name allowlist does not rescue it either: `excalidraw`,
`graphify` and `obsidian-second-brain-note` are simultaneously kit skill names
and third-party directories in that root. And `execute-migrations.ts:28`
`rmSync`s the destination before renaming, so a collision destroys data with
only the source backed up. Decisive fact: `~/.ariadnev/` contains only
`history.jsonl` and there are zero `av-*` dirs — **there is no global ariadnev
install to migrate.** Receipt-driven heal-on-install is now the sole mechanism.

**2. The update channel gets a signature.** `update-command.ts:239-241` fetches
the binary *and* `checksums.txt` from the same `${DOMAIN}`, and that file
performs no signature verification. Overriding the base URL would have moved
both sides of the comparison to the attacker's origin, making the "fail-closed"
checksum authenticate nothing — RCE via one env var, on a tool driven by agents
that run shell commands. A detached signature over `checksums.txt`, verified
against a compiled-in public key, is now a prerequisite for the override.

**3. The link checker needs a shape rule, not just a name lookup.** Resolving
cross-skill links by name with `av-` stripped makes `../cook/…` and
`../av-cook/…` indistinguishable. A reviewer ran the draft's own regexes: all 21
links resolve, so the gate would have been a no-op. Target-existence and
path-shape are now two separate rules.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Every cross-skill link resolves, and a gate keeps it that way | P1 |
| 2 | Skill dirs carry the `av-` prefix, with no orphan and no collateral | P1 |
| 3 | No lint exemption: all 105 skills and 16 agents meet the house bar | P1 |
| 4 | The update channel and the restore path are authenticated | P1 |
| 5 | Mutating commands are concurrency-safe and scriptable as JSON | P2 |

## Phases

| # | Phase | Depends on | Status |
|---|-------|------------|--------|
| 0 | [Installer checksum pin](./phase-00-installer-checksum-pin.md) | — | **Completed** (merged, live) |
| 1 | [Link integrity](./phase-01-link-integrity.md) | — | Pending |
| 2 | [Lint ratchet mechanism and ADR](./phase-02-lint-ratchet-mechanism-and-adr.md) | — | Pending |
| 3 | [Installer av- prefix and heal](./phase-03-installer-av-prefix-and-heal.md) | 1 | Pending |
| 4 | [Prefix release and rollout](./phase-04-prefix-release-and-rollout.md) | 3, **5 released** | Pending |
| 5 | [Security hardening and signed channel](./phase-05-security-hardening-and-signed-channel.md) | — | Pending |
| 6 | [JSON envelope and backups verbs](./phase-06-json-envelope-and-backups-verbs.md) | 5 | Pending |
| 7 | [Install lifecycle locking](./phase-07-install-lifecycle-locking.md) | 3, 6 | Pending |
| 8 | [Skill content burn-down](./phase-08-skill-content-burn-down.md) | 2, 3 | Pending |
| 9 | [Agent lint and close-out](./phase-09-agent-lint-and-close-out.md) | 8 | Pending |

**Execution order: 0 first and alone → 1, 2, 5 in parallel → release(5) → 3 → 4 → 6 → 7 → 8 → 9.**

Phase 0 closes a live vulnerability, depends on nothing, and deploys on merge
without a release. It should ship before anything else in this plan starts.

Phase 5 was split out of the original phase 5 and its security half must be
**released, not merely merged**, before phase 4's release. Two reasons. Phase 4's
rollback is `av update --to <prev>`; once signature verification ships, the binary
demands a `.sig` on the previous release's `checksums.txt`, so signing must
already be in the *previous* release or the rollback aborts. And the release that
deletes files from users' home directories should go out over an authenticated
channel with a rollback that has actually been executed.

Phase 6 is the feature half — JSON envelope and backups verbs. It carries no
urgency and is where schedule pressure should vent first. Phase 7 wraps the
action bodies phases 3 and 6 edit. Phase 8 depends on 3, not 4, so the 8-15 days
of content work can start once install semantics are settled in code rather than
waiting on the live rollout.

### Ordering hazard

The phase 1 checker must verify **path shape**, not only target existence. In
`kit/skills/` the source directory is `cook`; after phase 3 the installed
directory is `av-cook`. A checker that only asks "does skill `cook` have file
`x.md`" answers yes for every current link — including the six that name a
directory layout that has not existed since the rename, and the two that will
break the moment the prefix lands. Phase 1 therefore ships two rules: by-name
target existence, and a shape rule requiring `(../)+av-<slug>/`.

## Success Criteria

- [ ] `av validate` reports zero findings with **no** skill or agent taking an
      exemption; `kit/skills-lint-exempt.json` and `isPorted()` are deleted.
- [ ] `grep -rn 'kits/core/skills/' kit/` returns nothing.
- [ ] Every cross-skill path in the corpus matches `(../)+av-<slug>/…`, enforced.
- [ ] A brownfield e2e proves heal-on-install leaves zero unprefixed dirs, zero
      duplicates, a correct receipt, and survives a kill between delete and
      receipt write.
- [ ] Heal never removes a path outside the scope root, a path still claimed by
      an untouched provider record, or a file whose hash drifted.
- [ ] No code path renames a directory ariadnev does not own.
- [ ] `av update` verifies a detached signature over `checksums.txt` against a
      compiled-in key before trusting any hash.
- [ ] `backups restore` refuses an absolute or traversing path and validates the
      manifest against a schema.
- [ ] Every command supports `--json`; one envelope helper, extracted not invented.
- [ ] A second concurrent mutating command exits 3 without touching any file,
      including for codex's home-rooted writes.
- [ ] `ARIADNEV_BASE_URL=http://evil` fails closed against **all three** of
      `install.sh`, `install.ps1`, and `av update`.
- [ ] Phase 4's sandbox rollback succeeds **on the first attempt** — the proof
      that the phase-5-before-phase-4 sequencing worked.
- [ ] The heal backup still exists after three post-heal `av install` runs.
- [ ] `pnpm test` green after every phase.

## Scope honesty

Every figure below was re-measured directly against the live corpus. One red-team
"correction" was **rejected**: a reviewer reported 19 skills over 300 lines and 89
oversize reference files by running `find`, which recurses into
`kit/skills/document-skills/{pdf,pptx}/`. `loadKit` does **not** recurse
(`load-kit.ts:68-71`), so those nested files are never linted. The original
counts stand.

| Item | Measured | Note |
|---|---|---|
| Phase 7 content work | **65-118 hr** | 8-15 working days solo |
| — skills missing ≥1 required section | 101 | 84 Tier A / 10 Tier B / 7 Tier C |
| — SKILL.md >300 lines | **17** | 7 exceed the 400 ceiling |
| — descriptions >200 chars / missing trigger verb | 45 / 19 | folded into each skill's own PR |
| — linted reference files | 463 | 83 exceed the old 300-line cap |
| — reference files >800 lines | **6** | the new cap; ~3-6 hr of splitting |
| Phase 8 agent work | **3-5d** (draft said 1-2d) | 5 gated checks, not 2 |
| — agents >120 lines / no checklist / no example / desc >1200 | 9 / 8 / 7 / 9 | union is **all 16**; **no `references/` escape hatch** — deletion, not extraction |
| Broken cross-skill paths | **~33** (draft said 21) | 15 prefixed, 13 stale-root strings, 2 that break *because of* the prefix, plus `tech-graph`'s escaping path |
| Phase 5 `--json` surfaces | **10** (draft said ~7) | `query` and `telemetry` were missed |

**`REFERENCE_MAX_LINES` is raised 300 → 800** rather than splitting 83 files
(~42k lines) into ~189 fragments. This is a deliberate loosening inside a plan
about removing exemptions, and it is the only one. Justification from the
distribution: of **463** linted reference files, 380 are already under 300 and
only **6** exceed 800 — the tail is genuine outliers
(`preview/references/html-css-patterns.md` at 1717 lines, `html-slide-patterns.md`
at 1401, `mobile-development/references/mobile-debugging.md` at 1089). A 300-line
cap on progressive-disclosure detail files was mis-calibrated; 800 still bites on
the files that actually defeat progressive disclosure. The 6 over-cap files are
split in phase 7. It converts ~25-40 hr of fragment-shuffling into ~3-6 hr.

## Open questions

1. Does the cursor agent-as-skill-dir shim (`resolver.ts:87`) take the `av-`
   prefix? Phase 3 decides and records it. Now lower-stakes with no migration.
2. Does `test-provider` (`resolver.ts:127-137`) get prefixed? Phase 3.
3. Hash strategy for directory-shaped backup entries. Phase 5 decides before
   implementing `verify`.
4. Strip `metadata.origin: ported` once a skill clears the bar? Phase 2's ADR.
5. Does `ariadnev-web` consume any `av --json` output? One grep before phase 5
   pins `LEGACY_JSON_COMMANDS` — it is a permanent contract surface.

<!-- slug: ariadnev-kit-correctness-and-operational-hardening -->
