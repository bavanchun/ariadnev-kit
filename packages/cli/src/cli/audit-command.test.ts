import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, unlinkSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKit } from "../kit/load-kit.js";
import { installKit } from "../install/install-execute.js";
import { runAudit } from "./audit-command.js";

// The pure classifier is covered in doctor/audit.test.ts. This drives the real
// thing: install a kit to a sandbox, disturb it, and check what audit says.

function skillMd(name: string): string {
  return `---
name: av:${name}
description: Use this fixture skill named ${name} to exercise the audit command end to end.
---

# ${name}

Body.

## Output format

Output.

## Quality gates

- Check.

## Workflow position

Related: none.
`;
}

let sandbox: string;
let kitRoot: string;
let ctx: { home: string; cwd: string; scope: "project" };

function auditOpts(extra: { strict?: boolean; json?: boolean } = {}) {
  return { target: "kit" as const, home: ctx.home, cwd: ctx.cwd, scope: "project" as const, ...extra };
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "ariadnev-audit-"));
  kitRoot = join(sandbox, "kit");
  for (const n of ["alpha", "beta"]) {
    mkdirSync(join(kitRoot, "skills", n), { recursive: true });
    writeFileSync(join(kitRoot, "skills", n, "SKILL.md"), skillMd(n));
  }
  ctx = { home: join(sandbox, "home"), cwd: join(sandbox, "proj"), scope: "project" };
  mkdirSync(ctx.home, { recursive: true });
  mkdirSync(ctx.cwd, { recursive: true });
  installKit(loadKit(kitRoot), ["claude-code"], ctx, { timestamp: "20260814-000001" });
});
afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

const ALPHA = join(".claude", "skills", "av-alpha", "SKILL.md");

describe("runAudit kit", () => {
  it("exits 0 on a clean install, in strict mode too", () => {
    expect(runAudit(auditOpts()).exitCode).toBe(0);
    expect(runAudit(auditOpts({ strict: true })).exitCode).toBe(0);
  });

  it("names the one file that was edited", () => {
    writeFileSync(join(ctx.cwd, ALPHA), "hand-edited\n");
    const { output, exitCode } = runAudit(auditOpts());
    expect(exitCode).toBe(1);
    expect(output).toContain(`modified  ${ALPHA}`);
    expect(output).not.toContain("beta/SKILL.md");
  });

  it("names the one file that was deleted", () => {
    unlinkSync(join(ctx.cwd, ALPHA));
    const { output, exitCode } = runAudit(auditOpts());
    expect(exitCode).toBe(1);
    expect(output).toContain(`missing   ${ALPHA}`);
  });

  it("reports a stray file as untracked without failing, until --strict", () => {
    writeFileSync(join(ctx.cwd, ".claude", "skills", "av-alpha", "notes.md"), "mine\n");
    const relaxed = runAudit(auditOpts());
    expect(relaxed.exitCode).toBe(0);
    expect(relaxed.output).toContain("untracked");
    expect(relaxed.output).toContain("--strict makes them fail");
    expect(runAudit(auditOpts({ strict: true })).exitCode).toBe(1);
  });

  it("emits a versioned JSON envelope", () => {
    writeFileSync(join(ctx.cwd, ALPHA), "hand-edited\n");
    const parsed = JSON.parse(runAudit(auditOpts({ json: true })).output) as {
      protocol_version: string;
      target: string;
      ok: boolean;
      counts: Record<string, number>;
      entries: { path: string; status: string }[];
    };
    expect(parsed.protocol_version).toBe("1");
    expect(parsed.target).toBe("kit");
    expect(parsed.ok).toBe(false);
    expect(parsed.counts.modified).toBe(1);
    expect(parsed.entries.find((e) => e.path === ALPHA)?.status).toBe("modified");
  });

  it("says so plainly when nothing is installed", () => {
    const empty = mkdtempSync(join(tmpdir(), "ariadnev-audit-empty-"));
    try {
      const { output, exitCode } = runAudit({ target: "kit", home: empty, cwd: empty, scope: "project" });
      expect(exitCode).toBe(0);
      expect(output).toContain("no install receipt found");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("runAudit scripts", () => {
  beforeEach(() => {
    mkdirSync(join(kitRoot, "skills", "alpha", "scripts"), { recursive: true });
    writeFileSync(
      join(kitRoot, "skills", "alpha", "scripts", "install.sh"),
      '#!/bin/sh\nsudo apt-get install -y thing\ncurl -sL "$u" | tar -xz -C /tmp\n',
    );
    writeFileSync(join(kitRoot, "skills", "beta", "run.sh"), '#!/bin/sh\necho "safe"\n');
  });

  it("flags the risky script and leaves the safe one alone", () => {
    const { output, exitCode } = runAudit({ ...auditOpts(), target: "scripts", kitRoot });
    expect(output).toContain("privilege-escalation");
    expect(output).toContain("remote-code-execution");
    expect(output).toContain("2 script(s) scanned, 1 flagged");
    // Shipping a risky script is a fact to surface, not a broken install.
    expect(exitCode).toBe(0);
    expect(runAudit({ ...auditOpts(), target: "scripts", kitRoot, strict: true }).exitCode).toBe(1);
  });

  it("scans an extension-less file that carries the executable bit", () => {
    const hook = join(kitRoot, "skills", "beta", "preflight");
    writeFileSync(hook, "#!/bin/sh\nsudo rm -rf /opt/thing\n");
    chmodSync(hook, 0o755);
    const { output } = runAudit({ ...auditOpts(), target: "scripts", kitRoot });
    expect(output).toContain("preflight");
    expect(output).toContain("3 script(s) scanned");
  });

  it("emits a versioned JSON envelope", () => {
    const parsed = JSON.parse(
      runAudit({ ...auditOpts(), target: "scripts", kitRoot, json: true }).output,
    ) as { protocol_version: string; target: string; flagged: number; counts: Record<string, number> };
    expect(parsed).toMatchObject({ protocol_version: "1", target: "scripts", flagged: 1 });
    expect(parsed.counts.high).toBe(2);
  });
});
