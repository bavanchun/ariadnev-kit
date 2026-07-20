// Single source of truth for the cross-compile target list + the host→asset
// mapping. Imported by build-binaries.mjs (what to build) and smoke-binary.mjs
// (which built artifact to smoke-test on this runner). Keep in sync with
// install.sh's uname mapping.

// (bun --target) → published asset name.
export const TARGETS = [
  { target: "bun-darwin-arm64", asset: "vcskill-darwin-arm64" },
  { target: "bun-darwin-x64", asset: "vcskill-darwin-x64" },
  { target: "bun-linux-x64", asset: "vcskill-linux-x64" },
  { target: "bun-linux-arm64", asset: "vcskill-linux-arm64" },
  { target: "bun-windows-x64", asset: "vcskill-windows-x64.exe" },
];

// Node's process.platform → the token bun uses in its --target triple.
const PLATFORM_TOKEN = { darwin: "darwin", linux: "linux", win32: "windows" };

/**
 * The release asset name for the current host, or null if this platform/arch
 * isn't a shipped target. Lets the smoke test locate the one binary a CI runner
 * can actually execute (cross-arch binaries can't run here).
 */
export function hostAssetName(platform = process.platform, arch = process.arch) {
  const plat = PLATFORM_TOKEN[platform];
  if (!plat) return null;
  const wanted = `bun-${plat}-${arch}`;
  return TARGETS.find((t) => t.target === wanted)?.asset ?? null;
}
