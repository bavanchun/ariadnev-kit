import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { isTextFile, markPorted, portSkill, residueIn, rewriteText } from "./port-skill.mjs";

test("rewrites the identifiers that are names", () => {
  assert.equal(rewriteText("run /ak:cook then /ak:plan --hard"), "run /av:cook then /av:plan --hard");
  assert.equal(rewriteText("delegate to ak-frontend-design"), "delegate to av-frontend-design");
  assert.equal(rewriteText("set AGENTKIT_HOME=1"), "set ARIADNEV_HOME=1");
  assert.equal(rewriteText("state lives in ~/.agentkit/cache"), "state lives in ~/.ariadnev/cache");
  assert.equal(rewriteText("AgentKit installs it"), "ariadnev installs it");
  assert.equal(rewriteText("run `ak plan --help` first"), "run `av plan --help` first");
  assert.equal(rewriteText("how to use ak, and what it does"), "how to use av, and what it does");
  assert.equal(rewriteText("process.env.CLI || 'ak'"), "process.env.CLI || 'av'");
});

test("leaves the same two letters alone when they are English", () => {
  // The reason every rule is anchored: these letters are inside ordinary words,
  // and a substring rewrite corrupts prose in a way no test of the identifiers
  // would ever catch.
  const prose = "Make a break, take a bakery kayak to Osaka; speaker weakness peaked.";
  assert.equal(rewriteText(prose), prose);
  assert.equal(rewriteText("the package.json lockfile"), "the package.json lockfile");
  // A word that merely starts with the alias is not the alias.
  assert.equal(rewriteText("akin to that"), "akin to that");
  assert.equal(rewriteText("ak2 is not a verb"), "ak2 is not a verb");
});

test("does not rewrite a path that happens to end in the alias", () => {
  assert.equal(rewriteText("see docs/pak/index.md"), "see docs/pak/index.md");
  assert.equal(rewriteText("./ak"), "./ak", "a bare path is not a command invocation");
});

test("reports whatever the table failed to reach", () => {
  const hits = residueIn("still mentions AGENTKIT_HOME and ak:cook");
  assert.ok(hits.some((h) => h.id === "env-prefix"));
  assert.ok(hits.some((h) => h.id === "skill-namespace"));
  assert.equal(residueIn(rewriteText("AGENTKIT_HOME and ak:cook")).length, 0);
});

test("classifies fonts and archives as bytes, not text", () => {
  for (const name of ["Inter.ttf", "chart.png", "data.zip", "font.woff2", "LICENSE"]) {
    assert.equal(isTextFile(name), false, name);
  }
  for (const name of ["SKILL.md", "run.py", "config.yaml", "helper.sh", "README"]) {
    assert.equal(isTextFile(name), true, name);
  }
});

test("copies a tree, rewriting text and leaving binary bytes untouched", () => {
  const root = mkdtempSync(join(tmpdir(), "av-portskill-"));
  const source = join(root, "src");
  const dest = join(root, "dest");
  mkdirSync(join(source, "references"), { recursive: true });
  mkdirSync(join(source, "assets"), { recursive: true });
  writeFileSync(join(source, "SKILL.md"), "# ak-demo\n\nRun /ak:cook. Do not break the build.\n");
  writeFileSync(join(source, "references", "notes.md"), "AGENTKIT_HOME lives in ~/.agentkit\n");
  const fontBytes = Buffer.from([0x00, 0x01, 0x61, 0x6b, 0x3a, 0xff, 0xfe]); // contains "ak:"
  writeFileSync(join(source, "assets", "Inter.ttf"), fontBytes);

  const report = portSkill({ source, dest });
  assert.equal(report.files, 3);
  assert.equal(report.binary, 1);
  assert.equal(report.rewritten, 2);
  assert.deepEqual(report.residue, []);

  assert.match(readFileSync(join(dest, "SKILL.md"), "utf8"), /# av-demo/);
  assert.match(readFileSync(join(dest, "SKILL.md"), "utf8"), /Do not break the build/);
  assert.match(readFileSync(join(dest, "references", "notes.md"), "utf8"), /ARIADNEV_HOME lives in ~\/\.ariadnev/);
  assert.deepEqual(readFileSync(join(dest, "assets", "Inter.ttf")), fontBytes, "a font must survive byte for byte");
  rmSync(root, { recursive: true, force: true });
});

test("reports a source file that does not match the upstream hash", () => {
  // Copying is only trustworthy if the thing being copied is what upstream
  // shipped. A file edited on this machine since install would otherwise be
  // adopted as canon without a word.
  const root = mkdtempSync(join(tmpdir(), "av-portskill-hash-"));
  const source = join(root, "src");
  mkdirSync(source, { recursive: true });
  const good = join(source, "SKILL.md");
  const edited = join(source, "notes.md");
  writeFileSync(good, "clean\n");
  writeFileSync(edited, "locally edited\n");

  const hashes = {
    [good]: createHash("sha256").update(readFileSync(good)).digest("hex"),
    [edited]: createHash("sha256").update("what upstream shipped\n").digest("hex"),
  };
  const report = portSkill({ source, dest: join(root, "dest"), dryRun: true, hashes });
  assert.deepEqual(report.mismatched, ["notes.md"]);
  assert.deepEqual(report.unverified, []);
  rmSync(root, { recursive: true, force: true });
});

test("dry-run writes nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "av-portskill-dry-"));
  const source = join(root, "src");
  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, "SKILL.md"), "/ak:cook\n");
  const dest = join(root, "dest");
  const report = portSkill({ source, dest, dryRun: true });
  assert.equal(report.rewritten, 1);
  assert.throws(() => readFileSync(join(dest, "SKILL.md")));
  rmSync(root, { recursive: true, force: true });
});

