# Release & Publish Guide

How `vcskill` gets to npm, and the boundary between what is **automated** and what
**you must do by hand** (the automation cannot create accounts or secrets for you).

## TL;DR

- Day-to-day: add a changeset per change → merge the auto "Version Packages" PR →
  GitHub Actions publishes to npm. No manual `npm publish`.
- One-time setup below must be done before the first automated publish works.

## One-time prerequisites (you, by hand)

These cannot be automated — they involve your npm account and GitHub secrets.

1. **npm account + login**
   ```bash
   npm login          # or create one at https://www.npmjs.com/signup
   npm whoami         # confirm you're logged in
   ```
2. **Create an npm Automation token** (npmjs.com → Access Tokens → Generate →
   *Automation*). Copy it.
3. **Add it as a GitHub secret** named `NPM_TOKEN`:
   GitHub repo → Settings → Secrets and variables → Actions → New repository secret →
   name `NPM_TOKEN`, value = the token.
4. **First publish to claim the name** (only needed once — the automated flow takes
   over afterward). The name `vcskill` is currently free on npm:
   ```bash
   cd packages/cli
   npm publish --access public   # runs prepack: build + bundle kit/LICENSE
   ```
   If you prefer, skip this and let the first CI run claim the name — the Automation
   token has permission to create a new package.

## Automated flow (Changesets)

1. Make changes on a branch. For anything user-facing, add a changeset:
   ```bash
   pnpm changeset           # pick `vcskill`, choose bump, write a summary
   ```
   Commit the generated `.changeset/*.md` with your PR.
2. Merge your PR to `main`. The `Release` workflow (`.github/workflows/release.yml`)
   sees pending changesets and opens a **"Version Packages"** PR that bumps the
   version and updates `CHANGELOG.md`.
3. Merge the "Version Packages" PR. The workflow runs again and **publishes**
   `vcskill` to npm (with provenance via OIDC).

The private monorepo root (`vcskill-monorepo`) is never published — only the public
`vcskill` package under `packages/cli`.

## Verify before publishing (optional, local)

```bash
pnpm --filter vcskill run verify-tarball   # tarball shape: dist + kit + LICENSE + shebang
pnpm --filter vcskill run smoke-test       # install --dry-run across all 6 providers
cd packages/cli && npm publish --dry-run   # what npm would upload (no upload)
```

## Boundary summary

| Step | Who | How |
|---|---|---|
| npm account + login | **You** | `npm login` |
| Create Automation token | **You** | npmjs.com → Access Tokens |
| Add `NPM_TOKEN` secret | **You** | GitHub repo Settings → Secrets |
| First name claim (optional) | **You** | `npm publish --access public` once |
| Version bump + CHANGELOG | Automated | Changesets "Version Packages" PR |
| Build + pack + publish | Automated | `release.yml` on merge to `main` |
| Provenance attestation | Automated | OIDC (`id-token: write`) |

## Notes

- Smoke-test currently runs locally / before publish. It is intentionally kept out
  of the per-PR `ci.yml` to keep pull-request feedback fast.
- `npx vcskill install` only works **after** the first successful publish. Before
  that, use the tarball or source-build paths in the README.
