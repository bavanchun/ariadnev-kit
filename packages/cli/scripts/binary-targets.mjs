// Single source of truth for the cross-compile target list + the host→asset
// mapping. Imported by build-binaries.mjs (what to build) and smoke-binary.mjs
// (which built artifact to smoke-test on this runner). Keep in sync with
// install.sh's uname mapping.

// (bun --target) → published asset name.
export const TARGETS = [
  { target: "bun-darwin-arm64", asset: "ariadnev-darwin-arm64" },
  { target: "bun-darwin-x64", asset: "ariadnev-darwin-x64" },
  { target: "bun-linux-x64", asset: "ariadnev-linux-x64" },
  { target: "bun-linux-arm64", asset: "ariadnev-linux-arm64" },
  { target: "bun-windows-x64", asset: "ariadnev-windows-x64.exe" },
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

// The leading bytes each asset must have, so the four a runner cannot execute
// are still checked for something. Format alone would not separate the two
// darwin assets (both Mach-O) or the two linux ones (both ELF), and a swapped
// pair is the likeliest packaging mistake — hence the architecture field, which
// is the part that actually differs.
//
// Magic and architecture are checked as two separate windows, because the bytes
// between them are not fixed: an ELF header carries class/endianness/ABI at
// offsets 4-7 and e_type at 16-17, so comparing one long prefix would fail on a
// perfectly good binary. That is what a first real run caught, after fixtures
// built from the same wrong assumption had agreed with it.
//
// Mach-O little-endian 64-bit: magic cffaedfe, cputype at offset 4.
// ELF: 7f 45 4c 46, e_machine at offset 18 (little-endian half).
// PE: "MZ". No comparable arch field this early, and only one windows target
// ships, so the magic is the whole check there.
const HEADERS = {
  "ariadnev-darwin-arm64": { magic: [0xcf, 0xfa, 0xed, 0xfe], archOffset: 4, archBytes: [0x0c, 0x00, 0x00, 0x01], arch: "arm64" },
  "ariadnev-darwin-x64": { magic: [0xcf, 0xfa, 0xed, 0xfe], archOffset: 4, archBytes: [0x07, 0x00, 0x00, 0x01], arch: "x86_64" },
  "ariadnev-linux-arm64": { magic: [0x7f, 0x45, 0x4c, 0x46], archOffset: 18, archBytes: [0xb7, 0x00], arch: "aarch64" },
  "ariadnev-linux-x64": { magic: [0x7f, 0x45, 0x4c, 0x46], archOffset: 18, archBytes: [0x3e, 0x00], arch: "x86_64" },
  "ariadnev-windows-x64.exe": { magic: [0x4d, 0x5a], archOffset: 0, archBytes: [], arch: "x86_64" },
};

/** Header expectation for a release asset. Throws on an asset we do not ship. */
export function expectedHeader(asset) {
  const header = HEADERS[asset];
  if (!header) throw new Error(`no header expectation for asset: ${asset}`);
  return header;
}