test("marks a ported SKILL.md so the authoring lint can tell it from ours", () => {
  const withMetadata = `---
name: av:demo
description: does a thing
metadata:
  author: ariadnev
  version: "1.0.0"
---

# Demo
`;
  const marked = markPorted(withMetadata);
  assert.match(marked, /origin: ported/);
  assert.match(marked, /author: upstream/, "our name does not go on someone else's writing");
  assert.equal(markPorted(marked), marked, "marking twice changes nothing");

  const withoutMetadata = "---\nname: av:demo\ndescription: d\n---\n\n# Demo\n";
  assert.match(markPorted(withoutMetadata), /metadata:\n {2}origin: ported/);

  assert.equal(markPorted("# no frontmatter\n"), "# no frontmatter\n");
});

test("does not carry a machine's build output into the kit", () => {
  // __pycache__ is bytecode compiled by whichever interpreter ran the skill
  // here. Upstream never shipped it — its own hash manifest does not list it —
  // and copying it would ship one machine's Python version to every other.
  const root = mkdtempSync(join(tmpdir(), "av-portskill-cache-"));
  const source = join(root, "src");
  mkdirSync(join(source, "scripts", "__pycache__"), { recursive: true });
  writeFileSync(join(source, "SKILL.md"), "---\nname: av:demo\ndescription: d\n---\n\n# Demo\n");
  writeFileSync(join(source, "scripts", "run.py"), "print(1)\n");
  writeFileSync(join(source, "scripts", "__pycache__", "run.cpython-314.pyc"), Buffer.from([0x0d, 0x0d, 0x0a]));

  const dest = join(root, "dest");
  const report = portSkill({ source, dest });
  assert.equal(report.files, 2, "the bytecode is not even counted");
  assert.throws(() => readFileSync(join(dest, "scripts", "__pycache__", "run.cpython-314.pyc")));
  rmSync(root, { recursive: true, force: true });
});

test("catches the brand where it is a literal rather than a namespace", () => {
  // Two real leftovers the first pass missed: an uppercase token used as a
  // payment-memo prefix in sample code, and the binary quoted in prose.
  assert.equal(rewriteText("const memo = `CLAUDEKIT ${orderId}`"), "const memo = `ARIADNEV ${orderId}`");
  // Glued to other characters, which is where a boundary-anchored rule failed.
  assert.equal(rewriteText("CLAUDEKIT4e4635f4 ok"), "ARIADNEV4e4635f4 ok");
  assert.equal(rewriteText("const claudekitMatch = 1"), "const ariadnevMatch = 1");
  assert.equal(rewriteText("state in ~/.agentkit/cache"), "state in ~/.ariadnev/cache");
  assert.equal(rewriteText("interpreted by the `ak` skill-env manager"), "interpreted by the `av` skill-env manager");
  // The underscore forms still work, and are not double-rewritten.
  assert.equal(rewriteText("AGENTKIT_HOME"), "ARIADNEV_HOME");
});

test("renames the binary wherever it is running something", () => {
  // The rule used to be limited to a list of verbs, which missed every command
  // the port does not implement — the exact places a stale name would read as a
  // different tool rather than a missing command.
  assert.equal(rewriteText("run `ak codex-agent-runtime register` first"), "run `av codex-agent-runtime register` first");
  assert.equal(rewriteText("ak doctor"), "av doctor");
  // Placeholder namespace forms.
  assert.equal(rewriteText("a `/ak:<slug>` skill"), "a `/av:<slug>` skill");
  assert.equal(rewriteText("any ak:* skill"), "any av:* skill");
  // Still not a rename when it is not a command.
  assert.equal(rewriteText("ak."), "ak.");
  assert.equal(rewriteText("./ak run"), "./ak run");
});

test("catches the binary before a flag and the namespace before an uppercase name", () => {
  assert.equal(rewriteText("confirm `ak --version` works"), "confirm `av --version` works");
  assert.equal(rewriteText("read `ak --help`"), "read `av --help`");
  assert.equal(rewriteText("name: ck:CI"), "name: av:CI");
});
