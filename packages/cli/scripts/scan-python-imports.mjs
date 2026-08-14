// Draft a runtime-dependency declaration for skills that ship Python but
// declare nothing. Most `requirements.txt` files in the source declare only
// pytest — that says what the tests need, not what the scripts need — so the
// only way to know a script's real imports is to read them.
//
// The output is a DRAFT for a human to review, never something to install
// from: a module name does not reliably identify its distribution package
// (`PIL` ships as `pillow`, `cv2` as `opencv-python`). Anything not in the map
// below is reported as unknown rather than guessed at.
//
// Usage: node scan-python-imports.mjs <skills-root> [--json]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";

const IGNORE_DIRS = new Set([".git", "node_modules", "__pycache__", ".venv", "venv", "vendor"]);

/** Import module → PyPI distribution. Only entries verified by hand belong here. */
const MODULE_TO_PACKAGE = {
  PIL: "pillow",
  cv2: "opencv-python",
  yaml: "pyyaml",
  bs4: "beautifulsoup4",
  docx: "python-docx",
  pptx: "python-pptx",
  fitz: "pymupdf",
  dotenv: "python-dotenv",
  sklearn: "scikit-learn",
  serial: "pyserial",
  dateutil: "python-dateutil",
  OpenSSL: "pyopenssl",
  Crypto: "pycryptodome",
  git: "gitpython",
  jwt: "pyjwt",
  markdown: "markdown",
  numpy: "numpy",
  pandas: "pandas",
  matplotlib: "matplotlib",
  networkx: "networkx",
  requests: "requests",
  anthropic: "anthropic",
  mcp: "mcp",
  openpyxl: "openpyxl",
  pdfplumber: "pdfplumber",
  pypdf: "pypdf",
  playwright: "playwright",
  scrapling: "scrapling",
  whoisdomain: "whoisdomain",
  pytest: "pytest",
};

/** Module names the interpreter itself provides — never a dependency. */
function stdlibModules() {
  const src = "import sys, json; print(json.dumps(sorted(sys.stdlib_module_names)))";
  try {
    return new Set(JSON.parse(execFileSync("python3", ["-c", src], { encoding: "utf8" })));
  } catch {
    throw new Error("python3 is required to enumerate the standard library");
  }
}

function pythonFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) pythonFiles(join(dir, entry.name), acc);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".py")) acc.push(join(dir, entry.name));
  }
  return acc;
}

/**
 * Top-level module of every import in a file. Deliberately line-based: a full
 * Python parse would be more precise, but imports inside `try:` blocks and
 * platform guards are exactly the ones a dependency draft must still surface.
 */
export function importedModules(source) {
  const modules = new Set();
  for (const line of source.split("\n")) {
    // Strip trailing comments: `import Foundation  # check if pyobjc …` must
    // not turn the comment into part of the module name.
    const trimmed = line.split("#")[0].trim();
    if (trimmed === "") continue;
    const from = /^from\s+([A-Za-z_][\w.]*)\s+import\s/.exec(trimmed);
    if (from) {
      if (!from[1].startsWith(".")) modules.add(from[1].split(".")[0]);
      continue;
    }
    const plain = /^import\s+(.+)$/.exec(trimmed);
    if (!plain) continue;
    for (const part of plain[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && !name.startsWith(".")) modules.add(name.split(".")[0]);
    }
  }
  return modules;
}

/** Third-party imports of one skill, split into mapped packages and unknowns. */
export function scanSkill(skillDir, stdlib, localModules = new Set()) {
  const files = pythonFiles(skillDir);
  const external = new Set();
  for (const file of files) {
    for (const mod of importedModules(readFileSync(file, "utf8"))) {
      if (stdlib.has(mod) || localModules.has(mod)) continue;
      external.add(mod);
    }
  }
  const packages = [];
  const unknown = [];
  for (const mod of [...external].sort()) {
    if (MODULE_TO_PACKAGE[mod]) packages.push(MODULE_TO_PACKAGE[mod]);
    else unknown.push(mod);
  }
  return { files: files.length, packages: [...new Set(packages)].sort(), unknown };
}

/** Sibling .py files are local imports, not dependencies. */
function localModuleNames(skillDir) {
  return new Set(pythonFiles(skillDir).map((f) => f.split("/").pop().replace(/\.py$/, "")));
}

function main() {
  const [root, ...flags] = process.argv.slice(2);
  if (!root) throw new Error("usage: scan-python-imports.mjs <skills-root> [--json]");
  const stdlib = stdlibModules();

  const results = [];
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name);
    // The ignore list applies at the top level too — a `.venv` beside the
    // skills holds thousands of installed packages, whose own imports say
    // nothing about what the skills need.
    if (IGNORE_DIRS.has(name) || !statSync(dir).isDirectory()) continue;
    const scan = scanSkill(dir, stdlib, localModuleNames(dir));
    if (scan.files === 0) continue;
    results.push({ skill: name, ...scan });
  }

  if (flags.includes("--json")) {
    console.log(JSON.stringify({ root: relative(process.cwd(), root) || root, results }, null, 2));
    return;
  }

  console.log(`# Python dependency draft — REVIEW BEFORE USE\n`);
  console.log(`Scanned ${results.length} skill(s) shipping Python under ${root}\n`);
  for (const r of results) {
    const deps = r.packages.length ? r.packages.join(", ") : "(stdlib only)";
    console.log(`- ${r.skill} — ${r.files} file(s): ${deps}`);
    if (r.unknown.length) console.log(`    unknown module(s), map by hand: ${r.unknown.join(", ")}`);
  }
}

if (process.argv[1]?.endsWith("scan-python-imports.mjs")) main();
