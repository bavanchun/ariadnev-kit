import { createHash } from "node:crypto";
import { closeSync, lstatSync, openSync, readSync, readdirSync, readlinkSync, watch, type FSWatcher } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import type { FixtureCopyV1 } from "./fixture-catalog.js";
import { observeActions, observeMetrics, observeRouting, observeTrajectory, type MetricObservationV1, type RunObservationV1 } from "./run-observation.js";
import type { RunContextV1 } from "./run-context.js";
import { getScenarioCase, type ScenarioV1 } from "./scenario-types.js";

type Snapshot = Map<string, string>;
const MAX_OBSERVED_FILE_BYTES = 16 * 1024 * 1024;
const MAX_WATCHED_DIRECTORIES = 2_048;

export interface BehavioralObserverSummary {
  readonly observations: readonly RunObservationV1[];
  readonly metricObservation: MetricObservationV1;
  readonly workspaceMutations: number;
  readonly pathViolations: number;
  readonly observationGaps: readonly string[];
}

export interface BehavioralObserver {
  ready(): Promise<void>;
  finish(): Promise<BehavioralObserverSummary>;
}

function fileDigest(path: string, bytes: number): string {
  if (bytes > MAX_OBSERVED_FILE_BYTES) return `oversize:${bytes}`;
  const hash = createHash("sha256");
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  try {
    for (;;) {
      const read = readSync(descriptor, buffer, 0, buffer.length, null);
      if (read === 0) break;
      hash.update(buffer.subarray(0, read));
    }
    return `file:${hash.digest("hex")}`;
  } finally {
    closeSync(descriptor);
  }
}

function isGone(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

function snapshot(root: string, directory = root, out: Snapshot = new Map()): Snapshot {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    const key = relative(root, path).split(sep).join("/");
    // An entry listed by readdir can be gone by the time it is stat'ed or
    // opened: git runs `maintenance --auto` in the background after commits
    // inside the copied workspace, and its `.git/objects/maintenance.lock`
    // exists for milliseconds. A snapshot taken an instant later would not
    // have seen it, so that is what this one records. The watcher, not the
    // snapshot, is what catches writes that come and go mid-run.
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) out.set(key, `link:${readlinkSync(path)}`);
      else if (stat.isDirectory()) {
        out.set(key, "directory");
        snapshot(root, path, out);
      } else if (stat.isFile()) out.set(key, fileDigest(path, stat.size));
      else out.set(key, "special");
    } catch (error) {
      if (!isGone(error)) throw error;
      out.delete(key);
    }
  }
  return out;
}

function changed(before: Snapshot, after: Snapshot, include: (path: string) => boolean): string[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((key) => include(key) && before.get(key) !== after.get(key)).sort();
}

function isWorkspace(path: string): boolean {
  return path === "workspace" || path.startsWith("workspace/");
}

function watchDirectoryTree(
  root: string,
  onEvent: (path: string) => void,
  onFailure: () => void,
): () => void {
  const watchers = new Map<string, FSWatcher>();
  let closed = false;
  const register = (directory: string): void => {
    if (closed || watchers.has(directory)) return;
    if (watchers.size >= MAX_WATCHED_DIRECTORIES) {
      onFailure();
      return;
    }
    let watcher: FSWatcher;
    try {
      watcher = watch(directory, (_event, filename) => {
        if (filename === null) {
          onFailure();
          return;
        }
        const candidate = join(directory, String(filename));
        const path = relative(root, candidate).split(sep).join("/");
        if (!path || path.startsWith("../") || isAbsolute(path)) {
          onFailure();
          return;
        }
        onEvent(path);
        try {
          if (lstatSync(candidate).isDirectory()) registerTree(candidate);
        } catch {
          // A delete/rename is already represented by the parent directory event.
        }
      });
      watcher.on("error", onFailure);
      watchers.set(directory, watcher);
    } catch {
      onFailure();
      return;
    }
    try {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.isSymbolicLink()) registerTree(join(directory, entry.name));
      }
    } catch {
      onFailure();
    }
  };
  const registerTree = (directory: string): void => register(directory);
  registerTree(root);
  return () => {
    closed = true;
    for (const watcher of watchers.values()) watcher.close();
    watchers.clear();
  };
}

