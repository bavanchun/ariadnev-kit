import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRunStateSnapshotStore } from "./run-state-snapshot-store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    chmodSync(root, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});

describe("run state snapshot store", () => {
  it("rejects unsafe configuration and invalid sequence movement", () => {
    expect(() => createRunStateSnapshotStore({ runDirectory: "relative/run" })).toThrow(/absolute/i);
    const root = mkdtempSync(join(tmpdir(), "vcskill-run-state-"));
    roots.push(root);
    expect(() => createRunStateSnapshotStore({ runDirectory: join(root, "invalid"), maxBytes: 0 })).toThrow(/positive/i);
    const store = createRunStateSnapshotStore({ runDirectory: join(root, "run") });
    expect(() => store.write({ sequence: 0, state: {} })).toThrow(/positive/i);
    expect(() => store.read(0)).toThrow(/positive/i);
    store.write({ sequence: 1, state: {} });
    store.write({ sequence: 2, state: {} });
    expect(() => store.write({ sequence: 1, state: {} })).toThrow(/backwards/i);
  });

  it("keeps the current and previous private sequence-bound states", () => {
    const root = mkdtempSync(join(tmpdir(), "vcskill-run-state-"));
    roots.push(root);
    const store = createRunStateSnapshotStore({ runDirectory: join(root, "run") });
    store.write({ sequence: 1, state: { request: "private task" } });
    store.write({ sequence: 2, state: { request: "private task", facts: { path: "src/router.ts" } } });
    store.write({ sequence: 2, state: { request: "private task", facts: { path: "src/router-v2.ts" } } });

    expect(store.read(2)).toEqual({ request: "private task", facts: { path: "src/router-v2.ts" } });
    expect(store.read(1)).toEqual({ request: "private task" });
    expect(store.read(3)).toBeNull();
    expect(() => store.write({ sequence: 4, state: {} })).toThrow(/skip/i);
    expect(statSync(join(root, "run", "state-current.json")).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(root, "run", "state-current.json"), "utf8")).not.toContain(root);
  });

  it("refuses oversized state and tampered snapshots", () => {
    const root = mkdtempSync(join(tmpdir(), "vcskill-run-state-"));
    roots.push(root);
    const store = createRunStateSnapshotStore({ runDirectory: join(root, "run"), maxBytes: 128 });
    expect(() => store.write({ sequence: 1, state: { value: "x".repeat(500) } })).toThrow(/size|bytes/i);
    store.write({ sequence: 1, state: { value: "original" } });
    const path = join(root, "run", "state-current.json");
    writeFileSync(path, readFileSync(path, "utf8").replace("original", "tampered"));
    expect(() => store.read(1)).toThrow(/seal|match/i);
  });

  it("fails closed on malformed persisted snapshot envelopes and contracts", () => {
    const malformedRoot = mkdtempSync(join(tmpdir(), "vcskill-run-state-"));
    roots.push(malformedRoot);
    const malformed = createRunStateSnapshotStore({ runDirectory: join(malformedRoot, "run") });
    malformed.write({ sequence: 1, state: {} });
    writeFileSync(join(malformedRoot, "run", "state-current.json"), "null\n");
    expect(() => malformed.read(1)).toThrow(/must be an object/i);

    const invalidEnvelopeRoot = mkdtempSync(join(tmpdir(), "vcskill-run-state-"));
    roots.push(invalidEnvelopeRoot);
    const invalidEnvelope = createRunStateSnapshotStore({ runDirectory: join(invalidEnvelopeRoot, "run") });
    invalidEnvelope.write({ sequence: 1, state: {} });
    writeFileSync(join(invalidEnvelopeRoot, "run", "state-current.json"), JSON.stringify({ snapshot: null, seal: "sha256:invalid" }));
    expect(() => invalidEnvelope.read(1)).toThrow(/envelope/i);

    const invalidRoot = mkdtempSync(join(tmpdir(), "vcskill-run-state-"));
    roots.push(invalidRoot);
    const invalid = createRunStateSnapshotStore({ runDirectory: join(invalidRoot, "run") });
    invalid.write({ sequence: 1, state: {} });
    writeFileSync(join(invalidRoot, "run", "state-current.json"), JSON.stringify({
      snapshot: { schemaVersion: 2, sequence: 1, state: {} },
      seal: "sha256:invalid",
    }));
    expect(() => invalid.read(1)).toThrow(/contract/i);
  });
});
