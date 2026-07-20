#!/usr/bin/env bash
# vcskill installer — downloads the standalone binary for your platform from the
# vcskill edge, verifies its sha256, and installs it to ~/.local/bin.
#
#   curl -fsSL https://vcskill.vchun.dev/install | bash
#
# Overrides (env): VCSKILL_INSTALL_DIR (default ~/.local/bin).
set -euo pipefail

BASE="${VCSKILL_BASE_URL:-https://vcskill.vchun.dev}"
INSTALL_DIR="${VCSKILL_INSTALL_DIR:-$HOME/.local/bin}"

err() { echo "vcskill install: $*" >&2; exit 1; }

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

asset="vcskill-${os}-${arch}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "vcskill install: downloading ${asset} …"
curl -fsSL "${BASE}/download/${asset}" -o "${tmp}/${asset}" || err "download failed: ${BASE}/download/${asset}"
curl -fsSL "${BASE}/download/checksums.txt" -o "${tmp}/checksums.txt" || err "could not fetch checksums.txt"

# --- verify sha256 (fail closed) ---------------------------------------------
expected="$(grep " ${asset}\$" "${tmp}/checksums.txt" | awk '{print $1}')"
[ -n "$expected" ] || err "no checksum for ${asset} in checksums.txt"

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
mv "${tmp}/${asset}" "${INSTALL_DIR}/vcskill"
chmod +x "${INSTALL_DIR}/vcskill"

# --- short `vc` alias (opt out with VCSKILL_ALIAS=off) ------------------------
# Never clobber a pre-existing different `vc` — only create/refresh our own link.
if [ "${VCSKILL_ALIAS:-on}" != "off" ]; then
  vc_path="${INSTALL_DIR}/vc"
  if [ ! -e "$vc_path" ] || { [ -L "$vc_path" ] && [ "$(readlink "$vc_path")" = "vcskill" ]; }; then
    ln -s vcskill "$vc_path" 2>/dev/null || cp "${INSTALL_DIR}/vcskill" "$vc_path"
    echo "vcskill install: linked short alias  ${vc_path} → vcskill"
  else
    echo "vcskill install: '${vc_path}' already exists and is not vcskill — leaving it; use 'vcskill' or set VCSKILL_ALIAS=off" >&2
  fi
fi

echo "vcskill install: installed to ${INSTALL_DIR}/vcskill ($("${INSTALL_DIR}/vcskill" --version))"
case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) : ;;
  *) echo "vcskill install: add ${INSTALL_DIR} to your PATH:  export PATH=\"${INSTALL_DIR}:\$PATH\"" ;;
esac
echo "vcskill install: run  vcskill install  to set up your providers."
