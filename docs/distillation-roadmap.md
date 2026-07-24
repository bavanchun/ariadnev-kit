# Distillation Roadmap — AgentKit → vcskill

Single tracker of what is distilled, what is left, and what is rejected, so
future waves are picked from a list, not from memory. Baseline and scope are set
by [decision 0003](./decisions/0003-comprehensive-distillation-identity.md):
full 1:1 mirror of AgentKit (`ak-*`, 97 skills), delivered in waves.

## Legend

Status:

- `✓ distilled` — a `vc:` skill already exists for this `ak-*` source.
- `planned` — not yet distilled; the default for everything not distilled or rejected.
- `rejected` — runtime-incompatible with vcskill's provider-agnostic, markdown-first,
  single-binary target; reason given inline.

Tier: `1` dev-loop (the distilled set + `use-mcp`, `retro`, `watzup`) ·
`2` meta/authoring depth · `3` domain/media.

Coverage: 97 `ak-*` slugs, each appears exactly once across the category tables.
25 `✓ distilled`, 8 `rejected` (catalog) + 1 non-catalog (`agentwiki`, see note),
rest `planned`.

## core-loop

| ak source | status | target vc slug | tier | rationale |
|-----------|--------|----------------|------|-----------|
| ask | ✓ distilled | vc:ask | 1 | answer technical/architectural questions, design decisions |
| bootstrap | ✓ distilled | vc:bootstrap | 1 | scaffold new project research→design→impl |
| brainstorm | ✓ distilled | vc:brainstorm | 1 | unclear intent → accepted outcome, compare approaches |
| cook | ✓ distilled | vc:cook | 1 | implement known-scope features/plans/fixes |
| fix | ✓ distilled | vc:fix | 1 | route+repair bugs, errors, CI failures |
| test | ✓ distilled | vc:test | 1 | run unit/integration/e2e, coverage, QA reports |
| code-review | ✓ distilled | vc:code-review | 1 | evidence-based diff/PR/commit/codebase review |
| ship | ✓ distilled | vc:ship | 1 | branch→test→review→commit→push→PR pipeline |
| review-pr | ✓ distilled | vc:review-pr | 1 | GitHub PR review, optional fix/reply/merge |
| scout | ✓ distilled | vc:scout | 1 | fast native codebase orientation, file discovery |
| scenario | ✓ distilled | vc:scenario | 1 | expand requirements into edge cases across 12 dims |
| predict | ✓ distilled | vc:predict | 1 | 5-persona pre-impl debate on risky changes |
| problem-solving | ✓ distilled | vc:problem-solving | 1 | structured reframing when stuck |
| sequential-thinking | ✓ distilled | vc:sequential-thinking | 1 | step-wise reasoning with revision |
| plan | ✓ distilled | vc:plan | 1 | phased implementation/architecture roadmaps |
| git | ✓ distilled | vc:git (forked) | 1 | conventional commits, PRs; forked to personal vchun-git |
| worktree | ✓ distilled | vc:worktree | 1 | isolated git worktrees, stale cleanup, audits |
| handoff | ✓ distilled | vc:handoff | 1 | concise redacted conversation handoff |
| research | ✓ distilled | vc:research | 1 | deep pre-impl technical research |
| debug | planned | — | 2 | root-cause before fix; native-test candidate |
| autoresearch | planned | — | 2 | bounded goal-directed iteration router |
| orchestrate | planned | — | 2 | multi-runtime/subagent routing with review gates |
| issue-to-plan | planned | — | 2 | GitHub issue → audited validated plan |
| vibe | planned | — | 2 | full intake→plan→impl→PR pipeline orchestrator |

## meta/authoring

