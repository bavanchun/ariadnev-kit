---
phase: 1
title: "Publish Package"
status: done
priority: P1
effort: "3h"
dependencies: []
---

<!-- Updated: Validation Session 1 - verify in isolated tmp directory -->

# Phase 1: Publish Package

## Overview
This phase handles the packaging configuration, directory structure checks, and verification procedures to prepare the `vcskill` CLI package for publication (version `0.1.0`). It ensures that the published package contains only necessary runtime files (compiling to `dist/`, including configuration templates, rules, and commands templates under `kit/`), is executable when installed globally, and excludes development dependencies.
All packaging smoke tests must execute in an isolated temp directory to prevent local dev path bleeding.

## Requirements
*   **Functional**:
    - Build and package `vcskill` as a flat, distributable tarball using `pnpm pack`.
    - Verification that `packages/cli/package.json` correctly maps target binary entrypoint to `dist/index.js`.
    - Ensure executable bin mapping (using standard Node shebang `#!/usr/bin/env node` in the generated entrypoint file).
    - Validate that bundling script `node scripts/bundle-kit-assets.mjs` runs correctly in the prepack phase to assemble canonical templates.
    - Test local installation: run `npm install -g <tarball-path>` to verify the binary works in user space.
*   **Non-functional**:
    - Ensure package size remains minimal.
    - Validate directory structure boundaries.

## Architecture
During build execution, files undergo the following lifecycle:
```
[src/**/*.ts] ──(tsup compilation)──> [dist/index.js]
[kit/**/*] ────(bundle-kit-assets)──> [dist/kit-assets.json]
[pnpm pack] ─────────────────────────> [vcskill-0.1.0.tgz]
```

## Related Code Files
*   **Modify**:
    - `packages/cli/package.json` (Verify fields: `version`, `bin`, `files`, `scripts.prepack`)
    - `packages/cli/src/index.ts` (Ensure shebang `#!/usr/bin/env node` is preserved on compilation)
*   **Create**:
    - `packages/cli/scripts/verify-package-tarball.mjs` (Script to verify contents of the packed tarball)

## Implementation Steps
1.  **Configure package metadata**: Verify `packages/cli/package.json` has `bin: { "vcskill": "dist/index.js" }` and `files` array lists `dist`, `kit`, `kit.config.json`, `portable-manifest.json`.
2.  **Add package verification script**: Author a Node script `verify-package-tarball.mjs` that runs `pnpm pack`, extracts the archive contents into a temporary directory, and asserts that:
    - `dist/index.js` exists and starts with `#!/usr/bin/env node`.
    - No `src/` or `test/` TS files are present in the archive.
    - `kit/` directory is bundled and contains all default templates (hello-world, echo-tool, etc.).
3.  **Local dry-run publish & smoke test**:
    - Run the verification script.
    - Inside a clean, isolated temporary test directory outside the project workspace, install the packed `.tgz` file globally: `npm install -g <absolute-path-to-tgz>`.
    - Run `vcskill --version` and `vcskill list` globally in that directory to confirm successful installation.

## Success Criteria
- [ ] `packages/cli` bundles successfully via `tsup`.
- [ ] `verify-package-tarball.mjs` passes checks without errors.
- [ ] Local installation `npm install -g <tarball>` inside isolated directory registers the global `vcskill` command.
- [ ] Global command `vcskill list` runs and correctly detects kit items inside the isolated testing folder.

## Risk Assessment
*   **Risk**: Global command permission errors on Unix environments.
    - *Mitigation*: Ensure `dist/index.js` gets executable permissions (`chmod +x`) after `tsup` compilation (using `tsup.config.ts` hooks).
*   **Risk**: Over-packaging (including test files).
    - *Mitigation*: Restrict packed contents strictly using the `files` field in `package.json` and verify exclusion using the `verify-package-tarball` script.
