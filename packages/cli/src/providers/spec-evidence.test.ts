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
    // A provider with no inspection surface must not claim observation.
    expect(evidenceFor("antigravity", "skill").level).toBe("convention");
    expect(SPEC_VERIFIED.antigravity.observedVersion).toBeNull();
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
