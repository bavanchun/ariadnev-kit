import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import matter from "gray-matter";
import type { Artifact, ArtifactType, Kit } from "./kit-types.js";

export class KitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KitValidationError";
  }
}

/**
 * Walk up from `start` to find the kit root (a dir holding `skills/`).
 * Works in dev (nested `packages/cli`) and the flat published layout where
 * `dist/` and `kit/` are siblings — callers pass the candidate kit dir or a
 * descendant and we resolve to the nearest ancestor containing `skills/`.
 */
export function resolveKitRoot(start: string): string {
  let dir = start;
  // Direct hit: start already a kit root.
  if (existsSync(join(dir, "skills"))) return dir;
  for (;;) {
    const candidate = join(dir, "kit");
    if (existsSync(join(candidate, "skills"))) return candidate;
    const parent = join(dir, "..");
    if (parent === dir) {
      throw new KitValidationError(`kit root not found from ${start}`);
    }
    dir = parent;
  }
}

function readArtifact(type: ArtifactType, name: string, filePath: string): Artifact {
  const raw = readFileSync(filePath, "utf8");
  const parsed = matter(raw);
  return {
    type,
    name,
    frontmatter: parsed.data ?? {},
    body: parsed.content.replace(/^\n+/, ""),
    raw,
    sourcePath: filePath,
  };
}

function loadSkills(kitRoot: string): Artifact[] {
  const skillsDir = join(kitRoot, "skills");
  if (!existsSync(skillsDir)) return [];
  const out: Artifact[] = [];
  const seen = new Set<string>();
  for (const entry of readdirSync(skillsDir)) {
    const dir = join(skillsDir, entry);
    const skillMd = join(dir, "SKILL.md");
    if (!statSync(dir).isDirectory() || !existsSync(skillMd)) continue;
    const artifact = readArtifact("skill", entry, skillMd);
    validateSkill(artifact);
    if (seen.has(artifact.name)) {
      throw new KitValidationError(`duplicate skill name: ${artifact.name}`);
    }
    seen.add(artifact.name);
    out.push(artifact);
  }
  return out;
}

function validateSkill(artifact: Artifact): void {
  const { name, description } = artifact.frontmatter as {
    name?: unknown;
    description?: unknown;
  };
  const expected = `vc:${artifact.name}`;
  if (typeof name !== "string" || name !== expected) {
    throw new KitValidationError(
      `skill "${artifact.name}": frontmatter name must equal "${expected}" (got ${String(name)})`,
    );
  }
  if (typeof description !== "string" || description.trim().length === 0) {
    throw new KitValidationError(`skill "${artifact.name}": missing description`);
  }
}

function loadFlat(kitRoot: string, sub: string, type: ArtifactType): Artifact[] {
  const dir = join(kitRoot, sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => readArtifact(type, basename(f, ".md"), join(dir, f)));
}

export function loadKit(kitRoot: string): Kit {
  const scriptsDir = join(kitRoot, "scripts");
  const envExample = join(kitRoot, ".env.example");
  return {
    root: kitRoot,
    skills: loadSkills(kitRoot),
    agents: loadFlat(kitRoot, "agents", "agent"),
    commands: loadFlat(kitRoot, "commands", "command"),
    rules: loadFlat(kitRoot, "rules", "rule"),
    scriptsDir: existsSync(scriptsDir) ? scriptsDir : null,
    envExample: existsSync(envExample) ? envExample : null,
  };
}
