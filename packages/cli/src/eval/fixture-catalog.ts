import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { categoricalToken, sha256Digest } from "./categorical-token.js";
import { initializeGitRepository } from "./fixture-git.js";
import { parseStrictJson } from "./strict-json.js";

const catalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    fixtures: z.array(
      z
        .object({
          id: z.string(),
          path: z.string().min(1),
          digest: z.string(),
          initializeGit: z.boolean().optional(),
        })
        .strict(),
    ),
  })
  .strict();

export interface FixtureCatalogEntry {
  id: string;
  path: string;
  digest: string;
  initializeGit?: boolean;
}

export interface FixtureCatalogV1 {
  schemaVersion: 1;
  fixtures: FixtureCatalogEntry[];
}

const fixtureCopyBrand: unique symbol = Symbol("vcskill.fixture-copy");
export interface FixtureCopyV1 {
  readonly id: string;
  readonly root: string;
  readonly containerRoot: string;
  readonly digest: string;
  readonly copy: true;
  readonly [fixtureCopyBrand]: true;
}

export interface FixtureMaterializeOptions {
  parentDirectory?: string;
  deps?: {
    copyTree?(source: string, target: string): void;
    initializeGit?(root: string): void;
  };
}

function inside(root: string, candidate: string): boolean {
  const offset = relative(root, candidate);
  return offset !== "" && !offset.startsWith("..") && !isAbsolute(offset);
}

function fixtureFiles(root: string, directory = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === ".git") continue;
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`fixture symlinks are forbidden: ${relative(root, path)}`);
    if (entry.isDirectory()) files.push(...fixtureFiles(root, path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

export function computeFixtureDigest(root: string): string {
  const source = realpathSync(root);
  const files = fixtureFiles(source);
  if (files.length === 0) throw new Error(`${root}: fixture must contain at least one file`);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(source, file).split(sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

export function loadFixtureCatalog(catalogPath: string): FixtureCatalogV1 {
  const value = parseStrictJson(readFileSync(catalogPath, "utf8"), `${catalogPath}: fixture catalog`);
  const parsed = catalogSchema.parse(value);
  const fixtures = parsed.fixtures.map((fixture) => ({
    ...fixture,
    id: categoricalToken(fixture.id, "fixture.id"),
    digest: sha256Digest(fixture.digest, "fixture.digest"),
  }));
  if (new Set(fixtures.map((fixture) => fixture.id)).size !== fixtures.length) {
    throw new Error(`${catalogPath}: fixture ids must be unique`);
  }
  return { schemaVersion: 1, fixtures };
}

export function resolveFixtureSource(catalogPath: string, fixtureId: string) {
  const catalog = loadFixtureCatalog(catalogPath);
  const fixture = catalog.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!fixture) throw new Error(`fixture not found: ${fixtureId}`);
  const catalogRoot = realpathSync(dirname(catalogPath));
  if (isAbsolute(fixture.path)) throw new Error(`fixture path escapes catalog: ${fixture.id}`);
  const unresolved = resolve(catalogRoot, fixture.path);
  if (!inside(catalogRoot, unresolved)) throw new Error(`fixture path escapes catalog: ${fixture.id}`);
  const source = realpathSync(unresolved);
  if (!inside(catalogRoot, source)) throw new Error(`fixture path escapes catalog: ${fixture.id}`);
  if (computeFixtureDigest(source) !== fixture.digest) throw new Error(`fixture digest mismatch: ${fixture.id}`);
  return { ...fixture, root: source };
}

export function copyScenarioFixture(
  catalogPath: string,
  fixtureId: string,
  options: FixtureMaterializeOptions = {},
): FixtureCopyV1 {
  const source = resolveFixtureSource(catalogPath, fixtureId);
  const parent = realpathSync(options.parentDirectory ?? tmpdir());
  const containerRoot = mkdtempSync(join(parent, "vcskill-eval-"));
  const staging = join(containerRoot, ".materializing");
  const target = join(containerRoot, "workspace");
  try {
    if (inside(source.root, containerRoot) || inside(containerRoot, source.root)) {
      throw new Error("fixture destination overlaps frozen source");
    }
    const copyTree = options.deps?.copyTree ?? ((from: string, to: string) => {
      cpSync(from, to, { errorOnExist: true, force: false, recursive: true });
    });
    copyTree(source.root, staging);
    if (computeFixtureDigest(staging) !== source.digest) throw new Error(`fixture copy digest mismatch: ${fixtureId}`);
    renameSync(staging, target);
    if (source.initializeGit) {
      (options.deps?.initializeGit ?? initializeGitRepository)(target);
      if (computeFixtureDigest(target) !== source.digest) throw new Error(`fixture post-git digest mismatch: ${fixtureId}`);
    }
    const copy = { id: fixtureId, root: target, containerRoot, digest: source.digest, copy: true } as FixtureCopyV1;
    Object.defineProperty(copy, fixtureCopyBrand, { value: true });
    return Object.freeze(copy);
  } catch (error) {
    rmSync(containerRoot, { force: true, recursive: true });
    throw error;
  }
}

export function isFixtureCopy(value: unknown): value is FixtureCopyV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.isFrozen(value) &&
    Object.prototype.hasOwnProperty.call(value, fixtureCopyBrand)
  );
}
