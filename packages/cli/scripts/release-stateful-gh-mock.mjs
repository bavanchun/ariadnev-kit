export const mockGhSource = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2), file = process.env.MOCK_GH_STATE;
const state = JSON.parse(fs.readFileSync(file, "utf8"));
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const methodAt = args.indexOf("--method"), method = methodAt < 0 ? "GET" : args[methodAt + 1];
const path = args.find((arg) => arg.startsWith("repos/"));
const inputAt = args.indexOf("--input"), raw = inputAt < 0 ? "" : fs.readFileSync(0, "utf8");
let body;
try { body = raw ? JSON.parse(raw) : undefined; } catch { process.stderr.write("invalid JSON input"); process.exit(2); }
const accept = args.filter((arg, i) => args[i - 1] === "-H").find((value) => value.startsWith("Accept:"));
state.requests.push({ command: args[0], method, path, body, accept, args });
const mutate = (kind) => state.mutations.push({ kind, method, path, body });
const json = (value) => process.stdout.write(JSON.stringify(value));
const binary = (value) => process.stdout.write(Buffer.from(value, "base64"));
const notFound = () => { save(); process.stderr.write("gh: HTTP 404: Not Found\\n"); process.exit(1); };
const sourceKey = (value) => value.includes("finalize-release") ? "finalizer" : value.includes("generate-docs") ? "generator" : "workflow";

if (args[0] === "release" && args[1] === "upload") {
  mutate("release-upload");
  const paths = args.slice(3, args.indexOf("--repo"));
  state.release.assets = paths.map((entry) => { const bytes = fs.readFileSync(entry), id = state.nextAssetId++; state.assetBytes[id] = bytes.toString("base64"); return { id, name: entry.split("/").pop(), size: bytes.length }; });
  save(); process.exit(0);
}
if (!path) { save(); json({}); process.exit(0); }
if (method === "POST" && path.endsWith("/git/tags")) {
  mutate("create-tag-object"); state.tagObject = { sha: "c".repeat(40), object: { type: body.type, sha: body.object }, message: body.message }; save(); json(state.tagObject); process.exit(0);
}
if (method === "POST" && path.endsWith("/git/refs")) {
  mutate("create-tag-ref"); state.tagRef = { object: { type: "tag", sha: body.sha } }; save(); json(state.tagRef); process.exit(0);
}
if (method === "POST" && path.endsWith("/releases")) {
  mutate("create-release"); state.release = { id: 11, draft: body.draft, immutable: false, tag_name: body.tag_name, target_commitish: body.target_commitish, assets: [], updated_at: "2026-08-08T01:00:00Z" }; save(); json(state.release); process.exit(0);
}
if (method === "PATCH" && path.includes("/releases/")) {
  // Publishing is what makes a release immutable, so that is where the flag is
  // observed. \`immutable.enabled: false\` models a repository that does not, and
  // is the only way to exercise the post-publish guard: the settings endpoint
  // answers 403 to GITHUB_TOKEN, so no workflow can read the setting directly.
  mutate("patch-release"); state.release = { ...state.release, draft: body.draft, immutable: state.immutable.enabled !== false, updated_at: "2026-08-09T01:00:00Z" }; state.latest = state.release; save(); json(state.release); process.exit(0);
}
if (path.includes("/actions/runs/")) json(state.run);
else if (path.includes("/actions/artifacts?")) json({ artifacts: state.artifactHistory });
else if (path.includes("/actions/artifacts/") && path.endsWith("/zip")) binary(state.artifactZip);
else if (path.includes("/actions/artifacts/")) json(state.artifact);
else if (path.includes("/git/ref/tags/")) state.tagRef ? json(state.tagRef) : notFound();
else if (path.includes("/git/tags/")) state.tagObject ? json(state.tagObject) : notFound();
else if (path.includes("/releases/assets/")) {
  if (accept !== "Accept: application/octet-stream") { save(); process.stderr.write("missing asset Accept header"); process.exit(2); }
  const id = path.split("/").pop(); state.assetBytes[id] ? binary(state.assetBytes[id]) : notFound();
}
else if (path.includes("/releases?")) json(state.release ? [state.release] : []);
else if (path.endsWith("/releases/latest")) state.latest ? json(state.latest) : notFound();
// A draft is invisible by tag: GitHub answers 404 until it is published. Every
// caller must therefore either tolerate the 404 or ask after publishing.
else if (path.includes("/releases/tags/")) state.release && !state.release.draft ? json(state.release) : notFound();
else if (path.includes("/releases/")) state.release ? json(state.release) : notFound();
else if (path.includes("/contents/")) binary(state.sources[sourceKey(path)]);
else json({});
save();
`;
