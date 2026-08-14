import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(here, "..", "..", "..");

export function workflowPath(name) {
  return join(repoRoot, ".github", "workflows", name);
}

export function readWorkflow(name) {
  return readFileSync(workflowPath(name), "utf8");
}

export function loadWorkflow(name) {
  return parse(readWorkflow(name));
}

export function loadJobs(name) {
  return loadWorkflow(name).jobs;
}

export function listUses(name) {
  const jobs = Object.values(loadJobs(name));
  return jobs.flatMap((job) => (job.steps ?? []).flatMap((step) => step.uses ? [step.uses] : []));
}

export function listRunBlocks(name) {
  const jobs = Object.values(loadJobs(name));
  return jobs.flatMap((job) => (job.steps ?? []).flatMap((step) => step.run ? [{ name: step.name, run: step.run }] : []));
}

export function extractRun(name, stepName) {
  const step = listRunBlocks(name).find((entry) => entry.name === stepName);
  if (!step) throw new Error(`missing run step ${stepName} in ${name}`);
  return step.run;
}

export function writeExecutable(dir, name, body) {
  const path = join(dir, name);
  writeFileSync(path, body, { mode: 0o755 });
  return path;
}

export function withScratch(prefix, fn) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function runScript(body, env, cwd) {
  return spawnSync("bash", ["-euo", "pipefail", "-c", body], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}
