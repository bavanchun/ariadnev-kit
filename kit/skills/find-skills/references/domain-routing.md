# ariadnev Domain Routing

Use this file only when choosing between installed ariadnev skills. If the user
asks to discover or install external skills, return to `../SKILL.md` and use the
Skills CLI flow.

## Routing Rules

- If the user names a skill, use that skill.
- Pick one primary skill per distinct intent. Mention secondary skills only as
  follow-up helpers.
- If the task needs a multi-step sequence, read
  `../../av-cook/references/workflow-routing.md` after choosing the primary skill.
- If two skills overlap, prefer the more specific domain skill over a generic
  workflow skill.

## Frontend and UI

| User intent | Primary skill |
|---|---|
| Replicate a mockup, screenshot, or video | `/av:frontend-design` |
| Build React or TypeScript components | `/av:frontend-development` |
| Style with Tailwind or shadcn/ui | `/av:ui-styling` |
| Choose color, typography, layout, or design system | `/av:ui-ux-pro-max` |
| Audit UI accessibility or UX | `/av:web-design-guidelines` |
| Apply React or Next.js performance patterns | `/av:react-best-practices` |
| Generate UI designs with Stitch | `/av:stitch` |
| Build 3D, WebGL, or Three.js scenes | `/av:threejs` |
| Write shaders or procedural graphics | `/av:shader` |

## Codebase Understanding

| User intent | Primary skill |
|---|---|
| Locate files or understand code quickly | `/av:scout` |
| Pack a repository for LLM use | `/av:repomix` |
| Semantic go-to-definition or find-usages | `/av:gkg` |
| Build a queryable knowledge graph | `/av:graphify` |

## Backend, Data, and Auth

| User intent | Primary skill |
|---|---|
| Build REST, GraphQL, or backend services | `/av:backend-development` |
| Add auth, OAuth, sessions, or passkeys | `/av:better-auth` |
| Design schemas or write SQL/NoSQL queries | `/av:databases` |
| Integrate Stripe, Polar, Paddle, or SePay | `/av:payment-integration` |

## Infrastructure and Security

| User intent | Primary skill |
|---|---|
| Deploy to hosted platforms | `/av:deploy` |
| Docker, Kubernetes, CI/CD, or cloud ops | `/av:devops` |
| STRIDE/OWASP audit with remediation | `/av:security` |
| Secret, dependency, or vulnerability scan | `/av:security-scan` |
| OSINT or cyber threat intelligence | `/av:cti-expert` |

## AI, MCP, and Browser Automation

| User intent | Primary skill |
|---|---|
| Context, memory, or agent architecture | `/av:context-engineering` |
| Generate `llms.txt` | `/av:llms` |
| Build Google ADK agents | `/av:google-adk-python` |
| Build MCP servers | `/av:mcp-builder` |
| Convert code into CLI/MCP surface | `/av:agentize` |
| Discover or execute MCP tools | `/av:use-mcp` |
| Test generic browser workflows | `/av:agent-browser` |
| Use the user's real Chrome profile | `/av:chrome-profile` |

## Testing, Docs, and Media

| User intent | Primary skill |
|---|---|
| Run tests, coverage, or TDD gates | `/av:test` |
| Playwright, Vitest, k6, visual or a11y tests | `/av:web-testing` |
| Project docs init/update/summarize | `/av:docs` |
| Library/framework docs lookup | `/av:docs-seeker` |
| Visual explanation, preview, slides, or diagrams | `/av:preview` |
| Mermaid syntax | `/av:mermaidjs-v11` |
| Publish-grade technical diagrams | `/av:tech-graph` |
| Video/audio/image processing | `/av:media-processing` |
| HTML-template video rendering | `/av:html-video` |

## Planning, Research, and Agent Workflow

| User intent | Primary skill |
|---|---|
| Pressure-test a plan, design, or idea through an interview | `/av:advise` |
| Draft a self-contained brief for a researcher | `/av:research-prompt` |
| Preserve conversation state for a fresh agent | `/av:handoff` |
| Extract user decisions into a README, ADR, or structured document | `/av:interview-docs` |
| Create local context files for a subfolder | `/av:folder-context` |
| Prepare / preflight a long-running goal with an outcome lock | `/av:goal-warmup` |
| Run a durable Codex objective with a verifiable stop condition | `/av:codex-goal` |
| Benchmark a coding model on DeepSWE through OpenRouter | `/av:deep-swe` |

## Frameworks and Platforms

| User intent | Primary skill |
|---|---|
| Next.js, App Router, RSC, Turborepo | `/av:web-frameworks` |
| TanStack Start/Form/AI | `/av:tanstack` |
| React Native, Flutter, SwiftUI, Kotlin | `/av:mobile-development` |
| Shopify apps, extensions, or themes | `/av:shopify` |
