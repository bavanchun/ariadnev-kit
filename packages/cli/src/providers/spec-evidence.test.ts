import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SPEC_VERIFIED, EVIDENCE_REQUIRED_PROVIDERS, evidenceFor, isVerified, type ArtifactKind } from "./spec-verified.js";

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..");
const KINDS = Object.keys(SPEC_VERIFIED["claude-code"].paths) as ArtifactKind[];

describe("provider verification evidence", () => {
  it("every cell carries a note, and real providers carry a substantive one", () => {
    for (const provider of Object.keys(SPEC_VERIFIED) as (keyof typeof SPEC_VERIFIED)[]) {
      for (const kind of KINDS) {
        const cell = SPEC_VERIFIED[provider].paths[kind];
        expect(cell.note, `${provider}.${kind} has no note`).toBeTruthy();
        // The mock is exempt from the evidence requirement, so "mock" is an
        // adequate note for it; a shipping provider has to say what was
        // checked, or why it could not be.
        if (!EVIDENCE_REQUIRED_PROVIDERS.includes(provider)) continue;
        expect(cell.note.length, `${provider}.${kind} note is too thin to act on`).toBeGreaterThan(30);
      }
    }
  });

  it("only an unverified cell may have no evidence, and vice versa", () => {
    for (const provider of Object.keys(SPEC_VERIFIED) as (keyof typeof SPEC_VERIFIED)[]) {
      for (const kind of KINDS) {
        const cell = SPEC_VERIFIED[provider].paths[kind];
        expect(cell.verified, `${provider}.${kind}: level and verified disagree`).toBe(cell.level !== "none");
      }
    }
  });

  it("a provider with an observed cell records which version was observed", () => {
    // Without this, a claim cannot go stale — it just looks permanently true.
    for (const provider of EVIDENCE_REQUIRED_PROVIDERS) {
      const spec = SPEC_VERIFIED[provider];
      const hasObserved = KINDS.some((k) => spec.paths[k].level === "observed") || spec.toolNames.level === "observed";
      if (!hasObserved) continue;
      expect(spec.observedVersion, `${provider} claims observation with no version`).toBeTruthy();
      expect(spec.observedOn, `${provider} claims observation with no date`).toBeTruthy();
    }
  });

  it("no cell cites a reference generator as its source", () => {
    // The previous table's evidence was two files that are not in this repo.
    const source = readFileSync(join(repoRoot, "packages", "cli", "src", "providers", "spec-verified.ts"), "utf8");
    const body = source.slice(source.indexOf("export const SPEC_VERIFIED"));
    for (const banned of ["codex_generator", "generate-opencode.py", "adapt_content"]) {
      expect(body.includes(banned), `a cell still cites ${banned}`).toBe(false);
    }
  });

  it("keeps the cells that lost their evidence unverified", () => {
    // Named explicitly so re-promoting one is a deliberate edit with a test
    // change attached, not a quiet flip.
    expect(isVerified("codex", "command")).toBe(false);
    expect(isVerified("cursor", "command")).toBe(false);
    expect(isVerified("cursor", "rules")).toBe(false);
    expect(isVerified("opencode", "rules")).toBe(false);
    expect(evidenceFor("codex", "command").note).toMatch(/never appears in prompt-input/);
  });

  it("records observation for the providers that were run", () => {
    expect(evidenceFor("codex", "skill").level).toBe("observed");
    expect(evidenceFor("opencode", "agent").level).toBe("observed");
    expect(evidenceFor("claude-code", "hook").level).toBe("observed");
    // agy's own `agent` subcommand is that listing surface, so the agent cell
    // reaches the same rung the opencode and codex agent cells did. Its skill
    // cell does not: 1.1.25 ships no `skill` subcommand, so there is nothing to
    // hold it to the same standard.
    expect(evidenceFor("antigravity", "agent").level).toBe("observed");
    expect(evidenceFor("antigravity", "skill").level).toBe("convention");
    expect(SPEC_VERIFIED.antigravity.observedOn).toBe("2026-09-04");
  });

  it("lands the claude-code output-style cell on the shipped-artefact ground", () => {
    // 2.1.260 exposes no free surface that enumerates a user-directory output
    // style. A style planted in an otherwise-empty `~/.claude/output-styles/`
    // changed nothing in `claude doctor`, `claude plugin validate --json`
    // reported `"contents": []` for a plugin carrying one, and there is no
    // `--output-style` flag, no `output-style` subcommand, and no
    // `/output-style` command in the binary either — selection is the `/config`
    // panel, which is interactive-only and reaching it spends a model turn.
    //
    // What the binary itself carries is the path: `output-styles` is a member
    // of its userConfigDir directory-name enum, beside `commands`, `agents`,
    // `skills` and `rules`. The destination is the provider's own, and no load
    // of it was witnessed — which is this rung and not the one above it.
    const style = evidenceFor("claude-code", "outputStyle");
    expect(style.verified).toBe(true);
    expect(style.level).toBe("convention");
    expect(style.note).toMatch(/userConfigDir/);
    expect(style.note).toMatch(/claude doctor/);
    expect(SPEC_VERIFIED["claude-code"].observedVersion).toBe("2.1.260");
    expect(SPEC_VERIFIED["claude-code"].observedOn).toBe("2026-09-04");
  });

  it("says which claude-code cells were re-checked and which were carried forward", () => {
    // Re-pinning the row's version is a claim about every cell in it. The two
    // that could not be reached from a shell session — the kit's single command
    // was never invoked, and the status bar draws in the user's terminal — say
    // so in their own notes rather than inheriting a date nobody earned.
    expect(evidenceFor("claude-code", "command").note).toMatch(/carried forward/);
    expect(evidenceFor("claude-code", "statusline").note).toMatch(/carried forward/);
    for (const kind of ["skill", "agent", "rules", "hook"] as ArtifactKind[]) {
      expect(evidenceFor("claude-code", kind).note, `${kind} reads as carried forward`).not.toMatch(
        /carried forward/,
      );
    }
  });

  it("grades the codex hook registry on what codex records, not on a run we watched", () => {
    // Trusting a hook in codex is an interactive TUI step, so no hook of ours
    // was seen to fire. What is on disk is codex's own bookkeeping about the
    // file — a `[hooks.state]` table keying a trust decision per hook — which
    // is evidence that codex reads it, and is not evidence of a load.
    const hook = evidenceFor("codex", "hook");
    expect(hook.level).toBe("convention");
    expect(hook.verified).toBe(true);
    expect(hook.note).toMatch(/hooks\.state/);
    expect(hook.note).toMatch(/0\.153\.1/);
    expect(hook.note).toMatch(/other tools/);
    // Grading a cell documents a layout; it must never be read as a new
    // observation, so the row's observation stays exactly where it was.
    expect(SPEC_VERIFIED.codex.observedVersion).toBe("codex-cli 0.147.0");
    expect(SPEC_VERIFIED.codex.observedOn).toBe("2026-08-15");
  });

  it("does not let a binary alone promote a provider to observed", () => {
    // `omp` is installed and runnable here, and every cell is still
    // `convention`. The probe that looked like a load check (`omp read
    // skill://<name>`) reported "Available: none" for a skill planted in both
    // candidate layouts while discovery was enabled, so it resolves a session
    // registry rather than the discovery pipeline. The only probe left spends
    // the user's model credits.
    for (const kind of KINDS) {
      expect(SPEC_VERIFIED.omp.paths[kind].level, `omp.${kind} claims observation`).not.toBe("observed");
    }
    expect(SPEC_VERIFIED.omp.observedOn, "omp records no observation date").toBeNull();
    expect(SPEC_VERIFIED.omp.observedVersion).toMatch(/no local load-check surface/);
  });

  it("keeps grok at convention, since no binary exists here to watch it load", () => {
    for (const kind of KINDS) {
      expect(SPEC_VERIFIED.grok.paths[kind].level, `grok.${kind} claims observation`).not.toBe("observed");
    }
    expect(SPEC_VERIFIED.grok.observedVersion).toBeNull();
  });

  it("verifies nothing at all for dsh", () => {
    // No binary, no home directory, no adapter to read a layout from. Every
    // cell false means the installer skips and logs, which this table treats as
    // correct behaviour — a guessed path would be the failure.
    for (const kind of KINDS) {
      expect(isVerified("dsh", kind), `dsh.${kind} is verified without evidence`).toBe(false);
    }
    expect(SPEC_VERIFIED.dsh.toolNames.verified).toBe(false);
  });

  it("grades antigravity on what agy answered, not on files this tool wrote", () => {
    // The agent cell used to cite the .md files already sitting in
    // ~/.gemini/config/agents/ as its evidence. That directory was filled by
    // this tool's own lineage, so the citation was the installer certifying its
    // own output — and a populated directory cannot report what reads it.
    const agent = evidenceFor("antigravity", "agent");
    expect(agent.note).not.toMatch(/16/);
    expect(agent.note).toMatch(/agy agent/);
    expect(SPEC_VERIFIED.antigravity.observedVersion).toBe("1.1.25");

    // The same citation appeared in the resolver, next to the path it was
    // defending, and a rule deleted in one file and left standing in the other
    // is a rule the next reader still learns.
    const resolver = readFileSync(join(repoRoot, "packages", "cli", "src", "providers", "resolver.ts"), "utf8");
    const block = resolver.slice(resolver.indexOf("  antigravity: {"));
    expect(block.slice(0, block.indexOf("commandPath"))).not.toMatch(/16 (agent|`\.md`|\.md)/);
  });

  it("excludes the internal mock from the evidence requirement", () => {
    expect(EVIDENCE_REQUIRED_PROVIDERS).not.toContain("test-provider");
    expect(EVIDENCE_REQUIRED_PROVIDERS).toContain("codex");
  });

  it("ships an ADR describing how each provider was checked", () => {
    const adr = readFileSync(join(repoRoot, "docs", "decisions", "0006-provider-verification-evidence.md"), "utf8");
    for (const provider of EVIDENCE_REQUIRED_PROVIDERS) {
      expect(adr, `ADR does not cover ${provider}`).toContain(provider);
    }
    expect(adr).toContain("codex debug prompt-input");
    expect(adr).toContain("opencode debug skill");
  });
});