export function createBehavioralObserver(input: {
  run: RunContextV1;
  fixture: FixtureCopyV1;
  scenario: ScenarioV1;
  caseId: string;
  allowedSkills: string[];
}): BehavioralObserver {
  const before = snapshot(input.fixture.containerRoot);
  const testCase = getScenarioCase(input.scenario, input.caseId);
  const workspaceEvents = new Set<string>();
  const outsideEvents = new Set<string>();
  let watcherFailed = false;
  let eventVersion = 0;
  const closeWatcher = watchDirectoryTree(
    input.fixture.containerRoot,
    (path) => {
      eventVersion += 1;
      (isWorkspace(path) ? workspaceEvents : outsideEvents).add(path);
    },
    () => { watcherFailed = true; },
  );
  const ready = new Promise<void>((resolve) => {
    setTimeout(() => {
      workspaceEvents.clear();
      outsideEvents.clear();
      resolve();
    }, 25);
  });
  let finished = false;
  return Object.freeze({
    ready: () => ready,
    async finish(): Promise<BehavioralObserverSummary> {
      if (finished) throw new Error("behavioral observer can only finish once");
      finished = true;
      await ready;
      const version = eventVersion;
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (version !== eventVersion) await new Promise((resolve) => setTimeout(resolve, 10));
      closeWatcher();
      const after = snapshot(input.fixture.containerRoot);
      const workspace = changed(before, after, isWorkspace);
      const outside = changed(before, after, (path) => !isWorkspace(path));
      const workspaceChanges = new Set([...workspace, ...workspaceEvents]);
      const outsideChanges = new Set([...outside, ...outsideEvents]);
      const unsafeEntries = [...after.entries()].filter(([path, value]) =>
        isWorkspace(path) && (value.startsWith("link:") || value.startsWith("oversize:") || value === "special"));
      const watched = testCase.expected.safety.forbiddenActions;
      const forbidden: string[] = [];
      if (workspaceChanges.size > 0 && watched.includes("workspace.write")) forbidden.push("workspace.write");
      if (outsideChanges.size > 0 && watched.includes("workspace.unscoped-write")) forbidden.push("workspace.unscoped-write");
      const observableActions = new Set(["workspace.write", "workspace.unscoped-write"]);
      const actionsComplete = watched.every((action) => observableActions.has(action)) && !watcherFailed;
      const trajectoryLabels = Object.keys(testCase.expected.trajectory?.labels ?? {});
      const labels = workspaceChanges.size > 0 && trajectoryLabels.includes("workspace.mutated") ? ["workspace.mutated"] : [];
      const gaps = ["routing.runtime-events", "trajectory.runtime-events"];
      if (!actionsComplete) gaps.push("actions.external-events");
      if (watcherFailed) gaps.push("actions.path-watch-unavailable");
      return Object.freeze({
        observations: Object.freeze([
          observeRouting({ run: input.run, source: "harness", complete: false, selectedSkills: [], allowedSkills: input.allowedSkills }),
          observeActions({ run: input.run, source: "harness", complete: actionsComplete, forbiddenActions: forbidden, violations: forbidden.length, watchedActions: watched }),
          observeTrajectory({ run: input.run, source: "harness", complete: false, labels, eventCount: labels.length, allowedLabels: trajectoryLabels }),
        ]),
        metricObservation: observeMetrics({
          run: input.run,
          source: "harness",
          metrics: { contextChars: Buffer.byteLength(testCase.prompt, "utf8") },
        }),
        workspaceMutations: workspaceChanges.size,
        pathViolations: outsideChanges.size + unsafeEntries.length,
        observationGaps: Object.freeze(gaps),
      });
    },
  });
}