| ak source | status | target vc slug | tier | rationale |
|-----------|--------|----------------|------|-----------|
| skill-creator | ✓ distilled | vc:skill-creator | 1 | create/update Claude skills, metadata, packaging |
| journal | ✓ distilled | vc:journal | 1 | chronological technical session journals |
| project-management | ✓ distilled | vc:pm | 1 | progress tracking, plan status, cross-session continuity |
| retro | planned | — | 1 | git-history sprint retrospectives |
| watzup | planned | — | 1 | git-derived in-flight status + ranked next steps |
| use-mcp | planned | — | 1 | discover/execute MCP tools deterministically |
| find-skills | planned | — | 2 | discover and install agent skills |
| agentize | planned | — | 2 | expose existing code as reusable CLI/MCP tool |
| mcp-builder | planned | — | 2 | build MCP servers and tool surfaces |
| context-engineering | planned | — | 2 | context budget, memory, agent architecture |
| fable-thinking | planned | — | 2 | Fable-grade evidence-first reasoning protocol |
| advise | planned | — | 2 | interview-driven advisory reframing |
| folder-context | planned | — | 2 | subfolder CLAUDE.md/AGENTS.md conventions |
| project-organization | planned | — | 2 | file/dir layout and output-path decisions |
| team | planned | — | 2 | multi-session agent-team orchestration |
| agentkit | rejected | — | 2 | AgentKit's own task-router; vcskill routes via its rules files, not a skill |
| help | rejected | — | 2 | AgentKit help index; vcskill has its own help surface |
| plans-kanban | rejected | — | 2 | opens AgentKit's CLI config UI (AgentKit-specific runtime) |
| coding-level | rejected | — | 2 | AgentKit-internal meta |
| common | rejected | — | 2 | AgentKit-internal shared helper, not a user skill |
| loop | rejected | — | 2 | harness-native recurring-task scheduler, not a portable skill |
| codex-goal | rejected | — | 2 | Codex-runtime-native `/goal` guidance; not a vcskill target |

## frontend

| ak source | status | target vc slug | tier | rationale |
|-----------|--------|----------------|------|-----------|
| frontend-design | planned | — | 3 | polished UI from designs/screenshots/video |
| frontend-development | planned | — | 3 | React/TypeScript modern patterns |
| ui-styling | planned | — | 3 | shadcn/Radix/Tailwind component styling |
| ui-ux-pro-max | planned | — | 3 | cross-framework UX/design-system intelligence |
| web-design-guidelines | planned | — | 3 | UI a11y/UX guideline review |
| react-best-practices | planned | — | 3 | React/Next.js perf and rendering patterns |
| web-frameworks | planned | — | 3 | Next.js RSC/SSR/ISR, Turborepo |
| tanstack | planned | — | 3 | TanStack Start/Form/AI |
| stitch | planned | — | 3 | Google Stitch AI UI gen → code |
| threejs | planned | — | 3 | 3D WebGL/WebGPU experiences |
| shader | planned | — | 3 | GLSL procedural/generative graphics |

## backend

| ak source | status | target vc slug | tier | rationale |
|-----------|--------|----------------|------|-----------|
| backend-development | planned | — | 3 | Node/Python/Go REST/GraphQL/gRPC APIs |
| better-auth | planned | — | 3 | Better Auth TS authn (OAuth, MFA, RBAC) |
| payment-integration | planned | — | 3 | SePay/Polar/Stripe checkout, webhooks, subs |
| shopify | planned | — | 3 | Shopify apps, themes, extensions, billing |
| google-adk-python | planned | — | 3 | Google ADK agents, A2A, Vertex deployment |

## data

| ak source | status | target vc slug | tier | rationale |
|-----------|--------|----------------|------|-----------|
| databases | planned | — | 3 | schema/query design MongoDB + Postgres |
| graphify | planned | — | 3 | queryable knowledge graphs from code/docs |
| gkg | planned | — | 3 | semantic code navigation, impact analysis |
| repomix | planned | — | 2 | pack repos into AI-friendly context/audit files |

## devops/deploy

| ak source | status | target vc slug | tier | rationale |
|-----------|--------|----------------|------|-----------|
| deploy | planned | — | 3 | multi-platform deploy with auto-detection |
| devops | planned | — | 3 | Cloudflare/Docker/GCP/K8s, CI/CD, GitOps |

## mobile

| ak source | status | target vc slug | tier | rationale |
|-----------|--------|----------------|------|-----------|
| mobile-development | planned | — | 3 | RN/Flutter/Swift/Kotlin iOS+Android apps |

## security/intel

