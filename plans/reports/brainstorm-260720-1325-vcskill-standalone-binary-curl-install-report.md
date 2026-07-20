# Brainstorm: vcskill standalone binary + curl|bash install (replace npx)

Date: 2026-07-20 13:25 | Status: consensus reached

## Problem / goal

Distribute vcskill as a **standalone binary** installed via `curl … | bash`
(+ PowerShell + brew), matching the Archon/harness pattern — reaching users who
don't have Node. Replace npx/npm as the distribution channel.

## Decisions (user, 2026-07-20)

| # | Question | Decision |
|---|---|---|
| D1 | Binary architecture | **B — single self-contained binary, kit embedded** (no sibling dir; cleanest artifact) |
| D2 | npm/npx channel | **Drop npm publish entirely** — binary/curl/brew only |
| D3 | Platforms (first cut) | **All 5**: darwin arm64/x64, linux x64/arm64, windows x64 |
| D4 | Install-script hosting | **GitHub raw URL** (`raw.githubusercontent.com/bavanchun/vcskill/main/install.sh`) |

## Feasibility (scout-confirmed)

- CLI = Node ESM (tsup), deps commander/gray-matter/smol-toml/zod/@clack/prompts — all Bun-compatible. Bun 1.3.14 installed.
- Kit = **90 files, all text** (.md/.cjs/.json/.ts/.example), 408K → embeds as a codegen'd path→content map. No binary assets.
- fs-read refactor surface = **3 files**: `load-kit.ts`, `cli/validate-command.ts`, `install/install-execute.ts`, plus `resolveKitRoot` (import.meta.url points inside the binary's virtual fs → must switch to an embedded source in binary mode).

## Architecture

**KitSource abstraction** (the core refactor). Introduce an interface the kit
loader/installer/validator read *through*:

```ts
interface KitSource {
  root: string;                       // virtual or real
  exists(rel: string): boolean;
  listDir(rel: string): string[];
  readText(rel: string): string;
}
```

- `FsKitSource` — wraps today's `readdirSync`/`readFileSync` (dev + any fs run). Default when not compiled.
- `EmbeddedKitSource` — reads a build-time-generated `kit-embedded.generated.ts`
  (a `Record<path, content>` map of all 90 files). Selected when running as a
  Bun-compiled binary (`process.isBun` + presence of the embedded map).
- Only *reading* the kit goes through KitSource; writing to install targets
  stays real fs.

**Build pipeline**
1. `scripts/generate-embedded-kit.ts` walks `kit/` → writes the generated map module.
2. `bun build --compile --target=bun-<os>-<arch> src/index.ts` × 5 → self-contained binaries (kit baked in).
3. Package: raw binary + `checksums.txt` (sha256) as GitHub Release assets. (Windows: `.exe` + `.zip`.)

**Install surface**
- `install.sh`: `uname` → target → download binary from latest GH Release → **verify sha256** → `chmod +x` → move to `~/.local/bin/vcskill` → PATH hint.
- `install.ps1`: same for Windows → `%LOCALAPPDATA%\Programs\vcskill`.
- Homebrew tap `bavanchun/homebrew-vcskill` (separate repo) → `Formula/vcskill.rb` pulling the darwin binary + sha256.
- `vcskill update`: re-point from npm registry → GitHub Releases API (`releases/latest`), compare tag vs current. Already offline-safe (injected fetch).

**Release workflow**
- Drop `changeset publish` / npm. Keep `changeset version` for version bump +
  CHANGELOG only. Set package `private: true`, remove `publishConfig.provenance`.
- New job: bun cross-compile 5 targets → checksums → create/attach GitHub Release.

## Phases (proposed for /plan)

1. **KitSource abstraction + FsKitSource** — behavior-preserving refactor of the
   3 fs-reading files; all existing tests stay green (TDD: lock current behavior first).
2. **Embedded kit + binary** — codegen generator + EmbeddedKitSource +
   binary-mode detection; `bun --compile` one target locally; **smoke the binary**
   (install/validate/doctor + the interactive `@clack/prompts` wizard) — top risk, de-risk here.
3. **Release workflow** — 5-target cross-compile, checksums, GH Release upload;
   drop npm publish (private:true, drop provenance), keep changeset version/changelog.
4. **install.sh + install.ps1 + brew formula + `update`→GH Releases + README** —
   curl/brew/ps1 as headline; sha256 verification baked in.

## Risks

- **Bun-compile compatibility with the interactive wizard** (@clack/prompts +
  commander) — the #1 unknown. Mitigation: build a binary in Phase 2 immediately
  and smoke the interactive `install` path; if broken, fall back to
  non-interactive-by-default in binary mode.
- **Windows** binary + ps1 — no local Windows; rely on CI + a follow-up manual test.
- **Lost npm provenance** — `curl|bash` executes remote code. Mitigation: sha256
  verification in install.sh from the release `checksums.txt` (baseline);
  minisign/cosign signing as an easy future add.
- **Binary size** ~55–90MB × 5 platforms — acceptable for a dev tool; release is chunky.
- **Embedded map staleness** — must regenerate on every kit change. Mitigation:
  `vcskill validate` / a CI step regenerates + diffs the map so drift fails the build.

## Success metrics

- `curl -fsSL …/install.sh | bash` on a clean **Node-less** machine → working `vcskill` on PATH.
- Binary `vcskill validate` / `install` / `doctor` behave identically to the npm build (same 232+ tests green via FsKitSource; binary smoke via EmbeddedKitSource).
- 5 platform binaries + checksums attached to each GitHub Release; npm no longer published.
- `brew install bavanchun/vcskill/vcskill` works on macOS.

## Out of scope (this round)

- Custom install domain (D4 = GH raw; domain is a later cosmetic swap).
- Code signing / notarization (macOS Gatekeeper may warn on unsigned binary — note in README; notarization is a future plan).
- Auto-update-in-place (update stays check-and-guide, matching current design).

## Unresolved questions

- **Homebrew tap repo** (`bavanchun/homebrew-vcskill`) must be created by the
  user (I can generate the formula + instructions, but can't create the repo).
- macOS unsigned-binary Gatekeeper warning: accept with a README note, or invest
  in notarization later? (Recommend: note now, notarize later.)
