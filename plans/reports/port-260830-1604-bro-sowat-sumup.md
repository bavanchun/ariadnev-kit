# Port report: bro, sowat, sumup

Branch: `worktree-agent-a59962a2305936160`. Sources: the installed upstream
output at `.claude/skills/ak-{bro,sowat,sumup}/` (read-only). Targets:
`kit/skills/{bro,sowat,sumup}/`.

All three sources are single `SKILL.md` files — no `references/`, `scripts/`,
or `assets/` — and none of them invokes the upstream CLI, so no command mapping
was needed and nothing was dropped.

## Adaptations applied to every skill

| Source | Kit | Why |
|---|---|---|
| `name: ak:<slug>` | `name: av:<slug>` | installed coordinate |
| `metadata.author: agentkit` | `metadata.origin: ported` + `metadata.author: upstream` | the provenance form 95 ported skills use (`ask`, `retro`, `watzup`) |
| `## Output Shape` (sowat, sumup) | `## Output format` | exact heading required by `skill-lint.ts` |
| absent | `## Output format` (bro), `## Quality gates`, `## Workflow position` | required sections; the bar is the `ask`/`watzup` register |
| absent | `Proof/risk: N/A — <reason>` under Output format | authoring-spec rule 5 for analysis-only skills |
| `## Workflow`, `## Safety` | kept verbatim | upstream workflow steps unchanged |

## Per skill

| Skill | Files copied | Rewritten | Dropped | SKILL.md lines | description chars | `av:` links (all verified via `ls kit/skills/<slug>`) |
|---|---|---|---|---|---|---|
| bro | SKILL.md | description `ak:bro` → `av:bro`; added Output format, Quality gates (5), Workflow position | none | 66 | 169 | ask, code-review, sumup, sowat, handoff, bro (self) |
| sowat | SKILL.md | `## Output Shape` → `## Output format`; added Quality gates (5), Workflow position | none | 69 | 171 | cook, fix, sumup, plan, brainstorm, github, watzup, predict |
| sumup | SKILL.md | `## Output Shape` → `## Output format`; added Quality gates (6), Workflow position | none | 79 | 179 | cook, fix, sowat, journal, ship, watzup, handoff, mermaidjs-v11 |

## Verification

| Check | Command | Result |
|---|---|---|
| SKILL.md ≤ 300 lines | `wc -l` | 66 / 69 / 79 |
| references ≤ 800 lines | n/a | no references shipped |
| description 20–200 chars with trigger verb | `awk length` on the `description:` line | 169 / 171 / 179, each contains "Use" |
| no upstream brand or `ak` CLI strings | `rg 'AgentKit\|agentkit\|ak-\|ak:\|\bak\b' kit/skills/{bro,sowat,sumup}` | no matches |
| no bare `av <sub>` invocations for the invocation lint | `rg '(^\|[^\w:/.-])(av\|ariadnev)[ \t]'` | no matches |
| every `av:<slug>` resolves | `rg -o 'av:[a-z][a-z0-9-]*' \| sort -u` then `ls -d kit/skills/<slug>` | 16 slugs, all present |
| description collisions | Jaccard with the same tokenizer/stopwords as `description-collision.ts` against all 105 kit descriptions | max 0.120 (`sumup`↔`context-engineering`); warn band starts at 0.4 |
| `kit/collision-allowlist.json`, `kit/skills-pending-port.json` | untouched | — |
| `av validate --strict` | run from worktree root | "105 skills … all checks passed, 131 warnings" — it lints the embedded kit, not this tree, so it is advisory only |

Not run, per the brief: `pnpm test`, `vitest`, `pnpm build`, `pnpm install`.
`kit-embedded.generated.ts` not touched.

## Unresolved questions

1. `docs/av-skill-authoring-spec.md` line 226 says "All four provenance fields
   are strings and match the pinned source; original skills use the all-`"none"`
   sentinel". No kit skill carries a four-field form; 95 use
   `origin/author/version` and `skill-lint.ts` enforces only that `metadata`
   keys are allowed. I followed the majority form. The checklist line looks
   stale and may deserve reconciling.
2. `sowat` step 2 ("connect related issues") does not say where issues come
   from. I left the step verbatim and routed GitHub issue work through
   `av:github` in Workflow position only, so the read/mutate boundary stays
   with the skill that owns `gh`. If the coordinator wants an explicit "read
   issues read-only via `av:github`" step, it is a one-line addition.
3. The real lint gate (`kit-fixtures.test.ts`) has not been run against this
   tree; the mechanical checks above reproduce its rules but are not the gate.