| ak source | status | target vc slug | tier | rationale |
|-----------|--------|----------------|------|-----------|
| security-scan | ✓ distilled | vc:security-scan | 1 | secrets/deps/OWASP scan |
| security | planned | — | 2 | STRIDE+OWASP audit with red-team loop + auto-fix |
| cti-expert | planned | — | 3 | OSINT/threat-intel exposure reports |

## media/content

| ak source | status | target vc slug | tier | rationale |
|-----------|--------|----------------|------|-----------|
| ai-artist | planned | — | 3 | Nano Banana mockups/brand visuals/concept art |
| ai-multimodal | planned | — | 3 | vision/OCR/transcription/multimodal gen |
| media-processing | planned | — | 3 | FFmpeg/ImageMagick/RMBG batch media |
| remotion | planned | — | 3 | programmatic React video |
| html-video | planned | — | 3 | HTML/CSS/JS → local MP4 render |
| design | planned | — | 3 | brand identity, logos, posters, tokens |
| copywriting | planned | — | 3 | conversion copy, headlines, emails, style transfer |

## docs/publishing

| ak source | status | target vc slug | tier | rationale |
|-----------|--------|----------------|------|-----------|
| docs | ✓ distilled | vc:docs | 1 | create/refresh/summarize/audit project docs |
| docs-seeker | ✓ distilled | vc:docs-seeker | 1 | llms.txt library/framework docs search |
| llms | planned | — | 3 | generate llms.txt indexes |
| mintlify | planned | — | 3 | Mintlify docs sites (docs.json, MDX) |
| markdown-novel-viewer | planned | — | 3 | calm book-like markdown reader |
| mermaidjs-v11 | planned | — | 3 | inline Mermaid v11 diagrams |
| excalidraw | planned | — | 3 | editable Excalidraw diagrams + repo auto-map |
| tech-graph | planned | — | 3 | publish-grade SVG/PNG technical diagrams |
| preview | planned | — | 2 | file previews, slides, visual explanations |
| show-off | planned | — | 3 | self-contained HTML showcase pages |
| document-skills | planned | — | 3 | Office docx/pdf/pptx/xlsx read/create/edit |
| interview-docs | planned | — | 2 | interview → durable project documents |

## browser/automation

| ak source | status | target vc slug | tier | rationale |
|-----------|--------|----------------|------|-----------|
| agent-browser | planned | — | 3 | agent-browser CLI automation, snapshots, scraping |
| chrome-profile | planned | — | 3 | real Chrome profile via Chrome DevTools MCP |
| web-testing | planned | — | 3 | Playwright/Vitest/k6 e2e/load/visual/a11y |
| xia | planned | — | 3 | port/adapt a feature from another repo |

## misc

| ak source | status | target vc slug | tier | rationale |
|-----------|--------|----------------|------|-----------|
| research-prompt | planned | — | 2 | draft a self-contained research brief for handoff |
| deep-swe | rejected | — | 3 | costed external benchmark via Pier/OpenRouter; out of a local dev kit's scope |

> Note — `agentwiki` (installed unprefixed, not an `ak-*` catalog slug): `rejected`,
> tier 3 — bound to the agentwiki.cc hosted platform/CLI. Listed for completeness;
> not counted among the 97 `ak-*` rows above.

## Wave log

### Wave 0 — foundation

- Decision [0003](./decisions/0003-comprehensive-distillation-identity.md): baseline
  = AgentKit, scope = full 1:1 mirror in waves.
- This roadmap: single source of distilled / planned / rejected.
- Description-collision recalibration: justified-similar allowlist + `metadata.category`
  taxonomy (not looser thresholds), for overlapping domain vocabulary at scale.

### Wave 1 — dev-loop (5 skills)

Distilled the remaining Tier-1 delivery loop on top of the earlier 20:
`code-review → vc:code-review`, `test → vc:test`, `ship → vc:ship`,
`review-pr → vc:review-pr`, `handoff → vc:handoff`. Brings the distilled total to 25.

Also note: `vc:obsidian-second-brain-note` is a vc-original personal skill with **no**
`ak-*` source — it is not part of the AgentKit mirror and has no row above.

### Next candidates

Tier-1 remainder (`use-mcp`, `retro`, `watzup`), then Tier-2 meta depth
(`debug`, `find-skills`, `agentize`, `mcp-builder`, `context-engineering`, …).
