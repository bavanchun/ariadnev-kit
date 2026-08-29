// The page `av gui` opens.
//
// WHY THIS EXISTS RATHER THAN A LINK TO `ariadnev-web`. The phase intended `av
// gui` to open the sibling web project against this API. That project turned out
// to be a static documentation and marketing site — `apps/docs` and `apps/site`,
// with no client for a local API anywhere in it — so the binding it was supposed
// to use does not exist to be bound. The documented degrade applies, and this is
// it: a real page, served by the daemon itself, showing the daemon's own data.
//
// The one thing that was ruled out is the thing upstream does when its GUI is
// missing — print a link to a desktop-app download. ariadnev operates no such
// endpoint, and a command whose success case is a dead link is worse than one
// that opens something small and true.
//
// Self-contained by necessity: no CDN, no build step, no external font. The
// daemon binds loopback and a page that phones out would be the only thing on
// this surface that leaves the machine.

import type { RouteContext } from "./routes.js";

/** HTML-escape. Everything interpolated below is local, and escaped anyway. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
  );
}

const STYLE = `
  :root { color-scheme: light dark; --ink:#16161a; --paper:#fbfaf8; --muted:#6b6862;
    --line:#e2ded7; --coral:#e2574c; --teal:#1f8a80; }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#eceae6; --paper:#16161a; --muted:#9a958c; --line:#2c2c31; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.55 ui-sans-serif,
    -apple-system, "Segoe UI", Roboto, sans-serif; padding:2.5rem 1.25rem; }
  main { max-width: 54rem; margin: 0 auto; }
  h1 { font-size:1.4rem; margin:0 0 .25rem; letter-spacing:-.01em; }
  h1 span { color:var(--coral); }
  p.lede { color:var(--muted); margin:0 0 2rem; }
  section { border-top:1px solid var(--line); padding:1.25rem 0; }
  h2 { font-size:.8rem; text-transform:uppercase; letter-spacing:.08em; color:var(--muted);
    margin:0 0 .75rem; font-weight:600; }
  dl { display:grid; grid-template-columns:auto 1fr; gap:.35rem 1.25rem; margin:0; }
  dt { color:var(--muted); } dd { margin:0; font-variant-numeric:tabular-nums; }
  code, pre { font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:.85em; }
  pre { background:color-mix(in srgb, var(--ink) 5%, transparent); padding:.75rem 1rem;
    border-radius:6px; overflow-x:auto; margin:0; }
  ul.routes { list-style:none; padding:0; margin:0; display:flex; flex-wrap:wrap; gap:.5rem; }
  ul.routes a { display:inline-block; padding:.2rem .55rem; border:1px solid var(--line);
    border-radius:5px; color:var(--teal); text-decoration:none; }
  ul.routes a:hover { border-color:var(--teal); }
  .note { color:var(--muted); font-size:.9em; }
`;

export function dashboardPage(ctx: RouteContext): string {
  const rows: [string, string][] = [
    ["version", ctx.version],
    ["pid", String(ctx.pid)],
    ["bind", `${ctx.bind}:${ctx.port}`],
    ["started", ctx.startedAt],
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ariadnev — local API</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <h1><span>ariadnev</span> local API</h1>
  <p class="lede">Read-only. Serving on loopback for this machine only.</p>

  <section>
    <h2>Daemon</h2>
    <dl>${rows.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>
  </section>

  <section>
    <h2>Endpoints</h2>
    <ul class="routes">
      <li><a href="/health">/health</a></li>
      <li><a href="/version">/version</a></li>
      <li><a href="/status">/status</a></li>
      <li><a href="/api/activity">/api/activity</a></li>
      <li><a href="/api/activity/stats">/api/activity/stats</a></li>
      <li><a href="/api/projects">/api/projects</a></li>
      <li><a href="/api/sessions">/api/sessions</a></li>
      <li><a href="/api/analytics">/api/analytics</a></li>
    </ul>
    <p class="note">Each one returns exactly what the matching <code>av … --json</code> command prints.</p>
  </section>

  <section>
    <h2>Stopping it</h2>
    <pre>av api stop</pre>
    <p class="note">This page is the daemon's own status view, not a full dashboard.
      <code>ariadnev-web</code> is a documentation site and has no client for this API.</p>
  </section>
</main>
</body>
</html>
`;
}
