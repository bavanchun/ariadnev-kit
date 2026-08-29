import { describe, expect, it } from "vitest";
import { commandSurface } from "../cli/command-surface.js";
import { DIVERGENCES, divergenceTally, subcommandGaps } from "./parity-audit.js";
import { excluded, inScope, missingCommands, readParityManifest } from "./parity-manifest.js";

const manifest = readParityManifest();
const surface = commandSurface();
const registeredNames = (): string[] => [...surface.subcommands.keys()].filter((name) => name !== "help");

describe("the name-level audit", () => {
  it("registers every in-scope name — the ratchet's zero, restated where the audit reads", () => {
    expect(missingCommands(manifest, registeredNames())).toEqual([]);
  });

  it("accounts for every captured name: registered, or excluded with a reason", () => {
    // The audit's headline claim. Nothing captured from 2.14.0 is unaccounted for.
    const accounted = new Set([...inScope(manifest).map((c) => c.name), ...excluded(manifest).map((c) => c.name)]);
    for (const command of manifest.commands) {
      expect(accounted.has(command.name), `${command.name} is in the capture and in neither set`).toBe(true);
    }
  });

  it("has a committed oracle capture behind every registered in-scope name", () => {
    // A name with no capture was never checked against the oracle, whatever the
    // ratchet says. The capture is the manifest entry: it carries the upstream
    // version it came from and the subcommand list read off `--help`.
    expect(manifest.upstreamVersion).toBe("2.14.0");
    expect(manifest.capturedAt).toBeTruthy();
    for (const command of inScope(manifest)) {
      expect(Array.isArray(command.subcommands), `${command.name} has no captured subcommand list`).toBe(true);
    }
  });
});

describe("the subcommand audit", () => {
  // WHAT THE RATCHET DOES NOT PROVE, now proven or disproven. `missing = 0` is a
  // statement about names. This compares the sets underneath them.
  const gaps = subcommandGaps(manifest, surface);

  it("has a stated reason for every subcommand difference", () => {
    const explained = new Set(DIVERGENCES.map((d) => `${d.command} ${d.subcommand}`));
    const unexplained = gaps.filter((gap) => !explained.has(`${gap.command} ${gap.subcommand}`));
    expect(
      unexplained,
      `undocumented subcommand differences — add each to DIVERGENCES with a reason: ` +
        unexplained.map((gap) => `${gap.command} ${gap.direction} ${gap.subcommand}`).join(", "),
    ).toEqual([]);
  });

  it("has no divergence row for a difference that no longer exists", () => {
    // The other direction, so the table cannot go stale by accumulating rows for
    // subcommands that were since built. A stale table reads as a bigger gap
    // than there is, which is its own kind of dishonesty.
    const real = new Set(gaps.map((gap) => `${gap.command} ${gap.subcommand}`));
    const orphaned = DIVERGENCES.filter((d) => !real.has(`${d.command} ${d.subcommand}`));
    expect(orphaned.map((d) => `${d.command} ${d.subcommand}`)).toEqual([]);
  });

  it("does not report a positional verb as missing", () => {
    // The false positive the first run produced: `av backups create` works, and
    // a Commander-subcommand-only comparison called all six of them missing.
    for (const subcommand of ["create", "list", "show", "verify", "restore", "prune"]) {
      expect(gaps.some((gap) => gap.command === "backups" && gap.subcommand === subcommand)).toBe(false);
    }
    for (const subcommand of ["install", "verify", "repair", "upgrade", "remove"]) {
      expect(gaps.some((gap) => gap.command === "skill" && gap.subcommand === subcommand)).toBe(false);
    }
  });

  it("has no unbuilt gap left, and says so as a number rather than a summary", () => {
    // This assertion was `toBeGreaterThan(0)` while nine subcommands were
    // missing, so that no report could claim parity over them. They were built
    // on 2026-08-29 and it now asserts the opposite fact. What keeps it honest
    // either way is the pair of bidirectional checks above: a new gap with no
    // row fails the first, and a row for a gap that no longer exists fails the
    // second. Neither can be satisfied by editing this number.
    expect(divergenceTally().unbuilt).toBe(0);
    expect(DIVERGENCES.filter((d) => d.kind === "unbuilt")).toEqual([]);
  });

  it("gives every row a reason long enough to be one", () => {
    for (const divergence of DIVERGENCES) {
      expect(divergence.reason.length, `${divergence.command} ${divergence.subcommand} has no real reason`).toBeGreaterThan(20);
    }
  });
});

describe("what this audit concludes", () => {
  it("reaches its conclusion from the subcommand sets, never from the ratchet alone", () => {
    // Both halves, asserted together. The ratchet says every captured NAME is
    // registered; the tally says every captured SUBCOMMAND is accounted for and
    // none of them is simply absent. The first has never been sufficient on its
    // own, and stating them side by side is what stops it being quoted that way.
    expect(missingCommands(manifest, registeredNames())).toEqual([]);
    expect(divergenceTally().unbuilt).toBe(0);
    // What remains is difference with a reason, not absence.
    const tally = divergenceTally();
    expect(tally.respelled + tally.declined + tally.extra).toBe(DIVERGENCES.length);
  });
});
