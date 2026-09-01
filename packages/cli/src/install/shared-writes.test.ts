import { describe, expect, it } from "vitest";
import { reconcileSharedWrites, renderSharedSummary, type ProviderPlan } from "./shared-writes.js";
import type { Artifact } from "../kit/kit-types.js";
import type { WriteOp } from "./install-types.js";

function artifact(body: string): Artifact {
  const raw = `---\nname: demo\n---\n${body}`;
  return { type: "skill", name: "demo", frontmatter: { name: "demo" }, body, raw, sourcePath: "/kit/demo/SKILL.md" };
}

function write(dest: string, content: string, source?: WriteOp["source"]): WriteOp {
  return { action: "write", kind: "skill", name: "demo", dest, content, ...(source ? { source } : {}) };
}

function contentAt(plan: ProviderPlan, dest: string): string {
  const op = plan.ops.find((o): o is WriteOp => o.action === "write" && o.dest === dest);
  return String(op?.content);
}

describe("reconcileSharedWrites", () => {
  it("gives every provider sharing a path the same neutral body", () => {
    const source = { artifact: artifact("Use AskUserQuestion, then read .claude/skills/x.") };
    const plans: ProviderPlan[] = [
      { id: "codex", ops: [write("/h/.agents/skills/av-demo/SKILL.md", "codex flavour", source)] },
      { id: "cursor", ops: [write("/h/.agents/skills/av-demo/SKILL.md", "cursor flavour", source)] },
      { id: "omp", ops: [write("/h/.agents/skills/av-demo/SKILL.md", "omp flavour", source)] },
    ];

    const resolutions = reconcileSharedWrites(plans);

    const dest = "/h/.agents/skills/av-demo/SKILL.md";
    expect(resolutions).toEqual([
      { path: dest, providers: ["codex", "cursor", "omp"], mode: "neutral" },
    ]);
    const written = plans.map((p) => contentAt(p, dest));
    expect(new Set(written).size).toBe(1);
    // Canonical tool name kept: no provider's rewrite is imposed on the others.
    expect(written[0]).toContain("AskUserQuestion");
    expect(written[0]).toContain(".agents/skills/x");
    expect(written[0]).toContain("## Multi-provider Compatibility");
    expect(written[0]).toContain("read by: codex, cursor, omp");
  });

  it("is independent of the order the providers execute in", () => {
    const source = { artifact: artifact("Uses TodoWrite.") };
    const dest = "/h/.agents/skills/av-demo/SKILL.md";
    const build = (ids: ProviderPlan["id"][]): ProviderPlan[] =>
      ids.map((id) => ({ id, ops: [write(dest, `${id} flavour`, source)] }));

    const forward = build(["codex", "cursor", "omp"]);
    const reverse = build(["omp", "cursor", "codex"]);
    reconcileSharedWrites(forward);
    reconcileSharedWrites(reverse);

    expect(contentAt(forward[0], dest)).toBe(contentAt(reverse[0], dest));
  });

  it("leaves a path alone when the providers already agree", () => {
    const source = { text: "plain" };
    const plans: ProviderPlan[] = [
      { id: "cursor", ops: [write("/h/a.md", "same", source)] },
      { id: "omp", ops: [write("/h/a.md", "same", source)] },
    ];
    expect(reconcileSharedWrites(plans)).toEqual([]);
    expect(contentAt(plans[0], "/h/a.md")).toBe("same");
  });

  it("leaves a path only one provider writes alone", () => {
    const plans: ProviderPlan[] = [{ id: "codex", ops: [write("/h/a.md", "mine", { text: "mine" })] }];
    expect(reconcileSharedWrites(plans)).toEqual([]);
  });

  it("reports last-writer when there is no canonical source to re-derive from", () => {
    const plans: ProviderPlan[] = [
      { id: "cursor", ops: [write("/h/logo.png", "cursor bytes")] },
      { id: "omp", ops: [write("/h/logo.png", "omp bytes")] },
    ];
    expect(reconcileSharedWrites(plans)).toEqual([
      { path: "/h/logo.png", providers: ["cursor", "omp"], mode: "last-writer" },
    ]);
    // Untouched: the sequence still decides, and the summary says so.
    expect(contentAt(plans[0], "/h/logo.png")).toBe("cursor bytes");
  });

  it("drops a file write aimed at a path another provider fills with a directory", () => {
    // The reported data loss: omp planned a file exactly where cursor planned a
    // directory, and the atomic write clears a directory standing in a file's
    // place — so cursor's whole agent tree went with it.
    const plans: ProviderPlan[] = [
      { id: "cursor", ops: [write("/h/.agents/skills/av-advisor/AGENT.md", "cursor agent")] },
      { id: "omp", ops: [write("/h/.agents/skills/av-advisor", "omp agent")] },
    ];

    const resolutions = reconcileSharedWrites(plans);

    expect(resolutions).toEqual([
      { path: "/h/.agents/skills/av-advisor", providers: ["omp"], mode: "collision" },
    ]);
    expect(plans[0].ops[0]).toMatchObject({ action: "write", dest: "/h/.agents/skills/av-advisor/AGENT.md" });
    expect(plans[1].ops[0]).toMatchObject({
      action: "skip",
      path: "/h/.agents/skills/av-advisor",
      reason: expect.stringContaining("directory"),
    });
  });

  it("recognises a directory collision on either path separator", () => {
    const plans: ProviderPlan[] = [
      { id: "cursor", ops: [write("C:\\h\\skills\\av-advisor\\AGENT.md", "a")] },
      { id: "omp", ops: [write("C:\\h\\skills\\av-advisor", "b")] },
    ];
    const [only] = reconcileSharedWrites(plans);
    expect(only.mode).toBe("collision");
  });
});

describe("renderSharedSummary", () => {
  it("says nothing when no path was shared", () => {
    expect(renderSharedSummary([])).toEqual([]);
  });

  it("groups by provider set and truncates the file list", () => {
    const providers: ProviderPlan["id"][] = ["codex", "cursor"];
    const lines = renderSharedSummary(
      ["a", "b", "c", "d"].map((n) => ({ path: `/h/${n}.md`, providers, mode: "neutral" as const })),
    );
    expect(lines.join("\n")).toContain("codex + cursor: 4 file(s) — written once as a neutral adaptation");
    expect(lines.join("\n")).toContain("… and 1 more");
  });

  it("names a dropped file write rather than burying it", () => {
    const lines = renderSharedSummary([{ path: "/h/x", providers: ["omp"], mode: "collision" }]);
    expect(lines.join("\n")).toContain("the file write was dropped");
  });
});
