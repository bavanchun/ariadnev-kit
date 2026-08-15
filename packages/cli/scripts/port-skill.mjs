#!/usr/bin/env node
// port-skill.mjs — copy one upstream skill tree into the kit, rebranded.
//
// The content is not ours to rewrite: everything here is a copy, and the only
// edits are identifiers. That makes the substitution table the whole risk. Every
// rule is anchored to a token boundary, because the upstream alias is two
// letters that live inside ordinary English — a substring hunt would turn
// "make" into "mave" across a hundred skills and nobody would notice until a
// sentence read wrong months later.
//
// Binary files are copied byte for byte and never scanned. A font is not text
// no matter what its extension suggests, and a "rewrite" of one is a corruption.
//
// Usage:
//   node packages/cli/scripts/port-skill.mjs --source <dir> --dest <dir> [--dry-run]
//   node packages/cli/scripts/port-skill.mjs --report   (print the table)

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

/** Extensions rewritten as text. Everything else is copied as bytes. */
export const TEXT_EXT = new Set([
  ".md", ".markdown", ".txt", ".json", ".jsonc", ".yml", ".yaml", ".toml",
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".sh", ".bash", ".zsh",
  ".css", ".scss", ".html", ".svg", ".sql", ".rb", ".go", ".rs", ".env", ".example",
]);

/** Files copied verbatim: their content is data, and a rebrand would falsify it. */
export const VERBATIM_FILES = new Set(["LICENSE", "LICENSE.md", "LICENSE.txt", "NOTICE"]);

/**
 * Directories that are output, not source. `__pycache__` is the one that
 * actually showed up: bytecode compiled by whatever Python happened to run the
 * skill on this machine, absent from the upstream hash manifest because upstream
 * never shipped it. Copying it would ship one machine's interpreter version to
 * everyone else's.
 */
export const SKIP_DIRS = new Set(["__pycache__", ".git", "node_modules", ".venv", ".pytest_cache", ".mypy_cache", ".DS_Store"]);

/**
 * Ordered substitutions. Most specific first: a later rule must never be able to
 * re-match text an earlier one already rewrote.
 */
export const REPLACEMENTS = [
  // Skill and agent namespaces. `ak:cook` is a name; `ak-frontend-design` is a
  // directory or an agent id. Both are followed by a name character, which is
  // what separates them from prose.
  // `<` and `*` cover the placeholder forms upstream writes in docs: `/ak:<slug>`
  // and `ak:*`, which name the namespace rather than one skill.
  [/(?<![\w-])ak:(?=[A-Za-z0-9<*])/g, "av:"],
  [/(?<![\w-])ck:(?=[A-Za-z0-9<*])/g, "av:"],
  [/(?<![\w-])ak-(?=[a-z0-9])/g, "av-"],
  // The product name, in each casing, and NOT boundary-anchored. Unlike the
  // two-letter alias, these strings are never anything but the brand: upstream
  // glues them to other characters (a payment memo `CLAUDEKIT4e46…`, an
  // identifier `claudekitMatch`), and a boundary rule leaves exactly those
  // behind. Uppercase runs first so `AGENTKIT_HOME` becomes `ARIADNEV_HOME`.
  [/AGENTKIT/g, "ARIADNEV"],
  [/CLAUDEKIT/g, "ARIADNEV"],
  [/AgentKit/g, "ariadnev"],
  [/ClaudeKit/g, "ariadnev"],
  [/agentkit/g, "ariadnev"],
  [/claudekit/g, "ariadnev"],
  // The bare alias, as a standalone word. This is deliberately the exact pattern
  // the residue check hunts for, so anything the rewrite leaves behind is a bug
  // in the rule rather than a judgement call made twice. Two letters are safe to
  // rewrite here only because the boundaries exclude them inside a word
  // ("make", "break") and after a path separator (`./ak`) — the corpus turned up
  // no case where a standalone `ak` meant anything but the binary.
  [/(?<![\w./-])ak(?![\w:.-])/g, "av"],
];

/** Identifiers that must not survive; reported per file when they do. */
export const RESIDUE = [
  { id: "skill-namespace", rx: /(?<![\w-])(?:ak|ck):/g },
  { id: "agent-namespace", rx: /(?<![\w-])ak-(?=[a-z0-9])/g },
  { id: "env-prefix", rx: /AGENTKIT_|CLAUDEKIT_/g },
  { id: "product", rx: /agentkit|claudekit/gi },
  { id: "bare-alias", rx: /(?<![\w./-])ak(?![\w:.-])/g },
];

