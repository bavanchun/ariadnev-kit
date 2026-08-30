# Implementation Checklist

The build order for a new Next.js app or Turborepo monorepo on this stack.
Each item names the reference that owns its detail; tick items in order and
skip the ones marked *(monorepo)* for a single app.

## Foundation

- [ ] Create the project structure — single app via `pnpm create next-app@latest`, or a workspace per [turborepo-setup.md](turborepo-setup.md)
- [ ] Configure TypeScript and ESLint
- [ ] Set up Next.js with the App Router — [nextjs-app-router.md](nextjs-app-router.md)
- [ ] Configure the Turborepo task graph *(monorepo)* — [turborepo-pipelines.md](turborepo-pipelines.md)
- [ ] Install and configure the icon library — [remix-icon-integration.md](remix-icon-integration.md)

## Application

- [ ] Implement routing and layouts — [nextjs-app-router.md](nextjs-app-router.md)
- [ ] Add loading and error states — [nextjs-data-fetching.md](nextjs-data-fetching.md)
- [ ] Configure image and font optimization — [nextjs-optimization.md](nextjs-optimization.md)
- [ ] Set up data-fetching patterns and Server/Client boundaries — [nextjs-server-components.md](nextjs-server-components.md), [nextjs-data-fetching.md](nextjs-data-fetching.md)
- [ ] Configure caching strategies against the installed cache model — [nextjs-data-fetching.md](nextjs-data-fetching.md)
- [ ] Add route handlers and Server Actions as needed, with validation and authorization
- [ ] Implement the shared component library *(monorepo)* — [turborepo-setup.md](turborepo-setup.md)

## Delivery

- [ ] Configure remote caching *(monorepo)* — [turborepo-caching.md](turborepo-caching.md)
- [ ] Set up the CI/CD pipeline running lint, typecheck, build, and focused tests through the task graph
- [ ] Configure the deployment platform — hand off to a separately authorized deploy workflow

Every item is done only when the matching Quality gate in SKILL.md holds for
it; the checklist orders the work, the gates decide whether it is finished.
