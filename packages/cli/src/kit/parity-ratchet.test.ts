import { describe, expect, it } from "vitest";
import { commandSurface } from "../cli/command-surface.js";
import { PARITY } from "../cli/contract-command.js";
import { excluded, inScope, missingCommands, readParityManifest } from "./parity-manifest.js";

// The gap between what upstream 2.14.0 exposes and what `av` registers, measured
// on every run and allowed only to shrink.
//
// It exists from the first phase rather than the last on purpose. Phase 13's
// audit rests on the claim that the missing count has been visible and
// monotonically decreasing all along; a count that only appears at the end is
// not a ratchet, it is a surprise, and it arrives during a release cut.
//
// Seeded at the phase 1 measurement. Every phase that closes a gap lowers it in
// the same commit — the test below says so out loud when you forget.
const MISSING_CEILING = 13;

/** Top-level command names Commander actually has, aliases and `help` aside. */
function registeredNames(): string[] {
  return [...commandSurface().subcommands.keys()].filter((name) => name !== "help");
}

describe("parity ratchet", () => {
  it("registers no fewer in-scope commands than the ceiling allows", () => {
    const missing = missingCommands(readParityManifest(), registeredNames());
    expect(missing.length).toBeLessThanOrEqual(MISSING_CEILING);
  });

  it("has a ceiling that matches what is actually missing", () => {
    // Not redundant with the assertion above: `<=` alone lets the ceiling drift
    // above the real number, and a ratchet with slack in it ratchets nothing.
    const missing = missingCommands(readParityManifest(), registeredNames());
    expect(
      missing.length,
      `${MISSING_CEILING - missing.length} gap(s) closed since the ceiling was last set — ` +
        `lower MISSING_CEILING to ${missing.length} in this commit. Still missing: ${missing.join(", ")}`,
    ).toBe(MISSING_CEILING);
  });

  it("carries the whole captured surface", () => {
    const manifest = readParityManifest();
    // A truncated recapture would look like progress: fewer names, fewer gaps.
    expect(manifest.commands.length).toBe(42);
    expect(manifest.upstreamVersion).toBe("2.14.0");
    expect(inScope(manifest).length + excluded(manifest).length).toBe(manifest.commands.length);
  });

  it("keeps the phase that owns each unbuilt command", () => {
    // `phase` was written once and then silently dropped by the next recapture,
    // because the capture script's merge only preserved three fields by name.
    // Nothing noticed until a review read the type and then the JSON.
    const manifest = readParityManifest();
    const unbuilt = missingCommands(manifest, registeredNames());
    for (const command of inScope(manifest)) {
      if (!unbuilt.includes(command.target as string)) continue;
      expect(command.phase, `${command.name} is unbuilt and names no phase`).toEqual(expect.any(Number));
    }
  });

  it("gives every in-scope command a target and every excluded one a reason", () => {
    const manifest = readParityManifest();
    for (const command of inScope(manifest)) {
      expect(command.target, `${command.name} is in scope with no target`).toBeTruthy();
    }
    for (const command of excluded(manifest)) {
      expect(command.target, `${command.name} is excluded but names a target`).toBeNull();
      expect(command.note.length, `${command.name} is excluded with no reason`).toBeGreaterThan(20);
    }
  });
});

describe("what `av contract --json` reports", () => {
  // The envelope carries four numbers rather than the manifest, because the
  // shipped binary has no repository to read one from. These assertions are what
  // stop that projection from becoming a second opinion.
  const manifest = readParityManifest();
  const missing = missingCommands(manifest, registeredNames());

  it("matches the manifest and the live surface", () => {
    expect(PARITY.upstreamVersion).toBe(manifest.upstreamVersion);
    expect(PARITY.inScope).toBe(inScope(manifest).length);
    expect(PARITY.missing).toBe(missing.length);
    expect(PARITY.registered).toBe(inScope(manifest).length - missing.length);
  });

  it("adds up", () => {
    expect(PARITY.registered + PARITY.missing).toBe(PARITY.inScope);
  });
});

// WHAT THIS RATCHET DOES NOT MEASURE. It compares top-level names only, so
// `run` and `update` already count among the registered 14 while meaning
// something other than their upstream namesakes — the manifest's own notes say
// so. Reaching zero here is therefore necessary for parity and not sufficient
// for it. The manifest already stores upstream subcommand lists that nothing
// reads yet; phase 13's audit is where they have to start being compared, and
// it must not cite "missing = 0" as behavioural parity on its own.

describe("the excluded set is frozen", () => {
  // Written here rather than read from the manifest, so a later phase cannot
  // improve the parity number by reclassifying a command instead of building it.
  // Changing this list is a reviewable change to a test, which is the point.
  const FROZEN = ["codex-agent-runtime", "help", "licenses", "login", "logout", "whoami"];

  it("excludes exactly the six names this plan decided to exclude", () => {
    expect(excluded(readParityManifest()).map((command) => command.name).sort()).toEqual(FROZEN);
  });

  it("keeps the stated non-goals out of scope", () => {
    // The plan's non-goals, restated as an assertion: auth and licensing.
    const targets = new Set(inScope(readParityManifest()).map((command) => command.name));
    for (const name of ["login", "logout", "whoami", "licenses"]) {
      expect(targets.has(name), `${name} is a stated non-goal and drifted into scope`).toBe(false);
    }
  });
});
