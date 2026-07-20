// Cross-compile the standalone vcskill binary for every supported platform and
// emit a checksums file. Run in CI on release; Bun cross-compiles all targets
// from one host. Output → packages/cli/dist/release/.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readFileSync, writeFileSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TARGETS } from "./binary-targets.mjs";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(pkgDir, "dist", "release");

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

// 1. Freshen the embedded kit so no binary ships a stale kit.
execFileSync("node", [join(pkgDir, "scripts", "generate-embedded-kit.mjs")], { stdio: "inherit" });

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const version = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;
const only = process.argv[2]; // optional: build a single asset name (local testing)
const checksums = [];

for (const { target, asset } of TARGETS) {
  if (only && asset !== only) continue;
  const out = join(outDir, asset);
  console.log(`building ${asset} (${target}) …`);
  execFileSync(
    "bun",
    ["build", "--compile", `--target=${target}`, join(pkgDir, "src", "index.ts"), "--outfile", out],
    { stdio: "inherit", cwd: pkgDir },
  );
  const digest = await sha256(out);
  checksums.push(`${digest}  ${asset}`);
}

writeFileSync(join(outDir, "checksums.txt"), checksums.join("\n") + "\n");
console.log(`\nvcskill@${version} — ${checksums.length} binaries + checksums.txt in dist/release/`);
