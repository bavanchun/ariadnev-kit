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
        skills: Array.from({ length: 26 }, (_, index) => ({ id: `av:skill-${index}`, version: "1.0.0", digest })),
        runtime: { provider: "probe", version: "1.0.0", model: "deterministic" },
        evaluator: { version: "1.0.0" },
      },
      variant: "ariadnev",
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
      variant: "reference",
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
    // A gate rather than a sleep. The old version slept 5ms per launch and then
    // asserted the peak was exactly 2 — which is only true if the second worker
    // starts before the first finishes, and under a loaded machine it often does
    // not. That made a real invariant into an intermittent red build.
    //
    // Here nobody proceeds until two workers are in flight at once, so "it
    // reached the bound" is proven by the test completing at all, and "it never
    // exceeded the bound" by the assertion below. A scheduler that ran one at a
    // time would hang here and fail on the timeout, which is the correct answer.
    let active = 0;
    let maximum = 0;
    let release = (): void => {};
    const bothRunning = new Promise<void>((resolve) => {
      release = resolve;
    });
    const launch = async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      if (active >= 2) release();
      await bothRunning;
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
      variant: "ariadnev", availableCapabilities: [], timeoutMs: 500,
      skillRepeats: 1, deepRepeats: 1, concurrency: 2, launcher: { launch },
    });
    expect(maximum).toBe(2); // never more than the configured bound
    expect(result.runs.slice(0, 2).map((run) => run.cellId)).toEqual([
      "skill.ask.routing:positive",
      "skill.ask.routing:negative",
    ]);
  }, 15_000);
});
