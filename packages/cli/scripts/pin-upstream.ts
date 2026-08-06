#!/usr/bin/env bun

import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import matter from "gray-matter";
import { extractClaims } from "../src/kit/claim-extract.js";
import { canonicalUpstreamDigest, type UpstreamDigestEntry } from "../src/kit/upstream-digest.js";

const EXCLUDED_DIRS = new Set([".git", "node_modules", "__pycache__", "dist", "build", "coverage"]);

function excludedFile(name: string): boolean {
  return name === ".DS_Store" || name.endsWith(".pyc");
}

export function collectAuthoredTree(root: string): UpstreamDigestEntry[] {
  if (lstatSync(root).isSymbolicLink()) throw new Error("symlink is not allowed: source root");
  const entries: UpstreamDigestEntry[] = [];

  function walk(dir: string, relativeDir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`symlink is not allowed: ${relativePath}`);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) walk(join(dir, entry.name), relativePath);
        continue;
      }
      if (entry.isFile()) {
        if (!excludedFile(entry.name)) {
          entries.push({ path: relativePath, content: readFileSync(join(dir, entry.name)) });
        }
        continue;
      }
      throw new Error(`unsupported non-regular file: ${relativePath}`);
    }
  }

  walk(root, "");
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  return entries;
}

export function pinUpstream(root: string) {
  const entries = collectAuthoredTree(root);
  const skill = entries.find((entry) => entry.path === "SKILL.md");
  if (!skill) throw new Error(`SKILL.md not found in ${root}`);
  const parsed = matter(Buffer.from(skill.content).toString("utf8"));
  const upstream = parsed.data.name;
  const version = parsed.data.metadata?.version ?? parsed.data.version;
  if (typeof upstream !== "string" || !upstream.startsWith("ak:")) {
    throw new Error(`upstream name must be an ak:<slug> id in ${root}/SKILL.md`);
  }
  if (typeof version !== "string" || version.length === 0) {
    throw new Error(`upstream version missing in ${root}/SKILL.md`);
  }

  const claimTexts = new Set<string>();
  for (const entry of entries) {
    if (!entry.path.endsWith(".md")) continue;
    for (const claim of extractClaims(Buffer.from(entry.content).toString("utf8"))) {
      claimTexts.add(claim);
    }
  }

  return {
    upstream,
    upstream_version: version,
    upstream_digest: canonicalUpstreamDigest(entries),
    claims: [...claimTexts].map((text, index) => ({
      id: `c${String(index + 1).padStart(3, "0")}`,
      text,
      status: "unclassified",
    })),
  };
}

if (import.meta.main) {
  const root = process.argv[2];
  if (!root) {
    console.error(`usage: ${basename(process.argv[1])} <ak-skill-dir>`);
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(pinUpstream(root), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
