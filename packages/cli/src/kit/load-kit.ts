import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import matter from "gray-matter";
import type { Artifact, ArtifactType, HookManifest, Kit, KitHook } from "./kit-types.js";
import { lintSkill, type ReferenceFile } from "./skill-lint.js";
import { lintAgent } from "./agent-lint.js";
import { KitValidationError } from "./kit-validation-error.js";
import { assertKnownHookEvents } from "./hook-events.js";
import { hookBindingSpecs } from "./hook-bindings.js";
// One ignore list for both walkers: if the loader accepted a tree the installer
// never copies, `validate` would pass on files that can never reach a provider.
import { IGNORE_DIRS } from "../install/install-types.js";
import { loadWorkflows } from "./load-workflows.js";

export { KitValidationError } from "./kit-validation-error.js";

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

/**
 * Exported for the lint-exemption ratchet, which must lint the same artifact
 * shape production does. A hand-rolled copy in the test would answer a slowly
 * different question every time this one changes.
 */
export function readArtifact(type: ArtifactType, name: string, filePath: string): Artifact {
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

/** Exported alongside `readArtifact`, and for the same reason. */
export function readReferenceFiles(skillDir: string): ReferenceFile[] {
  const refsDir = join(skillDir, "references");
  if (!existsSync(refsDir)) return [];
  return readdirSync(refsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({
      name: join("references", f),
      content: readFileSync(join(refsDir, f), "utf8"),
    }));
}

/**
 * Skills still held to the old lint severity, from `kit/skills-lint-exempt.json`.
 *
 * Read here rather than in `skill-lint.ts` because this module has the kit root
 * and that one is pure by contract. A missing or malformed file exempts nobody:
 * the strict reading is the safe one, and a silently-empty allowlist surfaces
 * immediately as lint errors rather than as a quiet loss of coverage.
 */
export function exemptSkillNames(kitRoot: string): Set<string> {
  try {
    const parsed = JSON.parse(readFileSync(join(kitRoot, "skills-lint-exempt.json"), "utf8")) as {
      exempt?: unknown;
    };
    if (!Array.isArray(parsed.exempt)) return new Set();
    return new Set(parsed.exempt.filter((name): name is string => typeof name === "string"));
  } catch {
    return new Set();
  }
}

function loadSkills(kitRoot: string, warnings: string[], held: string[]): Artifact[] {
  const skillsDir = join(kitRoot, "skills");
  if (!existsSync(skillsDir)) return [];
  const exemptNames = exemptSkillNames(kitRoot);
  const out: Artifact[] = [];
  const seen = new Set<string>();
  for (const entry of readdirSync(skillsDir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const dir = join(skillsDir, entry);
    const skillMd = join(dir, "SKILL.md");
    if (!statSync(dir).isDirectory() || !existsSync(skillMd)) continue;
    const artifact = readArtifact("skill", entry, skillMd);
    validateSkill(artifact);
    const lint = lintSkill(artifact, readReferenceFiles(dir), exemptNames);
    if (lint.errors.length > 0) {
      throw new KitValidationError(lint.errors.join("\n"));
    }
    warnings.push(...lint.warnings);
    held.push(...lint.held);
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
  const expected = `av:${artifact.name}`;
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

function loadAgents(kitRoot: string): Artifact[] {
  const agents = loadFlat(kitRoot, "agents", "agent");
  for (const agent of agents) {
    const lint = lintAgent(agent, agent.name);
    if (lint.errors.length > 0) {
      throw new KitValidationError(lint.errors.join("\n"));
    }
  }
  return agents;
}

function loadHooks(kitRoot: string): KitHook[] {
  const hooksDir = join(kitRoot, "hooks");
  if (!existsSync(hooksDir)) return [];
  const out: KitHook[] = [];
  for (const entry of readdirSync(hooksDir)) {
    // `_lib` and friends hold shared helpers, not installable hooks. A dot-dir
    // is not one either: the hooks write their own `.logs` beside themselves at
    // runtime, so it appears in every installed tree and in any checkout where a
    // hook has been run — treating it as a malformed hook would fail the load.
    if (entry.startsWith("_") || entry.startsWith(".") || IGNORE_DIRS.has(entry)) continue;
    const dir = join(hooksDir, entry);
    if (!statSync(dir).isDirectory()) continue;
    const file = join(dir, "hook.cjs");
    const manifestPath = join(dir, "hook.json");
    if (!existsSync(file)) {
      throw new KitValidationError(`hook "${entry}": missing hook.cjs`);
    }
    if (!existsSync(manifestPath)) {
      throw new KitValidationError(`hook "${entry}": missing hook.json manifest`);
    }
    let manifest: HookManifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as HookManifest;
    } catch (err) {
      throw new KitValidationError(`hook "${entry}": invalid hook.json (${String(err)})`);
    }
    const hasEvent = typeof manifest.event === "string" && manifest.event.length > 0;
    const hasEvents =
      Array.isArray(manifest.events) &&
      manifest.events.length > 0 &&
      manifest.events.every((e) => typeof e === "string" && e.length > 0);
    const hasBindings = Array.isArray(manifest.bindings) && manifest.bindings.length > 0;
    if (hasBindings) {
      for (const binding of manifest.bindings!) {
        if (typeof binding?.event !== "string" || binding.event.length === 0) {
          throw new KitValidationError(`hook "${entry}": every bindings[] entry must declare an event`);
        }
      }
    } else if (!hasEvent && !hasEvents) {
      throw new KitValidationError(`hook "${entry}": manifest must declare an event (or events[]/bindings[])`);
    }
    if (typeof manifest.description !== "string" || manifest.description.length === 0) {
      throw new KitValidationError(`hook "${entry}": manifest must declare a description`);
    }
    // A well-formed but unrecognized event name is the failure this catches:
    // the hook installs, binds, and then never fires, with nothing to report it.
    assertKnownHookEvents(entry, hookBindingSpecs(manifest).map((b) => b.event));
    out.push({ name: entry, manifest, file });
  }
  return out;
}

export function loadKit(kitRoot: string): Kit {
  const scriptsDir = join(kitRoot, "scripts");
  const envExample = join(kitRoot, ".env.example");
  const warnings: string[] = [];
  const held: string[] = [];
  const skills = loadSkills(kitRoot, warnings, held);
  const agents = loadAgents(kitRoot);
  return {
    root: kitRoot,
    skills,
    agents,
    ...(existsSync(join(kitRoot, "statusline", "av-statusline.cjs"))
      ? { statusline: join(kitRoot, "statusline", "av-statusline.cjs") }
      : {}),
    commands: loadFlat(kitRoot, "commands", "command"),
    outputStyles: loadFlat(kitRoot, "output-styles", "outputStyle"),
    rules: loadFlat(kitRoot, "rules", "rule"),
    hooks: loadHooks(kitRoot),
    workflows: loadWorkflows(kitRoot, skills, agents),
    scriptsDir: existsSync(scriptsDir) ? scriptsDir : null,
    envExample: existsSync(envExample) ? envExample : null,
    warnings,
    held,
  };
}
