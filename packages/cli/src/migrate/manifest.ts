import { readFileSync } from "node:fs";
import { z } from "zod";

const MigrationEntry = z.object({
  provider: z.string(),
  type: z.string(),
  from: z.string(),
  to: z.string(),
  since: z.string(),
});

const RenameEntry = z.object({ from: z.string(), to: z.string(), since: z.string() });

export const ManifestSchema = z.object({
  version: z.string(),
  kitVersion: z.string(),
  renames: z.array(RenameEntry).default([]),
  providerPathMigrations: z.array(MigrationEntry).default([]),
  sectionRenames: z.array(z.unknown()).default([]),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type Migration = z.infer<typeof MigrationEntry>;

/** Parse + validate a manifest object. Throws a clear error on malformed input. */
export function parseManifest(data: unknown): Manifest {
  const result = ManifestSchema.safeParse(data);
  if (!result.success) {
    throw new Error(`invalid portable-manifest: ${result.error.issues.map((i) => i.message).join("; ")}`);
  }
  return result.data;
}

export function loadManifest(path: string): Manifest {
  return parseManifest(JSON.parse(readFileSync(path, "utf8")));
}

/** Stable key identifying an applied migration. */
export function migrationKey(m: Migration): string {
  return `${m.provider}:${m.type}:${m.from}->${m.to}:${m.since}`;
}
