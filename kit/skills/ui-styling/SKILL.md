---
name: av:ui-styling
description: "Use when styling UIs with shadcn/ui and Tailwind CSS for accessible components, themes, dark mode, responsive layouts, design systems, tokens, and color customization."
user-invocable: true
when_to_use: "Invoke for shadcn, Tailwind, themes, or component styling."
category: frontend
keywords: [shadcn, radix, tailwind, themes]
license: MIT
argument-hint: "[component or layout]"
metadata:
  origin: ported
  author: upstream
  version: "1.0.0"
---

# UI Styling

Implement polished, accessible interfaces with the project's existing component
and styling system. Prefer local conventions over replacing the stack. Use
shadcn/ui and Tailwind CSS when already selected or explicitly requested.

## Inspect first

Identify the framework and rendering boundary; Tailwind and shadcn/ui versions;
existing tokens, themes, typography, spacing, variants, and breakpoints; supported
browsers; accessibility utilities; icon library; tests; and visual tooling.
Do not assume every shadcn/ui project uses the same component base or every
Tailwind project uses a JavaScript config file.

## Reference navigation

- [shadcn-components.md](references/shadcn-components.md) — component composition.
- [shadcn-theming.md](references/shadcn-theming.md) — tokens, themes, dark mode.
- [shadcn-accessibility.md](references/shadcn-accessibility.md) — semantics,
  keyboard interaction, focus, and announcements.
- [tailwind-utilities.md](references/tailwind-utilities.md) — utility composition.
- [tailwind-responsive.md](references/tailwind-responsive.md) — responsive layout.
- [tailwind-customization.md](references/tailwind-customization.md) — project
  configuration and extension points.
- [canvas-design-system.md](references/canvas-design-system.md) — visual systems
  and bundled fonts for canvas-based visuals.

## Setup and component workflow

1. Confirm the package manager and existing project configuration.
2. Initialize shadcn/ui only when it is not configured:

   ```bash
   pnpm dlx shadcn@latest init
   ```

3. Add only components needed by the accepted UI:

   ```bash
   pnpm dlx shadcn@latest add button dialog
   ```

4. Review generated files. shadcn/ui components become project source; preserve
   local variants and accessibility behavior.
5. Compose around domain boundaries. Avoid wrappers that merely rename props.

Use the repository's package manager when different. Verify current CLI options
with `pnpm dlx shadcn@latest --help` — the CLI is never installed globally by
this flow, so a bare `shadcn` will not resolve. Do not invent flags from memory.

## Tailwind workflow

For Tailwind CSS v4 projects, the common stylesheet entry is:

```css
@import "tailwindcss";
```

Preserve the installed setup instead of forcing a v3-style `tailwind.config`.

- Prefer semantic token classes over raw palette values for shared surfaces.
- Keep classes statically discoverable; map variants to complete class strings.
- Use mobile-first rules and test wrapping, zoom, reduced motion, and narrow views.
- Cover hover, focus-visible, active, disabled, invalid, loading, selected, and
  dark states where supported.
- Promote repeated arbitrary values into project tokens.

## Accessibility workflow

- Use semantic HTML before ARIA and preserve the component keyboard model.
- Give icon-only controls an accessible name; hide decorative icons.
- Keep visible focus and logical focus order.
- Associate labels, descriptions, errors, and status messages programmatically.
- Check contrast in every theme/state and respect reduced-motion preferences.

## Responsive and visual review

Validate representative narrow, medium, and wide widths with real content
extremes. Check overflow, truncation, touch targets, sticky elements, dialogs,
popovers, and viewport-height behavior. Compare typography, spacing, color,
border, radius, shadow, and motion against the accepted design.

## Utility scripts

- `scripts/shadcn_add.py` wraps component installation. Use dry-run and review
  the resolved command before package or file changes.
- `scripts/tailwind_config_gen.py` emits legacy Tailwind v3-style config. Do not
  use it for Tailwind v4; preserve current CSS-first configuration.

## Output format

Return changed files/components; tokens, variants, responsive rules, and themes;
accessibility and keyboard behavior; viewport/theme/state checks; lint,
typecheck, focused tests, and browser/a11y outcomes; and remaining differences.

## Quality gates

- [ ] UI matches the accepted design and existing local system.
- [ ] Themes and interactive states use semantic, consistent tokens.
- [ ] Narrow through wide layouts handle realistic content without overflow.
- [ ] Keyboard, focus, names, labels, errors, and announcements work.
- [ ] Contrast, touch targets, reduced motion, and icons are accessible.
- [ ] Tailwind classes are statically discoverable and version-appropriate.
- [ ] Generated shadcn/ui code was reviewed and customizations preserved.
- [ ] Project lint, typecheck, focused tests, and visual checks pass.

## Workflow position

**Typically follows:** `av:frontend-design` or an accepted visual specification,
plus repository inspection.

**Typically precedes:** `av:test`, browser/a11y verification, and code review.

**Related:** `av:frontend-development` for application behavior,
`av:web-frameworks` for architecture, and `av:web-design-guidelines` for audits.
