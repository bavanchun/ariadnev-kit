#!/usr/bin/env bash
# Fixture for audit-scripts.test.ts. Every risky line below is copied from the
# install script that ships with the cti-expert skill, which arrives with the
# content port. It is reproduced here rather than read from that skill so the
# test stays hermetic and keeps passing before and after the port lands.
#
# This script is never executed. It is scanned as text.
set -euo pipefail

log_fail() { echo "fail: $1 — $2"; }

install_apt() {
  local pkg="$1"
  if sudo apt-get install -y "$pkg" &>/dev/null 2>&1; then
    echo "ok"
  else
    # The remedy text names sudo but does not run it — must not be flagged.
    log_fail "$pkg" "try: sudo apt-get update && sudo apt install $pkg"
  fi
}

install_go() {
  local mod="$1"
  if go install "$mod" &>/dev/null 2>&1; then
    echo "ok"
  fi
}

install_release() {
  local cmd="$1" install_dir="${2:-/usr/local/bin}"
  local tmp; tmp=$(mktemp -d)
  if curl -sL "$url" | tar -xz -C "$tmp" 2>/dev/null; then
    local bin; bin=$(find "$tmp" -name "$cmd" -type f | head -1)
    sudo mv "$bin" "$install_dir/$cmd" 2>/dev/null || mv "$bin" "$HOME/.local/bin/$cmd" 2>/dev/null
  fi
}

install_python() {
  pip install "git+https://github.com/example/tool.git"
  pip install -r requirements.txt
}

echo "  ASN:  bash <(curl -sL https://raw.githubusercontent.com/nitefood/asn/master/asn)"
