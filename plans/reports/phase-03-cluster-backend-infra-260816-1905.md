# Phase 3 — Cluster: Backend, data, infrastructure and security

Plan: `plans/260816-1845-ariadnev-evidence-backed-parity-with-agentkit/phase-03-eval-coverage-that-matches-the-claim.md`

11 files created under `evals/scenarios/skills/`, one per assigned skill. Each pairs the
skill's positive routing case against a genuinely confusable neighbour's negative case, and
vice versa in the neighbour's own file (mirrored prompts, inverted `routing`).

## Coverage table

| skill | positive intent | negative (forbidden) skill | why genuinely confusable |
|---|---|---|---|
| `backend-development` | Generic NestJS REST API implementation reusing existing JWT middleware | `better-auth` | `backend-development`'s own description explicitly lists "auth (OAuth, JWT)" as in-scope, but Better Auth is the specific library skill — auth work only routes to `better-auth` once a concrete auth-library integration (sign-up, OAuth provider, plugin ecosystem) is requested. |
| `better-auth` | Add Better Auth email/password + Google OAuth + passkey to a Next.js app via the plugin ecosystem | `backend-development` | Mirror of above: generic backend/API work that merely reuses existing auth middleware (no library integration) belongs to `backend-development`, not `better-auth`. |
| `databases` | Design a normalized Postgres schema + indexes for an orders system | `devops` | Both skills explicitly claim Postgres. `databases` owns schema/query/index design; `devops` explicitly lists "Managed relational DB: Cloud SQL" and owns provisioning, backups, and proxy wiring — the overlap is real when a prompt mentions "backups" or "instance" language. |
| `payment-integration` | Stripe Checkout session + idempotent webhook handling + plan upgrade | `backend-development` | Same pattern as backend-development/better-auth: payments are a backend concern, but `payment-integration` owns the named provider libraries (SePay/Polar/Stripe) specifically. An internal ledger/bookkeeping endpoint that never touches an external gateway is generic `backend-development`, despite "money" language. |
| `devops` | Stand up a GKE cluster, RBAC, network policies, Argo CD GitOps pipeline (the platform itself) | `deploy` | Canonical pairing named in the phase spec: "configure the platform" (devops) vs "push this live" (deploy) — both skills' descriptions explicitly cross-reference each other (`deploy`'s SKILL.md: "For advanced infrastructure/troubleshooting, activate `/av:devops`"). |
| `deploy` | Deploy a Next.js app to Vercel and confirm the live URL | `devops` | Mirror of above. |
| `security` | STRIDE + OWASP threat-modeled audit producing a severity-ranked findings report, no test code | `web-testing` | Canonical pairing named in the phase spec. `web-testing`'s own skill table lists "security" as one of its test types (k6/Playwright security tests), so "run a security check" is genuinely ambiguous between an audit (`security`) and automated security *tests* (`web-testing`). Deliberately distinct from `security-scan.json` (which pairs `av:security-scan` against `av:code-review`, a different skill and a different neighbour) so it does not restate that scenario. |
| `web-testing` | Write and run k6 security load tests + Playwright security regression tests, report pass/fail/skip counts | `security` | Mirror of above. |
| `google-adk-python` | Extend an existing ADK agent's session/sub-agent graph that already calls MCP servers as tools | `mcp-builder` | ADK's own description explicitly claims "Integrate MCP servers as agent tools" as an activation trigger. The genuine confusion is "build the agent that *uses* MCP tools" (`google-adk-python`) vs "build the MCP *server* that provides the tools" (`mcp-builder`) — a prompt mentioning both ADK and MCP is ambiguous until it's clear whether a new server or a new agent component is being built. |
| `mcp-builder` | Build a new FastMCP Python server exposing `search_tickets`/`create_ticket` tools | `use-mcp` | Canonical pairing named in the phase spec: "build a server" vs "call one." |
| `use-mcp` | Discover and invoke an already-registered helpdesk MCP server's `search_tickets` tool | `mcp-builder` | Mirror of above. |

## Proposed evidence id

The vocabulary has no id that honestly describes "an already-registered external MCP tool
was discovered/validated and invoked with a verifiable result" — `implementation.verified`
is about a code change plus verification commands, which does not fit `use-mcp`'s Path 1
(runtime-native discovery + execution, no persistent code artifact). Proposing 1 new id
(well under the 2-id cluster budget / 10-id phase budget):

```json
{
  "id": "mcp.tool-invocation",
  "producer": "harness",
  "proof": "execution",
  "criterion": "The transcript records a specific MCP tool name, its validated arguments, and the structured result the harness confirms the server returned.",
  "capabilities": {}
}
```

Used in `use-mcp.json` (positive) and `mcp-builder.json` (negative, mirroring `use-mcp`'s
positive case).

## Evidence ids used (all pre-existing, verified against `evidence-v1.json` criteria)

- `implementation.verified` — `backend-development`, `better-auth`, `databases`,
  `payment-integration`, `devops`, `deploy`, `google-adk-python`, `mcp-builder` (positive
  cases; each represents an accepted code/config change with a passing verification
  command — schema/migration, auth wiring, webhook handler, cluster/deploy config, agent
  code, or MCP server code).
- `security.findings` — `security` (positive), `web-testing` (negative). Matches the
  criterion exactly: severity-ranked, redacted findings report with per-location evidence.
- `tests.results` — `web-testing` (positive), `security` (negative). Matches: recorded
  test commands with pass/fail/skip counts.
- `mcp.tool-invocation` (proposed) — `use-mcp` (positive), `mcp-builder` (negative).

No negative was drawn from outside the assigned cluster — all 11 negatives pair against
another skill in the same 11-skill cluster.

## Validation

- All 11 files parse as valid JSON (`node -e "JSON.parse(...)"`, individually confirmed).
- `npx vitest run packages/cli/src/eval/scenario-coverage.test.ts`: none of the 11 assigned
  skill names (`backend-development`, `databases`, `better-auth`, `payment-integration`,
  `devops`, `deploy`, `security`, `web-testing`, `google-adk-python`, `mcp-builder`,
  `use-mcp`) appear in the "undeclared" failure list — confirmed by grepping the failure
  output for each quoted name (zero matches). The suite still fails overall because other
  clusters are in flight in parallel (expected per the task) and because of the one
  proposed-but-not-yet-vocabulary-added `mcp.tool-invocation` id (expected until the
  orchestrator merges the proposal centrally).
- Scenario ids (`skill.<name>.routing`) checked against every existing file in
  `evals/scenarios/skills/` (including files other parallel agents had already written at
  time of writing) — no collisions.

## Files created

- `evals/scenarios/skills/backend-development.json`
- `evals/scenarios/skills/databases.json`
- `evals/scenarios/skills/better-auth.json`
- `evals/scenarios/skills/payment-integration.json`
- `evals/scenarios/skills/devops.json`
- `evals/scenarios/skills/deploy.json`
- `evals/scenarios/skills/security.json`
- `evals/scenarios/skills/web-testing.json`
- `evals/scenarios/skills/google-adk-python.json`
- `evals/scenarios/skills/mcp-builder.json`
- `evals/scenarios/skills/use-mcp.json`

No files outside this list were touched. `evals/vocabulary/evidence-v1.json`,
`evals/schema/**`, `evals/README.md`, `kit/**`, `packages/**` were not modified.
