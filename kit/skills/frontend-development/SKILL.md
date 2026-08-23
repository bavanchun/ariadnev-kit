---
name: av:frontend-development
description: Build React/TypeScript frontends with modern patterns. Use for components, Suspense, lazy loading, useSuspenseQuery, MUI v7 styling, TanStack Router, performance optimization.
user-invocable: true
when_to_use: "Invoke for React/TypeScript frontend implementation."
category: frontend
keywords: [react, typescript, components, mui]
argument-hint: "[component or feature]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# Frontend Development Guidelines

Conventions for a React + TypeScript codebase built on Vite, MUI v7, TanStack
Query and TanStack Router: Suspense-based data fetching, lazy loading, feature
directories, and the performance rules that follow from them. It does not
decide what an interface looks like, and it does not cover Next.js or the
shadcn/Tailwind stack — see Workflow position for the skills that do.

## When to Use This Skill

- Creating new components or pages
- Building new features
- Fetching data with TanStack Query
- Setting up routing with TanStack Router
- Styling components with MUI v7
- Performance optimization
- Organizing frontend code
- TypeScript best practices

## Quick Start: New Feature Checklist

Creating a feature? Set up this structure:

- [ ] Create `features/{feature-name}/` directory
- [ ] Create subdirectories: `api/`, `components/`, `hooks/`, `helpers/`, `types/`
- [ ] Create API service file: `api/{feature}Api.ts`
- [ ] Set up TypeScript types in `types/`
- [ ] Create route in `routes/{feature-name}/index.tsx`
- [ ] Lazy load feature components
- [ ] Use Suspense boundaries
- [ ] Export public API from feature `index.ts`

## Topic Guides

Each topic states the rule; the linked resource carries the full guide.

### Component Patterns

- `React.FC<Props>` for type safety; named const + default export pattern
- `React.lazy()` for heavy components (DataGrid, charts, editors); always wrap
  lazy components in Suspense, using `SuspenseLoader` (with fade animation)
- Component structure: Props → Hooks → Handlers → Render → Export

[Complete guide: resources/component-patterns.md](resources/component-patterns.md)

### Data Fetching

**Primary pattern: `useSuspenseQuery`** — used with Suspense boundaries,
cache-first (check grid cache before API), replaces `isLoading` checks,
type-safe with generics.

**API service layer:** `features/{feature}/api/{feature}Api.ts`, using the
`apiClient` axios instance, centralized methods per feature. Route format:
`/form/route` (NOT `/api/form/route`).

[Complete guide: resources/data-fetching.md](resources/data-fetching.md)

### File Organization

- `features/`: domain-specific (posts, comments, auth)
- `components/`: truly reusable (SuspenseLoader, CustomAppBar)

```
features/
  my-feature/
    api/          # API service layer
    components/   # Feature components
    hooks/        # Custom hooks
    helpers/      # Utility functions
    types/        # TypeScript types
```

[Complete guide: resources/file-organization.md](resources/file-organization.md)

### Styling

- <100 lines: inline `const styles: Record<string, SxProps<Theme>>`;
  >100 lines: separate `.styles.ts` file
- Primary method: the `sx` prop on MUI components, typed `SxProps<Theme>`;
  theme access `(theme) => theme.palette.primary.main`
- MUI v7 Grid:

```typescript
<Grid size={{ xs: 12, md: 6 }}>  // ✅ v7 syntax
<Grid xs={12} md={6}>             // ❌ Old syntax
```

[Complete guide: resources/styling-guide.md](resources/styling-guide.md)

### Routing

TanStack Router, folder-based: `routes/my-route/index.tsx`, lazy-loaded
component, `createFileRoute`, breadcrumb data in the loader.

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';

const MyPage = lazy(() => import('@/features/my-feature/components/MyPage'));

export const Route = createFileRoute('/my-route/')({
    component: MyPage,
    loader: () => ({ crumb: 'My Route' }),
});
```

[Complete guide: resources/routing-guide.md](resources/routing-guide.md)

### Loading & Error States

**Critical rule: no early returns.**

```typescript
// ❌ NEVER - Causes layout shift
if (isLoading) {
    return <LoadingSpinner />;
}

// ✅ ALWAYS - Consistent layout
<SuspenseLoader>
    <Content />
