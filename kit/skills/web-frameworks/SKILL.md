---
name: av:web-frameworks
description: "Use when building Next.js apps with App Router, RSC, SSR, ISR, and caching, or Turborepo monorepos with shared dependencies, task graphs, and build optimization."
user-invocable: true
when_to_use: "Invoke for Next.js, RSC, SSR, ISR, Turborepo, or caching."
category: frameworks
keywords: [nextjs, turborepo, ssr, isr, rsc]
license: MIT
argument-hint: "[framework] [feature]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# Web Frameworks

Build and maintain Next.js App Router applications and Turborepo monorepos.
Inspect installed versions and configuration before choosing rendering, caching,
or task-graph behavior; these contracts change across major releases.

## When to use

Use for Next.js App Router, RSC, SSR, ISR, routing, metadata, streaming, caching,
and optimization; Turborepo workspace structure, shared packages, task graphs,
outputs, and caching; or a combined Next.js monorepo. Use `av:tanstack` for
TanStack Start and a general frontend skill when architecture is unchanged.

## Reference navigation

### Next.js

- [nextjs-app-router.md](references/nextjs-app-router.md) — routing and metadata.
- [nextjs-server-components.md](references/nextjs-server-components.md) — RSC,
  Client Components, streaming, and boundaries.
- [nextjs-data-fetching.md](references/nextjs-data-fetching.md) — fetching,
  caching, revalidation, and loading/error states.
- [nextjs-optimization.md](references/nextjs-optimization.md) — images, fonts,
  scripts, bundles, and rendering optimization.

### Turborepo

- [turborepo-setup.md](references/turborepo-setup.md) — workspace/package structure.
- [turborepo-pipelines.md](references/turborepo-pipelines.md) — task graph and order.
- [turborepo-caching.md](references/turborepo-caching.md) — cache inputs, outputs,
  environment variables, and remote caching.

### Icons

- [remix-icon-integration.md](references/remix-icon-integration.md) — Remix Icon
  installation, usage, and accessibility.

### Build order

- [implementation-checklist.md](references/implementation-checklist.md) — the
  step order for a new app or monorepo, each step mapped to its owning reference.

Resolve version-sensitive details against installed packages and current official
documentation.

## Next.js workflow

1. Inspect `package.json`, Next config, `app/`, runtime targets, TypeScript,
   styling, tests, and deployment constraints.
2. For a new app, use the current official scaffold:

   ```bash
   pnpm create next-app@latest my-app --yes
   ```

3. Keep Server Components as default. Add `"use client"` only at the smallest
   boundary needing browser APIs, state, effects, or handlers.
4. Choose rendering and caching per route from freshness requirements; document
   why a route is static, dynamic, streamed, or revalidated.
5. Keep secrets and privileged data server-side. Validate and authorize every
   mutation, including Server Actions and route handlers.
6. Use framework image, font, metadata, and script facilities when appropriate.

Modern Next.js does not cache every `fetch` by default. Projects with Cache
Components enabled use `use cache` and cache-lifetime APIs; projects on the
previous model use fetch/route revalidation controls. Detect the installed model
and do not mix both or copy an old ISR recipe blindly.

## Turborepo workflow

1. Inspect workspace configuration, package graph, scripts, lockfile, and
   `turbo.json`/`turbo.jsonc`.
2. Put reusable code in packages with explicit exports and dependencies.
3. Define current task configuration under `tasks`. Use `dependsOn` for order,
   `outputs` for artifacts, and `persistent: true` with `cache: false` for
   long-running development tasks where appropriate.
4. Include environment variables/external files in correct cache inputs without
   leaking secret values into logs or committed config.
5. Run scripts through the graph and verify cache behavior before remote caching.

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": { "cache": false, "persistent": true }
  }
}
```

## Icon accessibility

Use the project's icon library consistently. Hide decorative icons from
assistive technology and give icon-only controls an accessible name. Do not use
emoji as product-interface icons when a stable library icon exists.

## Release channels

Track stable Next.js security releases separately from canary framework drift.
Production apps stay on a patched stable release line; reach for a canary-only
pin when reproducing a specific upstream issue, not to obtain a feature.

## Legacy utility warning

- `scripts/nextjs_init.py` is a hand-written scaffold with legacy dependency and
  Tailwind assumptions. Prefer official `create-next-app` for new applications.
- `scripts/turborepo_migrate.py` emits the removed `pipeline` key. Current
  Turborepo uses `tasks`; rewrite and validate generated config before use.

## Output format

Return versions/config inspected; changed files, routes, packages, and public
boundaries; rendering/cache model and freshness rationale; Turborepo tasks,
outputs, and inputs; security/server-client/accessibility considerations; and
lint, typecheck, build, focused test, and cache-check outcomes.

## Quality gates

- [ ] Server/Client boundaries are minimal and secrets stay server-side.
- [ ] Rendering, caching, and ISR/revalidation match installed Next.js behavior.
- [ ] Route handlers and Server Actions validate and authorize mutations.
- [ ] `turbo.json` uses `tasks` with accurate dependencies, outputs, and inputs.
- [ ] Shared packages have explicit exports and no unintended cycles.
- [ ] Icons and interactive UI meet accessible-name and keyboard requirements.
- [ ] Project lint, typecheck, build, and focused tests pass.

## Workflow position

**Typically follows:** an accepted architecture or feature plan and repository
inspection; use `av:frontend-design` first when visual direction is undecided.

**Typically precedes:** `av:ui-styling`, `av:test`, code review, and a separately
authorized deploy workflow.

**Related:** `av:frontend-development` for broader implementation,
`av:tanstack` for TanStack Start, and `av:react-best-practices` for performance.
