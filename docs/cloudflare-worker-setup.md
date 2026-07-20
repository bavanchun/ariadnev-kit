# Edge — `vcskill.vchun.dev`

vcskill installs from `https://vcskill.vchun.dev/...`, not from GitHub directly.
A Cloudflare Worker is the **only public face** of this private repo — it serves
the landing page and proxies the release binaries with a server-side token, so
anyone can `curl | bash` without touching GitHub.

**The edge now lives in its own repo: [`bavanchun/vcskill-web`](https://github.com/bavanchun/vcskill-web).**
Worker code, `landing.html`, `wrangler.toml`, and the deploy/secret runbook are
there. This keeps the public-facing edge and landing site independent of the
private CLI/kit source.

```
GET /                 → landing page
GET /install          → install.sh          (proxied)
GET /install.ps1      → install.ps1
GET /version          → latest release tag
GET /download/<asset> → release binary       (token-proxied via GH_TOKEN secret)
```

## Relationship to this repo

- Release automation here is unaffected: CI publishes binaries to this repo's
  GitHub Releases with the built-in `GITHUB_TOKEN`; the Worker just reads them
  with its own `GH_TOKEN` secret (a fine-grained PAT, Contents: read).
- No cross-repo token is needed in CI.
- To deploy or rotate the token, see the `vcskill-web` README.
