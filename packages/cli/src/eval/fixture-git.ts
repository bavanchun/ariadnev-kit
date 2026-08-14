import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function gitEnvironment(isolationRoot: string, extraEnv: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    GIT_CONFIG_GLOBAL: join(isolationRoot, "global.gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_TEMPLATE_DIR: join(isolationRoot, "template"),
    LANG: "C",
    LC_ALL: "C",
    PATH: process.env.PATH ?? "",
    ...extraEnv,
  };
  for (const name of ["SystemRoot", "WINDIR", "TMPDIR", "TMP", "TEMP"]) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return env;
}

function runGit(root: string, args: string[], isolationRoot: string, extraEnv: NodeJS.ProcessEnv = {}): void {
  const hooks = join(isolationRoot, "hooks");
  const result = spawnSync("git", ["-c", `core.hooksPath=${hooks}`, ...args], {
    cwd: root,
    encoding: "utf8",
    env: gitEnvironment(isolationRoot, extraEnv),
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? result.stderr.trim() ?? `exit ${result.status}`;
    throw new Error(`fixture git initialization failed: ${detail}`);
  }
}

export function initializeGitRepository(root: string): void {
  const isolationRoot = mkdtempSync(join(tmpdir(), "vcskill-git-isolation-"));
  mkdirSync(join(isolationRoot, "hooks"));
  mkdirSync(join(isolationRoot, "template"));
  writeFileSync(join(isolationRoot, "global.gitconfig"), "");
  try {
    runGit(root, ["init", "--quiet", `--template=${join(isolationRoot, "template")}`], isolationRoot);
    runGit(root, ["branch", "-M", "main"], isolationRoot);
    runGit(root, ["add", "--all"], isolationRoot);
    runGit(
      root,
      [
        "-c", "commit.gpgSign=false",
        "-c", "user.name=vcskill-fixture",
        "-c", "user.email=fixture@vcskill.invalid",
        "commit", "--quiet", "--no-gpg-sign", "-m", "fixture baseline",
      ],
      isolationRoot,
      { GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z", GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z" },
    );
  } finally {
    rmSync(isolationRoot, { force: true, recursive: true });
  }
}
