# Provider Onboarding Guide

How to add a new AI coding provider to vcskill.

## Prerequisites

- Read the [Provider matrix](../README.md#provider-matrix) for the target layout
- Verify target paths against the provider's real documentation (never guess)
- Have working test coverage (`pnpm coverage` must stay ≥ 95% on `adapt/`)

## Steps

### S1: Define path constants in `paths.ts`

Add provider-specific path constants to [`packages/cli/src/adapt/paths.ts`](../packages/cli/src/adapt/paths.ts).

```ts
// Example: adding "windsurf" provider
export const WINDSURF_DIR = ".windsurf";
export const WINDSURF_SKILLS_DIR = `${WINDSURF_DIR}/skills`;
export const WINDSURF_AGENTS_DIR = `${WINDSURF_DIR}/agents`;
export const WINDSURF_COMMANDS_DIR = `${WINDSURF_DIR}/commands`;
```

**Rules:**
- One constant per directory/path
- Use the provider name as prefix
- Compose paths from the root dir constant (DRY)

### S2: Register verification flags in `spec-verified.ts`

Add an entry to the `SPEC_VERIFIED` map in [`packages/cli/src/providers/spec-verified.ts`](../packages/cli/src/providers/spec-verified.ts).

1. Add the provider ID to the `ProviderId` union type
2. Add a verification record to `SPEC_VERIFIED`

```ts
// In ProviderId union:
export type ProviderId = /* existing */ | "windsurf";

// In SPEC_VERIFIED map:
windsurf: {
  paths: {
    skill: true,    // verified against windsurf docs
    agent: true,    // verified against windsurf docs
    command: true,  // verified against windsurf docs
    rules: true,    // verified against windsurf docs
    scripts: true,  // verified against windsurf docs
    env: true,      // verified against windsurf docs
  },
  toolNames: false, // set true only when tool rewrite table is verified
  source: "windsurf official docs <URL>",
},
```

**Critical:** Set `false` for any artifact path you haven't verified against the provider's actual behavior. Unverified cells are skip-and-logged — never guessed.

### S3: Configure the resolver in `resolver.ts`

Add a `ProviderConfig` entry to the `CONFIGS` map in [`packages/cli/src/providers/resolver.ts`](../packages/cli/src/providers/resolver.ts).

```ts
windsurf: {
  rulesMode: "dir",  // "dir" | "mdc" | "agents-md"
  base: (_k, ctx) => pickBase(ctx),
  skillDir: ".windsurf/skills",
  agentPath: (n) => `.windsurf/agents/${n}.md`,
  commandPath: (n) => `.windsurf/commands/${n}.md`,
  rulePath: (n) => `.windsurf/rules/${n}.md`,
  scriptsDir: ".windsurf/scripts",
  envFile: ".windsurf/.env.example",
},
```

**`rulesMode` options:**
| Mode | Behavior |
|------|----------|
| `"dir"` | Each rule is a separate `.md` file in a rules directory |
| `"mdc"` | Each rule is a `.mdc` file (Cursor format) |
| `"agents-md"` | Rules are merged into a single `AGENTS.md` block |

### S4: Register the provider in `providers/index.ts`

Add the new provider ID to the `PROVIDER_IDS` array in [`packages/cli/src/providers/index.ts`](../packages/cli/src/providers/index.ts).

```ts
export const PROVIDER_IDS: ProviderId[] = [
  // ...existing
  "windsurf",
];
```

### S5: Add unit tests in `resolver.test.ts`

Add resolution tests in [`packages/cli/src/providers/resolver.test.ts`](../packages/cli/src/providers/resolver.test.ts).

```ts
it("windsurf project paths", () => {
  const r = getResolver("windsurf");
  expect(r.targetFor(art("skill", "x"), ctx)).toBe("/proj/.windsurf/skills/x");
  expect(r.targetFor(art("agent", "a"), ctx)).toBe("/proj/.windsurf/agents/a.md");
  expect(r.targetFor(art("command", "c"), ctx)).toBe("/proj/.windsurf/commands/c.md");
  expect(r.scriptsTarget(ctx)).toBe("/proj/.windsurf/scripts");
  expect(r.envTarget(ctx)).toBe("/proj/.windsurf/.env.example");
});

it("windsurf global scope", () => {
  const r = getResolver("windsurf");
  expect(r.targetFor(art("skill", "x"), { ...ctx, scope: "global" }))
    .toBe("/home/u/.windsurf/skills/x");
});
```

### S6: Update the Provider matrix in README.md

Add the new provider column to the [Provider matrix](../README.md#provider-matrix) table.

### S7: Validate

```bash
pnpm test          # all tests pass
pnpm coverage      # adapt/ ≥ 95%
```

## Verification Checklist

- [ ] Path constants defined in `paths.ts`
- [ ] `ProviderId` union updated in `spec-verified.ts`
- [ ] `SPEC_VERIFIED` entry added with honest verification flags
- [ ] `CONFIGS` entry added in `resolver.ts`
- [ ] `PROVIDER_IDS` array updated in `providers/index.ts`
- [ ] Unit tests added and passing in `resolver.test.ts`
- [ ] README provider matrix updated
- [ ] `pnpm coverage` ≥ 95% on adapt/
- [ ] All unverified artifact cells produce skip-and-log (not guesses)

## Common Patterns

### Home-rooted provider (like Codex)
Some providers install to `$HOME` regardless of scope:

```ts
function myProviderBase(kind: ArtifactKind, ctx: ResolverCtx): string {
  if (kind === "rules") return pickBase(ctx);
  return ctx.home;
}
```

### Provider with no agent/command support
Set `agentPath: null` and `commandPath: null` in the config, and mark those cells `false` in `spec-verified.ts`.

### Provider using AGENTS.md block merging
Set `rulesMode: "agents-md"` and `rulePath: null`. Rules will be merged into the project's `AGENTS.md` via the install system's block-merge logic.
