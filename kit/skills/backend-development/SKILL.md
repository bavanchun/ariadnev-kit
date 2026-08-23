---
name: av:backend-development
description: Build backends with Node.js, Python, Go (NestJS, FastAPI, Django). Use for REST/GraphQL/gRPC APIs, auth (OAuth, JWT), databases, microservices, security (OWASP), Docker/K8s.
user-invocable: true
when_to_use: "Invoke when backend/API implementation is the main surface."
category: backend
keywords: [nodejs, python, go, api, rest, graphql]
license: MIT
argument-hint: "[framework] [task]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# Backend Development Skill

Production-ready backend development with modern technologies, best practices, and proven patterns.

## When to Use

- Designing RESTful, GraphQL, or gRPC APIs
- Building authentication/authorization systems
- Optimizing database queries and schemas
- Implementing caching and performance optimization
- OWASP Top 10 security mitigation
- Designing scalable microservices
- Testing strategies (unit, integration, E2E)
- CI/CD pipelines and deployment
- Monitoring and debugging production systems

## Technology Selection Guide

**Languages:** Node.js/TypeScript (full-stack), Python (data/ML), Go (concurrency), Rust (performance)
**Frameworks:** NestJS, FastAPI, Django, Express, Gin
**Databases:** PostgreSQL (ACID), MongoDB (flexible schema), Redis (caching)
**APIs:** REST (simple), GraphQL (flexible), gRPC (performance)

See: `references/backend-technologies.md` for detailed comparisons

## Reference Navigation

**Core Technologies:**
- `references/backend-technologies.md` — languages, frameworks, databases, message queues, ORMs.
- `references/backend-api-design.md` — REST, GraphQL, gRPC patterns and best practices.

**Security & Authentication:**
- `references/backend-security.md` — OWASP Top 10, security best practices, input validation.
- `references/backend-authentication.md` — OAuth 2.1, JWT, RBAC, MFA, session management.

**Performance & Architecture:**
- `references/backend-performance.md` — caching, query optimization, load balancing, scaling.
- `references/backend-architecture.md` — microservices, event-driven, CQRS, saga patterns.

**Quality & Operations:**
- `references/backend-testing.md` — testing strategies, frameworks, tools, CI/CD testing.
- `references/backend-code-quality.md` — SOLID principles, design patterns, clean code.
- `references/backend-devops.md` — Docker, Kubernetes, deployment strategies, monitoring.
- `references/backend-debugging.md` — debugging strategies, profiling, logging, production debugging.
- `references/backend-mindset.md` — problem-solving, architectural thinking, collaboration.

## Key Best Practices

Defaults to apply unless the project has a reason not to. The reference files
below quote benchmark figures that are undated and drawn from other systems —
re-measure in this codebase before relying on one.

**Security:** Argon2id passwords, parameterized queries, OAuth 2.1 + PKCE, rate limiting, security headers

**Performance:** Redis caching, database indexing, CDN for static assets, connection pooling

**Testing:** 70-20-10 pyramid (unit-integration-E2E), contract testing for microservices, a test for every migration

**DevOps:** Blue-green/canary deployments, feature flags, container orchestration (Docker/Kubernetes), Prometheus/Grafana monitoring, OpenTelemetry tracing

## Quick Decision Matrix

| Need | Choose |
|------|--------|
| Fast development | Node.js + NestJS |
| Data/ML integration | Python + FastAPI |
| High concurrency | Go + Gin |
| Max performance | Rust + Axum |
| ACID transactions | PostgreSQL |
| Flexible schema | MongoDB |
| Caching | Redis |
| Internal services | gRPC |
| Public APIs | GraphQL/REST |
| Real-time events | Kafka |

## Implementation Checklist

**API:** Choose style → Design schema → Validate input → Add auth → Rate limiting → Documentation → Error handling

**Database:** Choose DB → Design schema → Create indexes → Connection pooling → Migration strategy → Backup/restore → Test performance

**Deployment:** Docker → CI/CD → Blue-green/canary → Feature flags → Monitoring → Logging → Health checks

## Output format

Return working code, plus what a reviewer would otherwise have to ask for:

1. **The change** — files created or modified, each with its role in one line.
2. **The API surface**, when endpoints changed: a table of
   `Method | Path | Auth | Request | Response | Error codes`. An endpoint whose
   failure responses are undocumented is not finished.
3. **How it was verified** — the commands run and their result. Name the proof
   layer the change reached: `unit`, `integration`, `e2e`, or `platform`, and
   say why that is far enough for this change's risk.
4. **Follow-ups** — anything deliberately left, or "none".

## Quality gates

- [ ] Every new endpoint validates its input at the boundary and returns typed
      errors, not raw exception text
- [ ] No secret, connection string, or key is hardcoded or logged
- [ ] Every query touching user input is parameterized
- [ ] Auth is enforced on the server for each new route — a client-side check
      is not an access control
- [ ] Tests were run and their output is reported; a change described as
      "should work" has not been verified
- [ ] Anything the change makes slower or more expensive is named, not left for
      the reviewer to notice

## Workflow position

**Typically follows:** `av:plan` for a multi-endpoint feature, or `av:databases`
when the schema behind the API is designed first.
**Typically precedes:** `av:test` for the suite around the new surface,
`av:security` for a threat-modeled review before it ships, and `av:deploy` to
put it live.
**Related:** `av:better-auth` owns Better Auth integration specifically — reach
for it instead when the task is wiring that library's providers, sessions, or
plugins, rather than building auth on the existing stack; `av:frontend-development`
consumes the API this skill produces; `av:devops` owns the cluster and pipeline
this runs on.

## Resources

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- OAuth 2.1: https://oauth.net/2.1/
- OpenTelemetry: https://opentelemetry.io/
