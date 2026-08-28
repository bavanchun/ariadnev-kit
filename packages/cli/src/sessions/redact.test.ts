import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { readFileSync as readSource } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { planRedaction, planRedactions } from "./redact.js";
import type { DiscoveredSession } from "./discover.js";

const dirs: string[] = [];
const mk = () => {
  const dir = mkdtempSync(join(tmpdir(), "ariadnev-redact-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function session(lines: unknown[]): DiscoveredSession {
  const path = join(mk(), "s.jsonl");
  writeFileSync(path, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
  return { id: "s", agent: "claude-code", path, projectId: "p", sizeBytes: 1, modifiedAt: "2026-08-28T00:00:00.000Z" };
}

const msg = (text: string) => ({ type: "user", message: { role: "user", content: text } });

describe("NOTHING IS EVER WRITTEN", () => {
  // The phase's sharpest risk: "a dry-run tool acquiring an --apply flag is how
  // a read-only phase stops being read-only". The oracle's own redact has
  // --apply. This one does not, and these assert the absence rather than the
  // behaviour of a flag.

  it("leaves the file byte-identical and its mtime untouched", () => {
    const found = session([msg("token ghp_abcdefghijklmnopqrstuvwxyz01")]);
    const before = readFileSync(found.path);
    const beforeStat = statSync(found.path).mtimeMs;

    planRedaction(found, { redactEmails: true });

    expect(readFileSync(found.path).equals(before)).toBe(true);
    expect(statSync(found.path).mtimeMs).toBe(beforeStat);
  });

  it("reports applied:false, so a consumer can assert instead of assuming", () => {
    const found = session([msg("token ghp_abcdefghijklmnopqrstuvwxyz01")]);
    expect(planRedaction(found).applied).toBe(false);
    expect(planRedactions([found]).applied).toBe(false);
  });

  it("names no function that could open a write path", () => {
    // The guarantee is structural: the capability is absent, not gated. A flag
    // could be added by mistake; an import does not appear by mistake.
    //
    // `openSync` is on the list even though this module only ever reads —
    // it takes a mode, so a module that calls it directly is one edit away
    // from writing. Reading goes through `parse.ts` instead.
    const source = readSource(join(dirname(fileURLToPath(import.meta.url)), "redact.ts"), "utf8");
    for (const writer of ["writeFileSync", "appendFileSync", "openSync", "rmSync", "renameSync", "atomicWrite", "unlinkSync"]) {
      expect(source, writer).not.toContain(writer);
    }
  });
});

describe("detection", () => {
  it("finds a credential-shaped string and says which line", () => {
    const found = session([msg("nothing here"), msg("key sk-abcdefghijklmnopqrstuvwxyz")]);
    const plan = planRedaction(found);
    expect(plan.findings).toHaveLength(1);
    expect(plan.findings[0]).toMatchObject({ line: 1, kind: "credential" });
  });

  it("never puts the secret it found into the report", () => {
    // A finding that quoted its match would put the credential in the output,
    // which is the original problem with an extra copy of it.
    const found = session([msg("token ghp_abcdefghijklmnopqrstuvwxyz01")]);
    expect(JSON.stringify(planRedaction(found))).not.toContain("ghp_");
  });

  it("reports a clean session as clean", () => {
    const found = session([msg("just some ordinary prose"), msg("and more of it")]);
    expect(planRedaction(found).findings).toEqual([]);
    expect(planRedaction(found).linesScanned).toBe(2);
  });

  it("leaves emails alone unless asked", () => {
    // An email in a session is usually a git author line or a code sample.
    // Flagging every one by default would bury the findings that matter.
    const found = session([msg("contact someone@example.com about it")]);
    expect(planRedaction(found).findings).toEqual([]);
    expect(planRedaction(found, { redactEmails: true }).findings[0]).toMatchObject({ kind: "email" });
  });

  it("does not depend on the environment it runs in", () => {
    // Detection is pattern-based with an empty env, so a plan is reproducible.
    // Reading process.env would make the report depend on which variables
    // happened to be set at scan time rather than on the file.
    const found = session([msg("plain text with no token")]);
    process.env.ARIADNEV_TEST_SECRET_TOKEN = "plain";
    try {
      expect(planRedaction(found).findings).toEqual([]);
    } finally {
      delete process.env.ARIADNEV_TEST_SECRET_TOKEN;
    }
  });
});

describe("across several sessions", () => {
  it("totals the findings and the sessions scanned", () => {
    const a = session([msg("ghp_abcdefghijklmnopqrstuvwxyz01")]);
    const b = session([msg("clean"), msg("sk-abcdefghijklmnopqrstuvwxyz")]);
    const report = planRedactions([a, b]);
    expect(report.sessionsScanned).toBe(2);
    expect(report.findingsTotal).toBe(2);
  });
});
