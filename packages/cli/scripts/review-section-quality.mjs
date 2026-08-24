#!/usr/bin/env node
// Section-quality review for skill bodies. Reports, never gates.
//
// These two checks were run against the four authored skills before this file
// existed, and both fail one of them: `av`'s Output format is deliberate prose,
// and two of the four carry no backticks in a required section. A check an
// honest author fails is a bad check, not a finding — so they live here, as a
// worklist for phase 8's rewrite, instead of in `skill-lint.ts`.
//
// The one candidate that did clear the exemplars, "Workflow position names a
// skill", became a real lint rule. This file is what is left over.
//
// Neither check detects filler. A short generator satisfies both. They are a
// floor, and the actual control is a second reader.
//
//   node packages/cli/scripts/review-section-quality.mjs [--json]

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const SKILLS = join(process.cwd(), "kit", "skills");

/** The section name on a level-2 heading line, or null. Must stay in sync with
 *  `levelTwoHeadingName` in skill-lint.ts — an earlier copy here compared the
 *  trimmed line to a literal `## <name>`, so a heading with two spaces after the
 *  hashes made the section invisible and the report silently clean. */
function levelTwoHeadingName(line) {
  const match = /^##\s+(.+?)\s*$/.exec(line);
  return match === null ? null : match[1].trim();
}

/** Body of one level-2 section, or null. Mirrors `sectionBody` in skill-lint.ts. */
function sectionBody(markdown, name) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => levelTwoHeadingName(line) === name);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (levelTwoHeadingName(lines[i]) !== null) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

/** An Output format section that shows a shape rather than describing one. */
function outputFormatIsConcrete(body) {
  const section = sectionBody(body, "Output format");
  // A missing section is the other check's finding; saying it twice makes one
  // defect look like two.
  if (section === null) return true;
  if (/```/.test(section)) return true;
  if (/^\s*\|.*\|/m.test(section)) return true;
  if ((section.match(/^\s*[-*]\s+\S/gm)?.length ?? 0) >= 3) return true;
  return "prose only — no fence, table, or list showing the shape";
}

/** A required section with no backticked span names nothing concrete. */
function sectionsNameSomething(body) {
  const bad = [];
  for (const name of ["Output format", "Quality gates", "Workflow position"]) {
    const section = sectionBody(body, name);
    if (section === null) {
      bad.push(`${name}: missing`);
      continue;
    }
    if ((section.match(/`[^`\n]+`/g)?.length ?? 0) === 0) bad.push(`${name}: no backticked term`);
  }
  return bad.length === 0 ? true : bad.join("; ");
}

const rows = [];
let considered = 0;
for (const entry of readdirSync(SKILLS, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const skillMd = join(SKILLS, entry.name, "SKILL.md");
  if (!existsSync(skillMd)) continue;
  considered++;
  const body = readFileSync(skillMd, "utf8");
  const outputFormat = outputFormatIsConcrete(body);
  const named = sectionsNameSomething(body);
  if (outputFormat === true && named === true) continue;
  rows.push({
    skill: entry.name,
    ...(outputFormat === true ? {} : { outputFormat }),
    ...(named === true ? {} : { sectionsNameSomething: named }),
  });
}

if (args.has("--json")) {
  process.stdout.write(`${JSON.stringify({ total: rows.length, rows }, null, 2)}\n`);
} else {
  for (const row of rows) {
    process.stdout.write(`AUTHORED ${row.skill}\n`);
    if (row.outputFormat) process.stdout.write(`    Output format: ${row.outputFormat}\n`);
    if (row.sectionsNameSomething) process.stdout.write(`    ${row.sectionsNameSomething}\n`);
  }
  process.stdout.write(`\n${rows.length} of ${considered} skills have something to answer for.\n`);
  process.stdout.write("Advisory. Nothing here fails a build.\n");
}
