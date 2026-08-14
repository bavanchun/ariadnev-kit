import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanScript, auditScripts } from "./audit-scripts.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const fixture = readFileSync(join(here, "__fixtures__", "risky-install.sh"), "utf8");

function ids(content: string): string[] {
  return [...new Set(scanScript("x.sh", content).risks.map((r) => r.id))].sort();
}

describe("scanScript on the real install-script shapes", () => {
  const report = scanScript("skills/cti-expert/scripts/install.sh", fixture);

  it("finds every risk category the source script actually uses", () => {
    expect([...new Set(report.risks.map((r) => r.id))].sort()).toEqual([
      "privilege-escalation",
      "remote-code-execution",
      "remote-package-install",
      "writes-outside-skill",
    ]);
  });

  it("flags the download-pipe-extract line", () => {
    const hit = report.risks.find((r) => r.excerpt.includes("tar -xz"));
    expect(hit).toMatchObject({ id: "remote-code-execution", severity: "high" });
  });

  it("flags executed `bash <(curl …)` but not the same text merely printed", () => {
    // The source script only ever *prints* this line, as manual-install advice
    // for the user. Reporting it would be wrong: nothing is executed. The rule
    // still has to catch the real thing, so both forms are asserted here.
    expect(report.risks.some((r) => r.excerpt.startsWith("echo"))).toBe(false);
    expect(ids('bash <(curl -sL https://example.com/x)\n')).toEqual(["remote-code-execution"]);
  });

  it("flags `go install` and a pip install from a git URL", () => {
    const pkg = report.risks.filter((r) => r.id === "remote-package-install").map((r) => r.excerpt);
    expect(pkg.some((e) => e.startsWith("if go install"))).toBe(true);
    expect(pkg.some((e) => e.includes("git+https://"))).toBe(true);
  });

  it("flags /usr/local/bin where it is knowable — at the assignment", () => {
    // The write is `sudo mv "$bin" "$install_dir/$cmd"`, whose destination is a
    // variable; no static scan can resolve it at that line. The system prefix
    // is only visible where it is set as the default, so that is where the
    // finding is anchored. The move line is still reported — as privilege
    // escalation, which is what is actually legible there.
    const assignment = report.risks.find((r) => r.id === "writes-outside-skill" && r.excerpt.includes("install_dir="));
    expect(assignment?.excerpt).toContain("/usr/local/bin");
    expect(report.risks.some((r) => r.id === "privilege-escalation" && r.excerpt.includes("sudo mv"))).toBe(true);
  });

  it("does not flag a remedy message that merely names sudo", () => {
    // `log_fail "$pkg" "try: sudo apt-get update && sudo apt install $pkg"`
    // describes a fix for the user; it executes nothing.
    const lines = report.risks.filter((r) => r.excerpt.includes("try: sudo"));
    expect(lines).toEqual([]);
  });

  it("reports 1-indexed line numbers pointing at the matched line", () => {
    const lines = fixture.split("\n");
    for (const risk of report.risks) {
      expect(lines[risk.line - 1].trim()).toBe(risk.excerpt);
    }
  });
});

describe("scanScript precision", () => {
  it("ignores a commented-out risky line", () => {
    expect(ids("# sudo apt-get install -y thing\n")).toEqual([]);
    expect(ids("echo hi   # curl http://x | sh\n")).toEqual([]);
  });

  it("still flags a `#` that is inside a string, not a comment", () => {
    expect(ids('sudo apt-get install -y "pkg#1"\n')).toEqual(["privilege-escalation"]);
  });

  it("handles an escaped quote without losing track of where the string ends", () => {
    // The backslash must consume the next character, or the closing quote is
    // read as an opening one and the rest of the line is treated as quoted.
    expect(ids('log_fail "say \\"try: sudo apt install x\\"" ; sudo rm -rf /opt/x\n')).toEqual([
      "privilege-escalation",
      "writes-outside-skill",
    ]);
  });

  it("leaves an ordinary script alone", () => {
    const safe = [
      "#!/bin/sh",
      "set -e",
      'echo "installing local deps"',
      "python3 scripts/build.py --out dist",
      "cp ./template.md ./out/template.md",
      "pip install -r requirements.txt",
    ].join("\n");
    expect(scanScript("safe.sh", safe).risks).toEqual([]);
  });

  it("reports one finding per risk kind per line", () => {
    // Two spellings of remote execution on one line is still one thing to read.
    const risks = scanScript("x.sh", 'curl -sL "$u" | sh && curl -sL "$v" | bash\n').risks;
    expect(risks).toHaveLength(1);
  });

  it("catches a global npm install but not a local one", () => {
    expect(ids("npm install -g tool\n")).toEqual(["remote-package-install"]);
    expect(ids("npm install\n")).toEqual([]);
  });

  it("catches appends to a shell startup file", () => {
    expect(ids('echo "export PATH=$PATH:/x" >> ~/.zshrc\n')).toEqual(["writes-outside-skill"]);
  });
});

describe("auditScripts", () => {
  it("aggregates severity counts and flagged-file count", () => {
    const res = auditScripts([
      { path: "a.sh", content: fixture },
      { path: "b.sh", content: 'echo "nothing risky"\n' },
    ]);
    expect(res.flagged).toBe(1);
    expect(res.counts.high).toBeGreaterThan(0);
    expect(res.counts.medium).toBeGreaterThan(0);
    expect(res.reports).toHaveLength(2);
  });

  it("returns an empty, clean result for no scripts", () => {
    expect(auditScripts([])).toEqual({ reports: [], counts: { high: 0, medium: 0 }, flagged: 0 });
  });
});
