# Second read — Tier B batch 2 (`7b72333`)

**Date:** 2026-08-29 15:05 ICT. **Reader:** fresh general-purpose agent, no
authoring context. **Scope:** `orchestrate`, `shopify`, `ui-styling`,
`web-frameworks` — the batch whose commit message records no review evidence.

**Verdict:** ACCEPT WITH FIXES on all four. Every fix below is applied.

## The notable result: zero fabricated claims

Every CLI command, flag, script behaviour, reference path, and `av:<slug>` in
the four files was checked against the real thing and held. That includes the
claims most likely to have rotted: `shopify app config validate` (new in this
trim, and real), `pnpm create next-app --yes` (real), the `turbo.json` snippet
against a live `turborepo.dev/schema.json` fetch, and four legacy-script
warnings traced to the pinned lines in the scripts themselves.

**This batch's weakness is deletion, not fabrication** — the opposite of the
`journal` escapes found the same day. Two different failure modes, so a reader
brief tuned for one will miss the other.

## Defects found and fixed

**1. Frontmatter stripped to `name` + `description` in all four files.**
The trim deleted `user-invocable`, `when_to_use`, `category`, `keywords`,
`argument-hint`, `license`, and `metadata.*`. Not decorative:

- `catalog/catalog-entries.ts:129` — `category` and `keywords` are members of
  the catalog **search haystack**. These four were findable by name and
  description text only.
- `release/docs-bundle-projector.ts:61-73` — `when_to_use`, `category`,
  `keywords`, `user-invocable`, `argument-hint` all project into the released
  docs bundle.
- `adapt/command-map.ts:40`, `adapt/frontmatter.ts:76-77` — `argument-hint` is
  rewritten per provider.

`av validate` is blind to it: `skill-lint.ts:38-55` is an allowlist, so a
misspelled field errors and an absent one passes.

Restored on all four, keeping the burn-down's new descriptions — those were
legitimate work, the rest was collateral.

**Blast radius checked and bounded.** Nine of 105 skills lack `category`; the
other five (`common`, `document-skills`, `help`,
`obsidian-second-brain-note`, `pm`) never had one. The strip was confined to
this batch, not a burn-down-wide pattern.

**2. `<run-dir>` became an undefined placeholder across five files.**
`job-spec.md:109,144`, `harness-profiles.md:9`, `internal-routing.md:16`,
`model-routing.md:35`, `runtime-matrix.md:32` all instruct writing to
`<run-dir>/…`. The deleted `## Output Layout` section was its only definition.
Restored under `## Output format`, naming `<run-dir>` explicitly so the
references resolve.

**3. Dangling metrics obligation.** `harness-profiles.md:112` still requires
cross-run metrics as advisory evidence; the file holding them
(`orchestrate-history.jsonl`) had been deleted with the layout. Restored with
the layout, and the dependency stated where it is produced rather than left
implicit.

**4. Next.js release-channel guidance dropped from its only source.**
`grep` over the skill's references confirmed nothing survived. Restored as
`## Release channels`.

**5. `shadcn --help` (nit, fixed).** The skill's own flow invokes the CLI as
`pnpm dlx shadcn@latest`, so a bare `shadcn` never resolves. Same class as the
`journal` escapes — an invocation a reader would run and watch fail.

## Not acted on

- **`redundant` — one `## Quality gates` per skill**, each ≥75% checklist
  restatement of text above it, with per-line provenance in the reader's
  transcript. Listed, not counted, per the taxonomy. `## Output format` is
  *not* filler in any of the four.
- Two prose nits (shopify's Related entries naming capabilities rather than
  `av:deploy` / `av:backend-development`).
- `kit/skills/shopify/README.md:7` indexes a file that does not exist —
  pre-existing, untouched by this commit.

## Unresolved questions

- Should `skill-lint` require `category` and `keywords`, given both feed
  catalog search and neither absence is currently detectable? Nine skills
  would need entries before the rule could land.
