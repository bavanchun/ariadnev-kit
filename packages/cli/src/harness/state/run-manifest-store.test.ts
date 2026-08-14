import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateRunEventContext } from "../events/event-types.js";
import { createRunManifestStore, type RunManifestV1 } from "./run-manifest-store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "vcskill-run-manifest-"));
  roots.push(root);
  const runDirectory = join(root, "run");
  const store = createRunManifestStore({ runDirectory });
  const context = validateRunEventContext({
    runId: "run.manifest-test",
    graph: { id: "read-only-delivery", digest: "a".repeat(64) },
    versions: { graph: "1.0.0", runner: "1.0.0", nodeAttempt: "1.0.0", idempotency: "1.0.0" },
  });
  const manifest: RunManifestV1 = Object.freeze({
    schemaVersion: 1,
    runId: context.runId,
    workflow: "read-only-delivery",
    runtime: "codex",
    runtimeVersion: "0.147.0",
    model: "fixture",
    context,
    instructionDigest: `sha256:${"b".repeat(64)}`,
    workspaceDigest: `sha256:${"c".repeat(64)}`,
    createdAt: "2026-08-08T13:00:00.000Z",
  });
  return { root, runDirectory, store, manifest };
}

describe("run manifest store", () => {
  it("requires an absolute store path and reports missing control records", () => {
    expect(() => createRunManifestStore({ runDirectory: "relative/run" })).toThrow(/absolute/i);
    const current = fixture();
    expect(() => current.store.read()).toThrow(/does not exist/i);
    expect(current.store.cancellationRequested()).toBe(false);
  });

  it("records immutable private runtime identity without raw workspace data", () => {
    const current = fixture();
    current.store.record(current.manifest);
    expect(current.store.read()).toEqual(current.manifest);
    expect(statSync(join(current.runDirectory, "manifest.json")).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(current.runDirectory, "manifest.json"), "utf8")).not.toContain(current.root);
    expect(() => current.store.record(current.manifest)).toThrow(/already exists/i);
  });

  it("makes cancellation idempotent and fails closed on tampering", () => {
    const current = fixture();
    current.store.record(current.manifest);
    current.store.requestCancellation("2026-08-08T13:01:00.000Z");
    const path = join(current.runDirectory, "cancel-request.json");
    const original = readFileSync(path, "utf8");
    current.store.requestCancellation("2026-08-08T13:02:00.000Z");
    expect(readFileSync(path, "utf8")).toBe(original);
    expect(current.store.cancellationRequested()).toBe(true);
    writeFileSync(path, original.replace("13:01", "13:09"));
    expect(() => current.store.cancellationRequested()).toThrow(/seal|match/i);
  });

  it("validates manifest identity and bounded metadata before persistence", () => {
    const mismatched = fixture();
    expect(() => mismatched.store.record({
      ...mismatched.manifest,
      context: { ...mismatched.manifest.context, runId: "run.another" },
    })).toThrow(/another run/i);

    const unbounded = fixture();
    expect(() => unbounded.store.record({ ...unbounded.manifest, runtimeVersion: "bad\nversion" })).toThrow(/bounded/i);

    const invalidTimestamp = fixture();
    expect(() => invalidTimestamp.store.record({ ...invalidTimestamp.manifest, createdAt: "2026-08-08" })).toThrow(/canonical ISO/i);

    const invalidContract = fixture();
    expect(() => invalidContract.store.record({
      ...invalidContract.manifest,
      schemaVersion: 2,
    } as unknown as RunManifestV1)).toThrow(/contract/i);
  });

  it("fails closed on malformed or unsealed persisted manifests", () => {
    const malformed = fixture();
    malformed.store.record(malformed.manifest);
    writeFileSync(join(malformed.runDirectory, "manifest.json"), "null\n");
    expect(() => malformed.store.read()).toThrow(/envelope/i);

    const missingSeal = fixture();
    missingSeal.store.record(missingSeal.manifest);
    writeFileSync(join(missingSeal.runDirectory, "manifest.json"), JSON.stringify({ manifest: missingSeal.manifest }));
    expect(() => missingSeal.store.read()).toThrow(/envelope/i);

    const tampered = fixture();
    tampered.store.record(tampered.manifest);
    const path = join(tampered.runDirectory, "manifest.json");
    writeFileSync(path, readFileSync(path, "utf8").replace("read-only-delivery", "bugfix-delivery"));
    expect(() => tampered.store.read()).toThrow(/seal|match/i);
  });

  it("fails closed on malformed cancellation records and supports extracted methods", () => {
    const malformed = fixture();
    writeFileSync(join(malformed.runDirectory, "cancel-request.json"), "[]\n");
    expect(() => malformed.store.cancellationRequested()).toThrow(/invalid/i);

    const invalidEnvelope = fixture();
    writeFileSync(join(invalidEnvelope.runDirectory, "cancel-request.json"), JSON.stringify({ request: null, seal: "sha256:invalid" }));
    expect(() => invalidEnvelope.store.cancellationRequested()).toThrow(/invalid/i);

    const invalidContract = fixture();
    writeFileSync(join(invalidContract.runDirectory, "cancel-request.json"), JSON.stringify({
      request: { schemaVersion: 2, requestedAt: "2026-08-08T13:01:00.000Z" },
      seal: "sha256:invalid",
    }));
    expect(() => invalidContract.store.cancellationRequested()).toThrow(/contract/i);

    const extracted = fixture();
    const requestCancellation = extracted.store.requestCancellation;
    requestCancellation("2026-08-08T13:01:00.000Z");
    requestCancellation("2026-08-08T13:02:00.000Z");
    expect(extracted.store.cancellationRequested()).toBe(true);
  });
});
