export const mockGhSource = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2), file = process.env.MOCK_GH_STATE;
const state = JSON.parse(fs.readFileSync(file, "utf8"));
const save = () => fs.writeFileSync(file, JSON.stringify(state));
const methodAt = args.indexOf("--method"), method = methodAt < 0 ? "GET" : args[methodAt + 1];
const path = args.find((arg) => arg.startsWith("repos/"));
const inputAt = args.indexOf("--input"), inputArg = inputAt < 0 ? null : args[inputAt + 1];
// \`gh api --input <file>\` reads that file; only \`-\` means stdin. The asset
// upload below passes a path, and modelling it as stdin made the upload send
// nothing while still reporting success.
const raw = inputArg === null ? "" : fs.readFileSync(inputArg === "-" ? 0 : inputArg, "utf8");
const uploadUrl = args.find((arg) => arg.startsWith("https://uploads.github.com/"));
let body;
if (raw && !uploadUrl) {
  try { body = JSON.parse(raw); } catch { process.stderr.write("invalid JSON input"); process.exit(2); }
}
const accept = args.filter((arg, i) => args[i - 1] === "-H").find((value) => value.startsWith("Accept:"));
state.requests.push({ command: args[0], method, path, body, accept, args });
const mutate = (kind) => state.mutations.push({ kind, method, path, body });
const json = (value) => process.stdout.write(JSON.stringify(value));
const binary = (value) => process.stdout.write(Buffer.from(value, "base64"));
const notFound = () => { save(); process.stderr.write("gh: HTTP 404: Not Found\\n"); process.exit(1); };
const sourceKey = (value) => value.includes("finalize-release") ? "finalizer" : value.includes("generate-docs") ? "generator" : value.includes("update-signature") ? "signingKey" : "workflow";

if (args[0] === "release" && args[1] === "upload") {
  mutate("release-upload");
  const paths = args.slice(3, args.indexOf("--repo"));
  state.release.assets = paths.map((entry) => { const bytes = fs.readFileSync(entry), id = state.nextAssetId++; state.assetBytes[id] = bytes.toString("base64"); return { id, name: entry.split("/").pop(), size: bytes.length }; });
  save(); process.exit(0);
}
// Asset upload goes to uploads.github.com, not the api host, so it never
// matches the \`repos/\` paths below.
if (uploadUrl) {
  mutate("upload-asset");
  const name = new URL(uploadUrl).searchParams.get("name");
  const bytes = Buffer.from(raw);
  const id = state.nextAssetId++;
  state.assetBytes[id] = bytes.toString("base64");
  state.release.assets = [...(state.release.assets || []), { id, name, size: bytes.length }];
  save(); json({ id, name, size: bytes.length }); process.exit(0);
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
  mutate("patch-release");
  state.release = { ...state.release, draft: body.draft, immutable: state.immutable.enabled !== false, prerelease: body.prerelease === true, updated_at: "2026-08-09T01:00:00Z" };
  // GitHub only promotes to latest when asked, and never promotes a prerelease.
  // Modelling that is the point: a beta silently becoming latest is served to
  // every bare installer, and a mock that promotes unconditionally cannot catch it.
  if (body.make_latest === "true" && !state.release.prerelease) state.latest = state.release;
  save(); json(state.release); process.exit(0);
}
if (path.includes("/check-runs")) json(state.checkRuns ?? { check_runs: [] });
else if (path.includes("/actions/runs/")) json(state.run);
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
