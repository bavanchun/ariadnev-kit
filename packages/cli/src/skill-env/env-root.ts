// Where skill environments live.
//
// Deliberately NOT under the kit cache. `embedded-kit.ts` stamps that directory
// with the package version and the kit digest, so every `ariadnev update`
// publishes a new one — an environment stored there would be orphaned by each
// upgrade, and rebuilding it needs the network, on a path that must work
// offline. Environments are keyed by the digest of the dependency set instead:
// an upgrade that does not change dependencies keeps using the same one.
import { homedir } from "node:os";
import { join } from "node:path";

/** Root holding every environment, independent of the installed CLI version. */
export function envsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.ARIADNEV_ENVS_DIR;
  if (override) return override;
  // XDG_DATA_HOME, not XDG_CACHE_HOME: an environment is expensive to rebuild
  // and needs the network, so it must not sit in a directory the system is
  // free to clear.
  const dataHome = env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(dataHome, "ariadnev", "envs");
}

/** The environment directory for a resolved dependency set. */
export function envPath(digest: string, env: NodeJS.ProcessEnv = process.env): string {
  return join(envsRoot(env), digest);
}

/** Interpreter inside an environment. Windows puts it in `Scripts`. */
export function envPython(envDir: string, platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? join(envDir, "Scripts", "python.exe") : join(envDir, "bin", "python");
}

/** Marker written once an environment is fully built. */
export function envSentinel(envDir: string): string {
  return join(envDir, ".ariadnev-env.json");
}
