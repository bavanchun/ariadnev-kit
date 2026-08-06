import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURE_DIGEST = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

/** Write a valid one-skill kit whose single tracked claim is unclassified. */
export function writeUnclassifiedCoverageFixture(root: string, slug = "fixture"): void {
  const skillDir = join(root, "skills", slug);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---
name: vc:${slug}
description: Use when exercising strict claim coverage with an isolated unclassified fixture.
metadata:
  upstream: "ak:${slug}"
  upstream_version: "1.0.0"
  upstream_digest: "${FIXTURE_DIGEST}"
  upstream_relation: "distill"
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
    join(root, "distill-decisions.json"),
    JSON.stringify({
      schema_version: 1,
      skills: {
        [slug]: {
          upstream: `ak:${slug}`,
          upstream_version: "1.0.0",
          upstream_digest: FIXTURE_DIGEST,
          upstream_relation: "distill",
          pinned_at: "2026-08-06",
          claims: [{ id: "c001", text: "preserve fixture behavior", status: "unclassified" }],
        },
      },
    }),
  );
}
