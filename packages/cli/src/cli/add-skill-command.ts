import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Command } from "commander";
import { emit } from "./emit.js";
import { loadKit } from "../kit/load-kit.js";
import { getKitRoot } from "../kit/embedded-kit.js";
import { renderSkillTemplate, isValidSlug } from "../kit/skill-template.js";

export interface AddSkillOpts {
  name: string;
  description: string;
  /** Kit root to add into (defaults to the resolved bundled/dev kit). */
  kitRoot?: string;
}

export interface AddSkillResult {
  path: string;
  slug: string;
}

/** Create a new canonical skill and verify it loads. Refuses dup/invalid names. */
export function runAddSkill(opts: AddSkillOpts): AddSkillResult {
  const slug = opts.name.trim();
  if (!isValidSlug(slug)) throw new Error(`invalid skill name: "${slug}" (use lowercase-with-hyphens)`);
  const kitRoot = opts.kitRoot ?? getKitRoot(dirname(fileURLToPath(import.meta.url)));
  const dir = join(kitRoot, "skills", slug);
  if (existsSync(dir)) throw new Error(`skill already exists: ${slug}`);
  mkdirSync(dir);
  const path = join(dir, "SKILL.md");
  try {
    writeFileSync(path, renderSkillTemplate({ slug, description: opts.description }), "utf8");
    const kit = loadKit(kitRoot);
    if (!kit.skills.some((s) => s.name === slug)) {
      throw new Error(`generated skill ${slug} failed validation`);
    }
    return { path, slug };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

export function registerAddSkill(program: Command): void {
  program
    .command("add-skill <name>")
    .description("Scaffold a new canonical skill in the kit")
    .option("--description <text>", "skill description")
    .action(async (name: string, opts: { description?: string }) => {
      let description = opts.description ?? "";
      if (!description && process.stdout.isTTY) {
        const { text, isCancel, cancel } = await import("@clack/prompts");
        const answer = await text({ message: `Description for ${name}`, placeholder: "When to use this skill" });
        if (isCancel(answer)) {
          cancel("Cancelled.");
          process.exit(0);
        }
        description = answer as string;
      }
      const res = runAddSkill({ name, description });
      emit(`created ${res.path} (name: av:${res.slug})`);
    });
}
