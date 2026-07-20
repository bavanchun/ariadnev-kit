// vcskill public edge — the only public face of an otherwise-private GitHub repo.
// Serves the install scripts, the latest version, and release binaries by
// proxying the private repo's GitHub Releases with a server-side token, so
// anonymous users can `curl … | bash` without ever touching GitHub directly.
//
// Deploy: see docs/cloudflare-worker-setup.md. Requires one secret:
//   GH_TOKEN — a fine-grained PAT with Contents: read on bavanchun/vcskill.

const REPO = "bavanchun/vcskill";
const API = "https://api.github.com";

function ghHeaders(token, accept) {
  return { Authorization: `Bearer ${token}`, "User-Agent": "vcskill-worker", Accept: accept };
}

async function releaseAssetResponse(token, assetName) {
  const relRes = await fetch(`${API}/repos/${REPO}/releases/latest`, {
    headers: ghHeaders(token, "application/vnd.github+json"),
  });
  if (!relRes.ok) return new Response("release lookup failed", { status: 502 });
  const rel = await relRes.json();
  const asset = (rel.assets || []).find((a) => a.name === assetName);
  if (!asset) return new Response(`asset not found: ${assetName}`, { status: 404 });
  // GitHub returns a 302 to signed storage; fetch follows it by default.
  const bin = await fetch(asset.url, { headers: ghHeaders(token, "application/octet-stream"), redirect: "follow" });
  return new Response(bin.body, {
    status: bin.status,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${assetName}"`,
      "cache-control": "no-store",
    },
  });
}

async function repoFile(token, path, contentType) {
  const res = await fetch(`${API}/repos/${REPO}/contents/${path}?ref=main`, {
    headers: ghHeaders(token, "application/vnd.github.raw"),
  });
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": contentType, "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env) {
    const token = env.GH_TOKEN;
    if (!token) return new Response("worker misconfigured: GH_TOKEN unset", { status: 500 });
    const { pathname } = new URL(request.url);

    if (pathname === "/install" || pathname === "/install.sh") {
      return repoFile(token, "install.sh", "text/x-shellscript; charset=utf-8");
    }
    if (pathname === "/install.ps1") {
      return repoFile(token, "install.ps1", "text/plain; charset=utf-8");
    }
    if (pathname === "/version") {
      const res = await fetch(`${API}/repos/${REPO}/releases/latest`, {
        headers: ghHeaders(token, "application/vnd.github+json"),
      });
      if (!res.ok) return new Response("", { status: 502 });
      const data = await res.json();
      const version = String(data.tag_name || "").replace(/^vcskill@/, "").replace(/^v/, "");
      return new Response(version, { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
    }
    const dl = pathname.match(/^\/download\/(.+)$/);
    if (dl) {
      return releaseAssetResponse(token, decodeURIComponent(dl[1]));
    }

    return new Response("vcskill — install:  curl -fsSL https://vcskill.vchun.dev/install | bash\n", {
      headers: { "content-type": "text/plain" },
    });
  },
};
