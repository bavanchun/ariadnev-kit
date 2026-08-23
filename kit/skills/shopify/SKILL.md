---
name: av:shopify
description: "Use when building Shopify apps, extensions, or themes with Shopify CLI, GraphQL Admin API, Polaris, Liquid, checkout customization, webhooks, and billing integration."
---

# Shopify Development

Build Shopify apps, extensions, and themes with the official Shopify CLI and
current platform contracts. Inspect the existing project and its pinned API
version before selecting commands or APIs; Shopify versions change quarterly.

## Choose the surface

- **App:** merchant-facing or backend behavior, OAuth, Admin GraphQL, webhooks,
  billing, embedded admin UI, or app-owned data.
- **Extension:** a supported checkout, admin, POS, Functions, or theme extension
  point.
- **Theme:** storefront presentation using Liquid, JSON templates, sections,
  blocks, assets, and theme settings.

Use a combination only when each surface owns a clear responsibility.

## References

- [app-development.md](references/app-development.md) — app architecture,
  authentication, GraphQL Admin API, webhooks, and billing.
- [extensions.md](references/extensions.md) — extension types and constraints.
- [themes.md](references/themes.md) — Liquid, sections, and theme tooling.

Verify changing details against Shopify's official documentation and installed
CLI before implementation.

## Prerequisites

Use the Node, package-manager, Git, and CLI versions required by current Shopify
CLI documentation. Authenticate through the CLI; never place tokens or app
secrets in source, prompts, screenshots, or committed env files.

```bash
shopify version
shopify help
shopify app --help
shopify theme --help
```

Install or upgrade the CLI only when dependency changes are authorized.

## App workflow

1. Inspect `shopify.app.toml`, package scripts, extension directories, scopes,
   API version, and deployment environment.
2. For a new app, use the current `shopify app init` flow; do not handwrite a
   replacement scaffold.
3. Develop with `shopify app dev` and use generated URLs/session details rather
   than hardcoded tunnel assumptions.
4. Prefer GraphQL Admin API for new integrations. REST Admin API is legacy and
   should remain only where an existing contract requires it.
5. Verify webhook signatures before parsing or mutation. Make handlers
   idempotent and tolerant of retries and out-of-order delivery.
6. Request only necessary scopes and document reauthorization needs.
7. Run `shopify app config validate` and project checks before requesting deploy
   approval. Do not run `shopify app deploy` without explicit authorization.

## Extension workflow

1. Confirm the target supports the requested extension type and capabilities.
2. Generate through the current `shopify app generate extension` flow.
3. Use only supported checkout/Functions components, APIs, and network access.
4. Preview through `shopify app dev` and test relevant merchant/buyer states.
5. Keep extension configuration and app scopes aligned with generated contracts.

## Theme workflow

1. Start from an authorized existing theme or current `shopify theme init` flow.
2. Pull first when the remote theme is the source of truth.
3. Develop with `shopify theme dev`; run `shopify theme check` before delivery.
4. Use sections/blocks for configurable content and accessible, responsive UI.
5. Treat `shopify theme push` and `shopify theme publish` as external mutations;
   require explicit target and approval.

## Security and data boundaries

- Verify OAuth state and session ownership; do not trust shop IDs from input.
- Verify webhook HMAC against the raw body with a timing-safe comparison.
- Store secrets only in the approved secret or environment system.
- Minimize retained customer/merchant data and honor required privacy webhooks.
- Keep billing server-authoritative and handle cancellation, downgrade, trials,
  and duplicate callbacks.

## Legacy utility warning

`scripts/shopify_init.py` is a legacy draft generator. It handwrites config,
pins API version `2025-01`, and does not replace Shopify CLI scaffolding. Do not
use it for new projects. Compare maintained output with the current CLI schema.

## Output format

Return the selected surface and rationale; changed files and owned contracts;
API version, scopes, webhook topics, extension type, and theme target inspected
or changed; security decisions; checks and outcomes; and any deploy, publish,
reauthorization, or dashboard steps still requiring a human.

## Quality gates

- [ ] New projects and extensions use current official CLI scaffolding.
- [ ] New Admin integrations use GraphQL unless preserving an existing REST contract.
- [ ] API version and commands match the project and current official docs.
- [ ] OAuth, HMAC, idempotency, scopes, secrets, billing, and privacy are handled.
- [ ] UI is accessible and tested in relevant merchant/buyer states.
- [ ] `shopify app config validate` or `shopify theme check` passes as applicable.
- [ ] Project lint, typecheck, build, and focused tests pass.
- [ ] No deploy, push, publish, billing, or production mutation occurred without
      explicit authorization and a verified target.

## Workflow position

**Typically follows:** an accepted feature plan and repository inspection; use
backend or frontend design work first when those contracts are undecided.

**Typically precedes:** tests, browser verification, security review, and a
separately authorized deploy or publish workflow.

**Related:** `av:web-frameworks` for non-Shopify architecture,
`av:ui-styling` for general UI, and deployment skills for an approved release.
