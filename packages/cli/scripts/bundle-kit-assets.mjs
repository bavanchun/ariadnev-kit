// Copy canonical kit assets from the repo root into the package dir so the
// published tarball is FLAT (vcskill/dist + vcskill/kit siblings), matching
// resolveKitRoot()'s runtime expectation. Run by `prepack`.
import { cpSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(pkgDir, "..", "..");

cpSync(join(repoRoot, "kit"), join(pkgDir, "kit"), { recursive: true });
copyFileSync(join(repoRoot, "kit.config.json"), join(pkgDir, "kit.config.json"));
copyFileSync(join(repoRoot, "portable-manifest.json"), join(pkgDir, "portable-manifest.json"));
// LICENSE lives at the repo root but must ship inside the flat tarball so the
// published package carries its own license text.
copyFileSync(join(repoRoot, "LICENSE"), join(pkgDir, "LICENSE"));
console.log("bundled kit assets into package");