</SuspenseLoader>
```

Why: prevents Cumulative Layout Shift (CLS). Error handling: `useMuiSnackbar`
for user feedback (NEVER `react-toastify`), TanStack Query `onError` callbacks.

[Complete guide: resources/loading-and-error-states.md](resources/loading-and-error-states.md)

### Performance

- `useMemo`: expensive computations (filter, sort, map)
- `useCallback`: event handlers passed to children
- `React.memo`: expensive components
- Debounced search (300-500ms); memory-leak prevention (cleanup in `useEffect`)

[Complete guide: resources/performance.md](resources/performance.md)

### TypeScript

Strict mode, no `any`; explicit return types on functions; type imports
(`import type { User } from '~types/user'`); component prop interfaces with
JSDoc.

[Complete guide: resources/typescript-standards.md](resources/typescript-standards.md)

### Common Patterns

React Hook Form with Zod validation, DataGrid wrapper contracts, Dialog
component standards, `useAuth` hook for the current user, mutation patterns
with cache invalidation.

[Complete guide: resources/common-patterns.md](resources/common-patterns.md)

### Complete Examples

Full working examples: a modern component with all patterns, a complete
feature structure, an API service layer, a route with lazy loading,
Suspense + `useSuspenseQuery`, a form with validation.

[Complete guide: resources/complete-examples.md](resources/complete-examples.md)

## Reference Map

| Read | When |
|---|---|
| [Quick reference](references/quick-reference.md) | Pasting the import aliases, the common-imports block, the full `src/` tree, or the component template |
| `resources/*.md` (linked per topic above) | The rule is known and the full pattern, with its edge cases, is needed |

## Output format

**A component** — one `.tsx` file in the order Props → Styles → Hooks →
Handlers → Render → Export (the full template with every slot is
`resources/component-patterns.md`, "Component Structure Template"):

```typescript
interface MyComponentProps { /* typed, JSDoc per prop */ }

const componentStyles: Record<string, SxProps<Theme>> = { /* if inline and <100 lines */ };

export const MyComponent: React.FC<MyComponentProps> = (props) => {
    // hooks, in this order: context (useAuth, useMuiSnackbar) → useSuspenseQuery → useState → useMemo → effects
    // handlers: useCallback for anything passed to a child
    return <Box sx={componentStyles.container}>{/* render */}</Box>;   // no early-return spinner
};

export default MyComponent;
```

A heavy component is delivered lazy at its call site —
`const X = React.lazy(() => import('./X'))` inside `<SuspenseLoader>`.

**A feature** — the directory and its route:

```
features/<name>/
  api/<name>Api.ts          # apiClient methods; service paths with no /api/ prefix (e.g. /form/route)
  components/               # lazy-loaded, Suspense-wrapped
  hooks/                    # use<Name>.ts, useSuspense<Name>.ts
  helpers/
  types/index.ts
  index.ts                  # the feature's public exports
routes/<name>/index.tsx     # createFileRoute + loader({ crumb })
```

## Quality gates

- [ ] Every component follows Props → Styles → Hooks → Handlers → Render → default export, typed `React.FC<Props>`, no `any`
- [ ] Data arrives through `useSuspenseQuery` inside a `<SuspenseLoader>` boundary, and heavy components (DataGrid, charts, editors) and route components are `React.lazy` inside Suspense — no `isLoading` early return anywhere
- [ ] A feature ships its `api/`, `components/`, `hooks/`, `helpers/`, `types/` subdirectories, exports its public API from `index.ts`, and registers its route under `routes/<name>/`
- [ ] Handlers passed to children are `useCallback`; expensive filter/sort/map is `useMemo`
- [ ] Imports use `@/`, `~types`, `~components`, `~features`; API routes are `/form/route`, never `/api/form/route`
- [ ] Notifications go through `useMuiSnackbar`, never `react-toastify`; Grid uses the v7 `size={{…}}` syntax

## Workflow position

**Typically follows:** `av:ui-ux-pro-max` or `av:frontend-design` when the
interface was designed first — they decide what it looks like; this skill
decides how it is built in React, MUI v7 and TanStack.

**Typically precedes:** `av:web-testing` — the Suspense boundaries and lazy
routes produced here are what its Playwright and Vitest suites exercise.

**Related:** `av:backend-development` builds the API that this skill's
`api/<name>Api.ts` layer consumes. `av:react-best-practices` for rendering and
bundle analysis beyond the `useMemo`/`useCallback` rules here. `av:ui-styling`
is the shadcn/Tailwind stack and `av:web-frameworks` is Next.js App Router —
this skill is MUI v7 `sx` on TanStack Router + Vite; check which the project
uses before applying either. `av:tanstack` owns TanStack Start, Form and AI,
and explicitly does not cover TanStack Query, which this skill uses.
