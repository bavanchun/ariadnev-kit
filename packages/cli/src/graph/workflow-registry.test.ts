import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { KitValidationError, loadKit } from "../kit/load-kit.js";

const here = dirname(fileURLToPath(import.meta.url));
const kitRoot = join(here, "..", "..", "..", "..", "kit");
const workflowRoot = join(kitRoot, "workflows");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("kit workflow registry", () => {
  it("loads three canonical workflows separately from installable artifacts", () => {
    const kit = loadKit(kitRoot);
    expect(kit.workflows.map((workflow) => workflow.name).sort()).toEqual([
      "bugfix-delivery",
      "read-only-delivery",
      "safe-change-delivery",
    ]);
    expect(kit.workflows.every((workflow) => workflow.graph.schemaVersion === 1)).toBe(true);
  });

  it("rejects a workflow whose skill handler is absent from the kit registry", () => {
    const root = mkdtempSync(join(tmpdir(), "ariadnev-workflow-registry-"));
    roots.push(root);
    mkdirSync(join(root, "skills"), { recursive: true });
    mkdirSync(join(root, "workflows", "schema"), { recursive: true });
    writeFileSync(
      join(root, "workflows", "schema", "workflow.schema.json"),
      readFileSync(join(workflowRoot, "schema", "workflow.schema.json"), "utf8"),
    );
    const graph = JSON.parse(readFileSync(join(workflowRoot, "read-only-delivery.json"), "utf8")) as {
      nodes: Array<{ type: string; handler: { ref: string } }>;
    };
    graph.nodes.find((node) => node.type === "skill")!.handler.ref = "missing-skill";
    writeFileSync(join(root, "workflows", "read-only-delivery.json"), JSON.stringify(graph));
    expect(() => loadKit(root)).toThrow(KitValidationError);
    expect(() => loadKit(root)).toThrow(/unknown skill handler/);
  });

  it("rejects a workflow directory that escapes the kit through a symlink", () => {
    const root = mkdtempSync(join(tmpdir(), "ariadnev-workflow-symlink-"));
    roots.push(root);
    mkdirSync(join(root, "skills"), { recursive: true });
    symlinkSync(workflowRoot, join(root, "workflows"), "dir");
    expect(() => loadKit(root)).toThrow(/workflows: must be a regular directory/);
  });
});
