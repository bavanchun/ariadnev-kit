import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { readArchiveMember } from "../src/release/docs-bundle-generator.js";

export function verifyDocsBundleSidecars(
  archivePath: string,
  manifestPath: string,
  schemaPath: string,
): void {
  const archive = readFileSync(archivePath);
  const manifest = readFileSync(manifestPath);
  const schema = readFileSync(schemaPath);
  if (!readArchiveMember(archive, "manifest.json").equals(manifest)) {
    throw new Error("docs bundle manifest sidecar drifted from archive member");
  }
  if (!readArchiveMember(archive, "schemas/docs-bundle-manifest-v1.schema.json").equals(schema)) {
    throw new Error("docs bundle schema sidecar drifted from archive member");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [archivePath, manifestPath, schemaPath] = process.argv.slice(2);
    if (!archivePath || !manifestPath || !schemaPath) throw new Error("archive, manifest, and schema paths are required");
    verifyDocsBundleSidecars(archivePath, manifestPath, schemaPath);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
