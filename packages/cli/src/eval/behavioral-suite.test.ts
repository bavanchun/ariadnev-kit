import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadEvidenceVocabulary } from "./evidence-vocabulary.js";
import { runBehavioralSuite } from "./behavioral-suite.js";

const digest = `sha256:${"b".repeat(64)}`;
const root = process.cwd();

describe("runBehavioralSuite", () => {
  it("covers every skill case and golden task without paid providers", async () => {
    const launch = vi.fn(async () => ({ kind: "completed" as const, output: "synthetic answer" }));
    const result = await runBehavioralSuite({
      scenarioDirectories: [
        join(root, "evals/scenarios/skills"),
        join(root, "evals/scenarios/golden"),
      ],
      catalogPath: join(root, "evals/fixtures/catalog.json"),
      vocabulary: loadEvidenceVocabulary(join(root, "evals/vocabulary/evidence-v1.json")),
      identity: {
        kit: { version: "0.10.0", digest },
        skills: Array.from({ length: 26 }, (_, index) => ({ id: `vc:skill-${index}`, version: "1.0.0", digest })),
        runtime: { provider: "probe", version: "1.0.0", model: "deterministic" },
        evaluator: { version: "1.0.0" },
      },
      variant: "vcskill",
      availableCapabilities: [],
      timeoutMs: 500,
      skillRepeats: 1,
      deepRepeats: 1,
      concurrency: 8,
      launcher: { launch },
    });

    expect(result.population).toEqual({ skillScenarios: 26, skillCells: 52, deepTasks: 14, runs: 66 });
    expect(result.report.cells).toHaveLength(66);
    expect(result.report.cells.every((cell) =>
      cell.comparison.status === "not-comparable"
      && cell.comparison.reason === "trusted-observation-source-unavailable")).toBe(true);
    expect(result.runs).toHaveLength(66);
    expect(result.runs.every((run) => !Object.hasOwn(run, "output"))).toBe(true);
    expect(launch.mock.calls.length).toBeGreaterThan(0);
    expect(launch.mock.calls.length).toBeLessThan(66); // capability-preflight N/A cells never launch
  }, 15_000);

  it("retains all declared repeats instead of selecting a best run", async () => {
    const result = await runBehavioralSuite({
      scenarioDirectories: [join(root, "evals/scenarios/skills")],
      catalogPath: join(root, "evals/fixtures/catalog.json"),
      vocabulary: loadEvidenceVocabulary(join(root, "evals/vocabulary/evidence-v1.json")),
      identity: {
        kit: { version: "0.10.0", digest },
        skills: [],
        runtime: { provider: "probe", version: "1.0.0", model: "deterministic" },
        evaluator: { version: "1.0.0" },
      },
      variant: "agentkit",
      availableCapabilities: [],
      timeoutMs: 500,
      skillRepeats: 3,
      deepRepeats: 1,
      concurrency: 8,
      launcher: { launch: async () => ({ kind: "completed", output: "answer" }) },
    });
    expect(result.population).toMatchObject({ skillCells: 52, runs: 156 });
    expect(new Set(result.runs.filter((run) => run.cellId === "skill.ask.routing:positive").map((run) => run.repeat)))
      .toEqual(new Set([1, 2, 3]));
  }, 15_000);

  it("bounds parallel workers while preserving deterministic result order", async () => {
    let active = 0;
    let maximum = 0;
    const launch = async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { kind: "completed" as const, output: "answer" };
    };
    const result = await runBehavioralSuite({
      scenarioDirectories: [join(root, "evals/scenarios/skills")],
      catalogPath: join(root, "evals/fixtures/catalog.json"),
      vocabulary: loadEvidenceVocabulary(join(root, "evals/vocabulary/evidence-v1.json")),
      identity: {
        kit: { version: "0.10.0", digest }, skills: [],
        runtime: { provider: "probe", version: "1.0.0", model: "deterministic" },
        evaluator: { version: "1.0.0" },
      },
      variant: "vcskill", availableCapabilities: [], timeoutMs: 500,
      skillRepeats: 1, deepRepeats: 1, concurrency: 2, launcher: { launch },
    });
    expect(maximum).toBe(2);
    expect(result.runs.slice(0, 2).map((run) => run.cellId)).toEqual([
      "skill.ask.routing:positive",
      "skill.ask.routing:negative",
    ]);
  }, 15_000);
});
