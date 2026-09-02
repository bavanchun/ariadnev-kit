import { describe, expect, it } from "vitest";
import { adaptShared, adaptSharedText } from "./shared-adaptation.js";
import { adaptArtifact } from "./adapt.js";
import type { Artifact } from "../kit/kit-types.js";

function artifact(body: string, frontmatter: Record<string, unknown> = {}): Artifact {
  return { type: "skill", name: "demo", frontmatter, body, raw: body, sourcePath: "/kit/demo/SKILL.md" };
}

describe("adaptShared", () => {
  it("keeps canonical tool names instead of one provider's rewrite", () => {
    const body = "Ask with AskUserQuestion and track with TodoWrite.";
    const codex = adaptArtifact(artifact(body), "codex");
    const shared = adaptShared(artifact(body), ["codex", "cursor"]);

    expect(codex).toContain("request_user_input");
    expect(shared).toContain("AskUserQuestion");
    expect(shared).not.toContain("request_user_input\n"); // only inside the footer
  });

  it("rewrites paths to the neutral layout the shared root actually is", () => {
    const shared = adaptShared(artifact("See .claude/skills/av-demo/SKILL.md. Uses TodoWrite."), ["cursor", "omp"]);
    expect(shared).toContain(".agents/skills/av-demo/SKILL.md");
    expect(shared).not.toContain(".claude/skills/");
  });

  it("names every provider that reads the file, in a stable order", () => {
    const a = adaptShared(artifact("Uses TodoWrite."), ["omp", "codex", "cursor"]);
    const b = adaptShared(artifact("Uses TodoWrite."), ["codex", "cursor", "omp"]);
    expect(a).toBe(b);
    expect(a).toContain("read by: codex, cursor, omp");
  });

  it("tells a provider with no verified mapping to use its own tool names", () => {
    expect(adaptShared(artifact("Uses TodoWrite."), ["omp"])).toContain("No verified tool mapping");
  });

  it("adds no footer to a file that never mentions a tool", () => {
    const shared = adaptShared(artifact("Prose only."), ["codex", "cursor"]);
    expect(shared).not.toContain("Multi-provider Compatibility");
  });

  it("preserves frontmatter", () => {
    const shared = adaptShared(artifact("Uses TodoWrite.", { name: "demo" }), ["codex", "omp"]);
    expect(shared.startsWith("---\nname: demo\n---")).toBe(true);
  });
});

describe("adaptSharedText", () => {
  it("applies the neutral path rewrite and no tool rewrite", () => {
    expect(adaptSharedText("run .claude/scripts/x.sh with TodoWrite")).toBe(
      "run .agents/scripts/x.sh with TodoWrite",
    );
  });
});
