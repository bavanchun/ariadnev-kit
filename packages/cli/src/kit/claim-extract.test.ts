import { describe, expect, it } from "vitest";
import { extractClaims } from "./claim-extract.js";

describe("extractClaims", () => {
  it("extracts normative lines, numbered steps, and rule-shaped bullets", () => {
    const source = `Intro prose.

Agents MUST validate input.
1. Read the request.
- **Safety:** Never print a secret.
- Ordinary supporting detail.
`;
    expect(extractClaims(source)).toEqual([
      "agents must validate input.",
      "read the request.",
      "safety: never print a secret.",
    ]);
  });

  it("ignores prose and fenced examples", () => {
    const source = `This paragraph explains context.

\`\`\`markdown
1. This is an example only.
Agents MUST not extract this.
\`\`\`
`;
    expect(extractClaims(source)).toEqual([]);
  });

  it("ignores leading frontmatter and headings that only label normative content", () => {
    const source = `---
description: Agents MUST run this example.
---

## Rules You Should Always Follow

Supporting prose.
`;
    expect(extractClaims(source)).toEqual([]);
  });

  it("ignores a document whose leading frontmatter never closes", () => {
    expect(extractClaims("---\ndescription: Agents MUST run this example.\n")).toEqual([]);
  });

  it("normalizes markdown and deduplicates stably", () => {
    const source = `- **Rule:** Use [official docs](https://example.com) ALWAYS.
- **Rule:** Use [official docs](https://example.com) ALWAYS.
`;
    expect(extractClaims(source)).toEqual(["rule: use official docs always."]);
    expect(extractClaims(source)).toEqual(extractClaims(source));
  });

  it("groups one contiguous numbered procedure without treating example labels as rules", () => {
    const source = `1. Inspect the input.
2. Validate the boundary.
3. Return the result.

- **Normal scale:** This is example context.
- **Reveals:** Another observation.
`;
    expect(extractClaims(source)).toEqual([
      "inspect the input. → validate the boundary. → return the result.",
    ]);
  });
});
