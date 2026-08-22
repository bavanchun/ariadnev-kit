#!/usr/bin/env bash
# ariadnev installer — downloads the standalone binary for your platform from the
# ariadnev edge, verifies its sha256, and installs it to ~/.local/bin.
#
#   curl -fsSL https://ariadnev.com/install | bash
#
# Overrides (env):
#   ARIADNEV_INSTALL_DIR             default ~/.local/bin
#   ARIADNEV_ALIAS=off               skip the short `av` alias
#   ARIADNEV_BASE_URL                fetch the binary from another host (mirror,
#                                    staging, local). checksums.txt still comes
#                                    from the canonical domain.
#   ARIADNEV_ALLOW_UNVERIFIED_BASE=1 also take checksums.txt from that host.
#                                    Deliberate staging/offline testing only.
set -euo pipefail

DEFAULT_BASE="https://ariadnev.com"
BASE="${ARIADNEV_BASE_URL:-$DEFAULT_BASE}"

# checksums.txt is the only thing that authenticates the binary, so it must not
# come from a host the caller can redirect. Otherwise whoever sets one env var
# serves both the payload and the hash that "verifies" it, and the check below
# proves nothing. Opting out is possible but has to be said out loud.
if [ "${ARIADNEV_ALLOW_UNVERIFIED_BASE:-}" = "1" ]; then
  CHECKSUM_BASE="$BASE"
else
  CHECKSUM_BASE="$DEFAULT_BASE"
fi

INSTALL_DIR="${ARIADNEV_INSTALL_DIR:-$HOME/.local/bin}"

err() { echo "ariadnev install: $*" >&2; exit 1; }

# --- detect platform ---------------------------------------------------------
os="$(uname -s)"
case "$os" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *) err "unsupported OS '$os' — use install.ps1 on Windows, or build from source" ;;
esac

arch="$(uname -m)"
case "$arch" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64)  arch="x64" ;;
  *) err "unsupported architecture '$arch'" ;;
esac

asset="ariadnev-${os}-${arch}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

if [ "$BASE" != "$DEFAULT_BASE" ]; then
  if [ "$CHECKSUM_BASE" = "$BASE" ]; then
    echo "ariadnev install: WARNING — binary and checksums.txt both come from ${BASE}." >&2
    echo "ariadnev install: WARNING — the checksum cannot authenticate this binary. Unset ARIADNEV_ALLOW_UNVERIFIED_BASE unless you meant this." >&2
  else
    echo "ariadnev install: binary from ${BASE}; checksums.txt from ${DEFAULT_BASE}." >&2
  fi
fi

echo "ariadnev install: downloading ${asset} …"
curl -fsSL "${BASE}/download/${asset}" -o "${tmp}/${asset}" || err "download failed: ${BASE}/download/${asset}"
curl -fsSL "${CHECKSUM_BASE}/download/checksums.txt" -o "${tmp}/checksums.txt" || err "could not fetch checksums.txt from ${CHECKSUM_BASE}"

# --- verify sha256 (fail closed) ---------------------------------------------
# `|| true` so a missing line reaches the message below. Without it `set -e`
# kills the script on grep's exit 1 and the user sees nothing at all — and this
# is now reachable, because the binary and checksums.txt can come from different
# origins and disagree about which assets exist.
expected="$(grep " ${asset}\$" "${tmp}/checksums.txt" | awk '{print $1}' || true)"
[ -n "$expected" ] || err "no checksum for ${asset} in checksums.txt from ${CHECKSUM_BASE}"

if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "${tmp}/${asset}" | awk '{print $1}')"
elif command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "${tmp}/${asset}" | awk '{print $1}')"
else
  err "need sha256sum or shasum to verify the download"
fi
[ "$actual" = "$expected" ] || err "checksum mismatch — refusing to install (expected $expected, got $actual)"

# --- install -----------------------------------------------------------------
mkdir -p "$INSTALL_DIR"
mv "${tmp}/${asset}" "${INSTALL_DIR}/ariadnev"
chmod +x "${INSTALL_DIR}/ariadnev"

# --- short `av` alias (opt out with ARIADNEV_ALIAS=off) ------------------------
# Never clobber a pre-existing different `av` — only create/refresh our own link.
if [ "${ARIADNEV_ALIAS:-on}" != "off" ]; then
  av_path="${INSTALL_DIR}/av"
  if [ ! -e "$av_path" ] || { [ -L "$av_path" ] && [ "$(readlink "$av_path")" = "ariadnev" ]; }; then
    ln -s ariadnev "$av_path" 2>/dev/null || cp "${INSTALL_DIR}/ariadnev" "$av_path"
    echo "ariadnev install: linked short alias  ${av_path} → ariadnev"
  else
    echo "ariadnev install: '${av_path}' already exists and is not ariadnev — leaving it; use 'ariadnev' or set ARIADNEV_ALIAS=off" >&2
  fi
fi

echo "ariadnev install: installed to ${INSTALL_DIR}/ariadnev ($("${INSTALL_DIR}/ariadnev" --version))"
case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) : ;;
  *) echo "ariadnev install: add ${INSTALL_DIR} to your PATH:  export PATH=\"${INSTALL_DIR}:\$PATH\"" ;;
esac
echo "ariadnev install: run  ariadnev install  to set up your providers."
