#!/usr/bin/env bash
# vcskill installer — downloads the standalone binary for your platform from the
# latest GitHub Release, verifies its sha256, and installs it to ~/.local/bin.
#
#   curl -fsSL https://raw.githubusercontent.com/bavanchun/vcskill/main/install.sh | bash
#
# Overrides (env): VCSKILL_INSTALL_DIR (default ~/.local/bin),
#                  VCSKILL_VERSION (pin a tag, e.g. "0.5.0"; default = latest).
set -euo pipefail

REPO="bavanchun/vcskill"
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

# --- resolve download URLs ---------------------------------------------------
if [ -n "${VCSKILL_VERSION:-}" ]; then
  base="https://github.com/${REPO}/releases/download/vcskill@${VCSKILL_VERSION}"
else
  base="https://github.com/${REPO}/releases/latest/download"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "vcskill install: downloading ${asset} …"
curl -fsSL "${base}/${asset}" -o "${tmp}/${asset}" || err "download failed: ${base}/${asset}"
curl -fsSL "${base}/checksums.txt" -o "${tmp}/checksums.txt" || err "could not fetch checksums.txt"

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

echo "vcskill install: installed to ${INSTALL_DIR}/vcskill ($("${INSTALL_DIR}/vcskill" --version))"
case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) : ;;
  *) echo "vcskill install: add ${INSTALL_DIR} to your PATH:  export PATH=\"${INSTALL_DIR}:\$PATH\"" ;;
esac
echo "vcskill install: run  vcskill install  to set up your providers."
