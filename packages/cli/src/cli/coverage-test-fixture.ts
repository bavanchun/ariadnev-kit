import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Write a valid one-skill kit that carries no `claims[]` array,
 * exercising the "no tracked claims" not-applicable path in runCoverage. */
export function writeNoClaimsCoverageFixture(root: string, slug = "unclaimed"): void {
  const skillDir = join(root, "skills", slug);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---
name: vc:${slug}
description: Use when exercising the coverage no-claims fixture path in the strict runner.
---

# Unclaimed

## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`,
  );
  writeFileSync(
    join(root, "decisions.json"),
    JSON.stringify({
      schema_version: 1,
      skills: {
        [slug]: {
          pinned_at: "2026-08-06",
        },
      },
    }),
  );
}

/** Write a valid one-skill kit whose single tracked claim is unclassified. */
export function writeUnclassifiedCoverageFixture(root: string, slug = "fixture"): void {
  const skillDir = join(root, "skills", slug);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---
name: vc:${slug}
description: Use when exercising strict claim coverage with an isolated unclassified fixture.
---

# Fixture

## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`,
  );
  writeFileSync(
    join(root, "decisions.json"),
    JSON.stringify({
      schema_version: 1,
      skills: {
        [slug]: {
          pinned_at: "2026-08-06",
          claims: [{ id: "c001", text: "preserve fixture behavior", status: "unclassified" }],
        },
      },
    }),
  );
}
