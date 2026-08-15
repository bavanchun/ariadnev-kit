#!/usr/bin/env node
// check-brand-drift.mjs — fail if any old-brand identifier survives the rename.
//
// Scans every tracked text file except the historical-record allowlist below.
// Exits non-zero with a file:line report so CI blocks a partial rename; a
// rename that leaves identifiers behind only shows up at runtime otherwise,
// when a path or env var silently points at nothing.
//
// Usage:
//   node packages/cli/scripts/check-brand-drift.mjs [--list] [--json]
//     --list  print one path per hit-bearing file instead of every line
//     --json  machine-readable report

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");

// Each entry states why the file is exempt. These record what was true at a past
// version; rewriting the brand inside them would make them lie. Adding an entry
// is a reviewable change — it must be a historical record, never a file that
// simply has not been renamed yet.
const ALLOWLIST = [
  { prefix: "evals/baselines/", why: "frozen baselines pin a specific tag, commit, and tree hash" },
  { prefix: "docs/journal/", why: "dated journal entries record what happened under the old name" },
  { prefix: "docs/decisions/0001-", why: "ADR describing a decision made under the old name" },
  { prefix: "docs/decisions/0002-", why: "ADR describing a decision made under the old name" },
  { prefix: "docs/decisions/0003-", why: "ADR describing a decision made under the old name" },
  { prefix: "docs/decisions/0004-", why: "ADR describing a decision made under the old name" },
  { prefix: "docs/decisions/0005-", why: "ADR describing a decision made under the old name" },
  { prefix: "docs/decisions/0006-", why: "ADR naming the upstream paths and generators the verification evidence was checked against" },
  { prefix: "docs/decisions-ledger-historical.json", why: "retired claim ledger, kept verbatim as a record" },
  { prefix: "plans/", why: "dated plans and reports describe work as it was scoped" },
  { prefix: "packages/cli/CHANGELOG.md", why: "release history under the published package name" },
  { prefix: "packages/cli/scripts/check-brand-drift.mjs", why: "this gate names the patterns it hunts for" },
  { prefix: "packages/cli/scripts/port-skill.mjs", why: "the port's substitution table names the identifiers it rewrites" },
  { prefix: "packages/cli/scripts/port-skill.test.mjs", why: "proves the substitution table, so it must state both sides of it" },
  { prefix: ".gitignore", why: "deliberately keeps the old state dir ignored for checkouts installed before the rename" },
];

// A single line may opt out with a trailing `brand-drift-allow: <reason>`
// comment. This exists for backward-compatible readers — code that must still
// recognize data written under the old name (AGENTS.md markers, old receipt
// keys). Line-scoped so it can never exempt a whole file by accident.
const INLINE_ALLOW = /brand-drift-allow:/;

// Ordered most-specific first so a hit reports the narrowest identifier.
//
// Two brands are hunted here, for two different reasons. The `vc*` family is the
// project's own former name — leaving one behind points a path or an env var at
// nothing. The `ak`/AgentKit/claudekit family is the *upstream* kit this one was
// ported from: the requirement is that no identifier of it survives anywhere in
// the tree, so the gate has to look for it rather than trusting a port to have
// been thorough. A bare `ak` is checked the same way a bare `vc` is — matched
// only as a standalone word, because those two letters live inside ordinary
// English ("make", "break") and a naive substring hunt would report every one.
const PATTERNS = [
  { id: "upstream-env-prefix", rx: /AGENTKIT_|CLAUDEKIT_/g },
  { id: "upstream-package", rx: /agentkit|claudekit/gi },
  { id: "upstream-state-dir", rx: /\.agentkit\b/g },
  { id: "upstream-skill-namespace", rx: /(?<![\w-])(?:ak|ck):/g },
  { id: "upstream-bare-alias", rx: /(?<![\w.-])ak(?![\w:.-])/g },
  { id: "repo-consumer", rx: /bavanchun\/vcskill/gi },
  { id: "domain", rx: /vcskill\.dev|vchun\.dev/gi },
  { id: "env-prefix", rx: /VCSKILL_/g },
  { id: "package", rx: /vcskill/gi },
  { id: "skill-namespace", rx: /(?<![\w-])vc:/g },
  { id: "agent-namespace", rx: /(?<![\w-])vc-(?![\w-]*\.(?:png|jpg)\b)/g },
  // `/` must NOT be excluded on either side: the hook install dir is
  // `.claude/hooks/vc/`, and treating a slash as part of the word hides it.
  { id: "bare-alias", rx: /(?<![\w.-])vc(?![\w:.-])/g },
];

function allowed(path) {
  return ALLOWLIST.some((entry) => path.startsWith(entry.prefix));
}

// Scan by extension rather than sniffing for NUL bytes: a NUL is a legitimate
// separator inside source (description-collision.ts joins a pair key with one),
// and sniffing would silently skip exactly the file that needs checking.
const TEXT_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml",
  ".sh", ".ps1", ".toml", ".txt", ".html", ".css", ".py", ".lock", ".schema",
]);

function isText(path) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return true; // extensionless (LICENSE, .gitignore, Dockerfile)
  return TEXT_EXT.has(base.slice(dot));
}

const tracked = execFileSync("git", ["-C", REPO, "ls-files", "-z"], { maxBuffer: 64 * 1024 * 1024 })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const hits = [];
for (const path of tracked) {
  if (allowed(path) || !isText(path)) continue;
  let text;
  try {
    text = readFileSync(join(REPO, path), "utf8");
  } catch {
    continue; // unreadable or gone
  }

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (INLINE_ALLOW.test(lines[i])) continue;
    for (const { id, rx } of PATTERNS) {
      rx.lastIndex = 0;
      const match = rx.exec(lines[i]);
      if (!match) continue;
      hits.push({ path, line: i + 1, pattern: id, text: lines[i].trim().slice(0, 160) });
      break; // one finding per line — the narrowest pattern that matched
    }
  }
}

const files = [...new Set(hits.map((h) => h.path))];

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ok: hits.length === 0, files: files.length, hits }, null, 2));
} else if (process.argv.includes("--list")) {
  for (const f of files) console.log(f);
  console.error(`\n${hits.length} hit(s) across ${files.length} file(s).`);
} else {
  for (const h of hits) console.log(`${h.path}:${h.line} [${h.pattern}] ${h.text}`);
  if (hits.length > 0) {
    console.error(`\nbrand drift: ${hits.length} hit(s) across ${files.length} file(s).`);
    console.error("Rename them, or — only for a historical record — add an allowlist entry with a reason.");
  } else {
    console.error("brand drift: clean.");
  }
}

process.exitCode = hits.length === 0 ? 0 : 1;
