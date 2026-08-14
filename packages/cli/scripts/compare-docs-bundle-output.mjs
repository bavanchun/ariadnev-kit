import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = [
  "docs-bundle.tar.gz",
  "docs-bundle.manifest.json",
  "docs-bundle-manifest-v1.schema.json",
];

export function compareDocsBundleOutput(leftDirectory, rightDirectory) {
  for (const asset of ASSETS) {
    if (!readFileSync(join(leftDirectory, asset)).equals(readFileSync(join(rightDirectory, asset)))) {
      throw new Error(`deterministic docs bundle mismatch: ${asset}`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [leftDirectory, rightDirectory] = process.argv.slice(2);
    if (!leftDirectory || !rightDirectory) throw new Error("two docs bundle directories are required");
    compareDocsBundleOutput(leftDirectory, rightDirectory);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
