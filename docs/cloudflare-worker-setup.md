# Edge setup — `vcskill.vchun.dev` (Cloudflare Worker)

vcskill installs from `https://vcskill.vchun.dev/...`, not from GitHub directly.
A Cloudflare Worker is the **only public face** — it proxies the private GitHub
repo's release binaries with a server-side token, so the repo (source *and*
releases) can stay fully private while `curl | bash` still works for anyone.

```
curl vcskill.vchun.dev/install   ─┐
vcskill update  → /version        ├─► Worker (holds GH_TOKEN) ─► private GitHub repo
                → /download/<bin>  ─┘
```

Worker code: [`cloudflare-worker/worker.js`](../cloudflare-worker/worker.js).
Endpoints: `/install`, `/install.ps1`, `/version`, `/download/<asset>`.

## One-time deploy (you, by hand)

These need your Cloudflare account + a GitHub token — they can't be automated.

1. **Create a GitHub token** — a fine-grained PAT scoped to `bavanchun/vcskill`
   with **Contents: read** (that's all the Worker needs — read releases + the
   install scripts). Copy it.
2. **Install Wrangler + log in** (once):
   ```bash
   npm i -g wrangler   # or: brew install cloudflare-wrangler
   wrangler login
   ```
3. **Deploy the Worker + set the secret** from `cloudflare-worker/`:
   ```bash
   cd cloudflare-worker
   wrangler secret put GH_TOKEN      # paste the PAT
   wrangler deploy
   ```
   `wrangler.toml` already routes `vcskill.vchun.dev/*` to the Worker (zone
   `vchun.dev`). If the route isn't picked up automatically, add it in the
   Cloudflare dashboard: Workers & Pages → the `vcskill` worker → Triggers →
   Custom Domain / Route `vcskill.vchun.dev/*`.
4. **DNS**: ensure a proxied (orange-cloud) record exists for `vcskill.vchun.dev`
   (a `CNAME` to the zone apex or an `AAAA ::` placeholder is fine — the Worker
   route handles the response).

## Verify before going private

With the repo still public, confirm the edge works:

```bash
curl -fsSL https://vcskill.vchun.dev/version                    # → 0.5.0
curl -fsSL https://vcskill.vchun.dev/install | bash             # installs
curl -fsSLI https://vcskill.vchun.dev/download/vcskill-darwin-arm64  # 200
```

## Flip the repo to private

Only after the edge is verified:

```bash
gh repo edit bavanchun/vcskill --visibility private --accept-visibility-change-consequences
```

Re-run the verify commands above — they must still work (now proving the
token-proxy path). The GitHub Actions release flow is unaffected: it publishes
to *its own* repo's releases with the built-in `GITHUB_TOKEN`, and the Worker
reads them. No cross-repo token is needed in CI.

## Rotating the token

`wrangler secret put GH_TOKEN` again with a new PAT, then `wrangler deploy`.
