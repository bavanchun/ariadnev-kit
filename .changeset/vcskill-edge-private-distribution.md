---
"vcskill": minor
---

Install and self-update now go through the vcskill edge (`vcskill.vchun.dev`)
instead of GitHub directly, so the repo can be **fully private**.

- Install: `curl -fsSL https://vcskill.vchun.dev/install | bash` /
  `irm https://vcskill.vchun.dev/install.ps1 | iex`.
- `vcskill update` checks `/version` and downloads binaries from `/download/…`
  on the edge (still sha256-verified, still self-updating).
- A Cloudflare Worker (`cloudflare-worker/`) proxies the private repo's install
  scripts and release binaries with a server-side token — the only public face.
  Setup runbook: `docs/cloudflare-worker-setup.md`.
