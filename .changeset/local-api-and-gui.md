---
"ariadnev": minor
---

Add `av api` and `av gui` — a local, read-only view of your own data.

`api start|status|stop` runs a loopback HTTP daemon on port 8767; `gui` opens it. Every
data route is a `--json` CLI call underneath, so the API cannot report something the CLI
would not. Read-only: there are no write routes.

It refuses to bind a non-loopback address without an auth token, and refuses to guess when
the port is taken rather than silently moving to another one. Stopping the daemon proves
identity against the running process before signalling it.