export function rewriteText(text) {
  let out = text;
  for (const [rx, to] of REPLACEMENTS) out = out.replace(rx, to);
  return out;
}

/**
 * Mark a ported SKILL.md as what it is.
 *
 * Two reasons, and neither is bookkeeping. The upstream `author: agentkit` would
 * otherwise be rewritten to this project's name, which would put our name on
 * someone else's writing — `upstream` is the true answer. And the authoring lint
 * needs to tell a file we wrote from a file we copied: the house rules about
 * required sections and description length apply to the first and cannot apply
 * to the second without rewriting content this port promised to leave alone.
 */
export function markPorted(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return text;
  let front = match[1];
  front = front.replace(/^(\s*author:\s*)ariadnev\s*$/m, "$1upstream");
  if (/^metadata:\s*$/m.test(front)) {
    if (!/^\s+origin:/m.test(front)) {
      front = front.replace(/^metadata:\s*$/m, "metadata:\n  origin: ported");
    }
  } else {
    front = `${front}\nmetadata:\n  origin: ported`;
  }
  return `---\n${front}\n---\n${text.slice(match[0].length)}`;
}

export function residueIn(text) {
  const hits = [];
  for (const { id, rx } of RESIDUE) {
    for (const match of text.matchAll(rx)) hits.push({ id, at: match.index, text: match[0] });
  }
  return hits;
}

export function isTextFile(name) {
  if (VERBATIM_FILES.has(name)) return false;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return true; // extensionless files in a skill are prose
  return TEXT_EXT.has(name.slice(dot));
}

function walk(dir, rel, out) {
  for (const entry of readdirSync(dir).sort()) {
    if (entry === ".DS_Store") continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(abs, join(rel, entry), out);
      continue;
    }
    out.push({ abs, rel: join(rel, entry) });
  }
  return out;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Port one skill tree.
 *
 * @param {{source: string, dest: string, dryRun?: boolean, hashes?: Record<string,string>}} opts
 */
export function portSkill(opts) {
  const files = walk(opts.source, "", []);
  const report = { files: files.length, rewritten: 0, binary: 0, residue: [], unverified: [], mismatched: [] };

  for (const file of files) {
    const bytes = readFileSync(file.abs);
    // Integrity first: the upstream kit ships a hash of every file it installed,
    // so a file that has been edited since — by a person or by another tool — is
    // visible before it is copied, rather than being adopted as canon.
    if (opts.hashes) {
      const expected = opts.hashes[file.abs];
      if (!expected) report.unverified.push(file.rel);
      else if (expected !== sha256(bytes)) report.mismatched.push(file.rel);
    }

    const target = join(opts.dest, file.rel);
    if (!isTextFile(basename(file.rel))) {
      report.binary += 1;
      if (!opts.dryRun) {
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(file.abs, target);
      }
      continue;
    }

    const original = bytes.toString("utf8");
    let ported = rewriteText(original);
    if (basename(file.rel) === "SKILL.md" && dirname(file.rel) === ".") ported = markPorted(ported);
    if (ported !== original) report.rewritten += 1;
    for (const hit of residueIn(ported)) report.residue.push({ file: file.rel, ...hit });
    if (!opts.dryRun) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, ported);
    }
  }
  return report;
}

function loadHashes(path) {
  if (!path || !existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[(i += 1)] : "true";
      args.set(key, value);
    }
  }
  if (args.has("report")) {
    for (const [rx, to] of REPLACEMENTS) console.log(`${String(rx)}  ->  ${to}`);
    return 0;
  }
  const source = args.get("source");
  const dest = args.get("dest");
  if (!source || !dest) {
    console.error("usage: port-skill.mjs --source <dir> --dest <dir> [--dry-run] [--hashes <file>]");
    return 1;
  }
  const report = portSkill({
    source,
    dest,
    dryRun: args.get("dry-run") === "true",
    hashes: loadHashes(args.get("hashes")),
  });
  console.log(
    `${relative(process.cwd(), dest)}: ${report.files} files (${report.binary} binary), ${report.rewritten} rewritten`,
  );
  for (const label of ["unverified", "mismatched"]) {
    if (report[label].length > 0) console.log(`  ${label}: ${report[label].length} — ${report[label].slice(0, 5).join(", ")}`);
  }
  for (const hit of report.residue) console.log(`  RESIDUE ${hit.id} in ${hit.file}: ${hit.text}`);
  return report.residue.length > 0 || report.mismatched.length > 0 ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.argv.slice(2)));
