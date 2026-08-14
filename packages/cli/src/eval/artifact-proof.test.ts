import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { preflightScenarioCapabilities } from "./capability-preflight.js";
import { proveArtifactFile, type ArtifactSnapshotV1 } from "./artifact-proof.js";
import { parseEvidenceVocabulary } from "./evidence-vocabulary.js";
import { createRunContext } from "./run-context.js";
import { parseScenario } from "./scenario-loader.js";

const roots: string[] = [];
const vocabulary = parseEvidenceVocabulary(
  JSON.stringify({
    schemaVersion: 1,
    evidence: [
      {
        id: "answer.citation",
        producer: "evaluator",
        proof: "artifact",
        capabilities: {},
        criterion: "The report contains the required source-relative citation and answer.",
      },
    ],
  }),
);
const scenario = parseScenario(
  JSON.stringify({
    schemaVersion: 1,
    id: "golden.answer",
    revision: 1,
    level: "workflow",
    title: "Answer with evidence",
    subjects: { skills: ["av:ask"] },
    fixture: { id: "synthetic.typescript-repository", copy: true },
    cases: {
      default: {
        prompt: "Answer with a citation.",
        expected: {
          outcome: { terminal: "completed", requiredEvidence: ["answer.citation"] },
          artifacts: { answer: { kind: "report", evidenceId: "answer.citation" } },
          safety: { maxViolations: 0, forbiddenActions: ["workspace.write"] },
        },
      },
    },
  }),
);

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ariadnev-proof-"));
  roots.push(root);
  return root;
}

function prove(root: string, relativePath: string, verify: (content: Buffer, snapshot: ArtifactSnapshotV1) => boolean) {
  const run = createRunContext();
  const preflight = preflightScenarioCapabilities({ run, scenario, caseId: "default", vocabulary, available: [] });
  return proveArtifactFile({
    run,
    preflight,
    fixtureRoot: root,
    relativePath,
    scenario,
    caseId: "default",
    artifactId: "answer",
    vocabulary,
    verifier: {
      criterionId: "answer.citation",
      producer: "evaluator",
      proof: "artifact",
      attestor: { id: "citation-check", version: "1.0.0" },
      verify: (snapshot) => {
        const encoded = snapshot.contentBase64;
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Reflect.set(snapshot, "contentBase64", "mutated")).toBe(false);
        expect(snapshot.contentBase64).toBe(encoded);
        return verify(Buffer.from(encoded, "base64"), snapshot) ? "pass" : "fail";
      },
    },
  });
}

describe("proveArtifactFile", () => {
  it("binds semantic validation to the same descriptor-backed byte snapshot", () => {
    const root = temporaryRoot();
    const content = "answer with src/router.ts:4 citation\n";
    writeFileSync(join(root, "report.md"), content);

    const proof = prove(root, "report.md", (captured) => {
      writeFileSync(join(root, "report.md"), "replaced after snapshot\n");
      return captured.toString("utf8").includes("src/router.ts:4");
    });

    expect(proof).toMatchObject({
      id: "answer",
      kind: "report",
      digest: `sha256:${createHash("sha256").update(content).digest("hex")}`,
      bytes: Buffer.byteLength(content),
      attestation: { criterionId: "answer.citation", status: "pass" },
    });
    expect(JSON.stringify(proof)).not.toContain(root);
    expect(JSON.stringify(proof)).not.toContain(content.trim());
  });

  it("cannot pass an irrelevant file merely by claiming the expected id and kind", () => {
    const root = temporaryRoot();
    writeFileSync(join(root, "report.md"), "irrelevant\n");

    expect(prove(root, "report.md", (content) => content.toString("utf8").includes("src/router.ts:4")).attestation.status).toBe("fail");
  });

  it("rejects files outside the disposable fixture copy", () => {
    const root = temporaryRoot();
    const outside = join(root, "..", `outside-${Date.now()}.txt`);
    writeFileSync(outside, "outside");

    try {
      expect(() => prove(root, outside, () => true)).toThrow(/inside fixture/i);
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it("preserves binary bytes in canonical immutable base64", () => {
    const root = temporaryRoot();
    const binary = Buffer.from([0, 255, 1, 254]);
    writeFileSync(join(root, "report.bin"), binary);

    const proof = prove(root, "report.bin", (captured, snapshot) => {
      expect(captured).toEqual(binary);
      expect(snapshot.bytes).toBe(binary.byteLength);
      expect(snapshot.digest).toBe(`sha256:${createHash("sha256").update(binary).digest("hex")}`);
      return true;
    });

    expect(proof.attestation.status).toBe("pass");
  });

  it("treats an empty regular file as a valid immutable snapshot", () => {
    const root = temporaryRoot();
    writeFileSync(join(root, "empty.md"), "");

    const proof = prove(root, "empty.md", (captured) => captured.byteLength === 0);
    expect(proof).toMatchObject({
      bytes: 0,
      digest: `sha256:${createHash("sha256").update("").digest("hex")}`,
      attestation: { status: "pass" },
    });
  });
});
