#!/usr/bin/env bash
# Patch newest Claude Code binary: "Claude Max" -> "Claude Van"
# Idempotent. Safe to run on already-patched binaries.
set -euo pipefail

VERSIONS_DIR="$HOME/.local/share/claude/versions"
[ -d "$VERSIONS_DIR" ] || { echo "ERR: $VERSIONS_DIR not found"; exit 1; }

# Pick newest non-backup binary
BIN=$(ls -t "$VERSIONS_DIR"/* 2>/dev/null | grep -v '\.orig-bak$' | head -1)
[ -n "$BIN" ] && [ -f "$BIN" ] || { echo "ERR: no binary found"; exit 1; }

VER=$(basename "$BIN")
echo "Target: $BIN (version $VER)"

# Check current state
MAX_COUNT=$(grep -c 'return"Claude Max"' "$BIN" 2>/dev/null || true)
VAN_COUNT=$(grep -c 'return"Claude Van"' "$BIN" 2>/dev/null || true)
echo "Current: Claude Max=$MAX_COUNT, Claude Van=$VAN_COUNT"

if [ "$MAX_COUNT" -eq 0 ] && [ "$VAN_COUNT" -gt 0 ]; then
  echo "Already patched. Nothing to do."
  exit 0
fi

if [ "$MAX_COUNT" -eq 0 ]; then
  echo "WARN: no 'Claude Max' string found. Binary format may have changed."
  exit 2
fi

# Backup once per version
BAK="$BIN.orig-bak"
[ -f "$BAK" ] || cp "$BIN" "$BAK"

# Patch (length-preserving byte replace)
python3 - "$BIN" <<'PY'
import sys
p = sys.argv[1]
d = open(p, 'rb').read()
n = d.count(b'return"Claude Max"')
d = d.replace(b'return"Claude Max"', b'return"Claude Van"')
open(p, 'wb').write(d)
print(f"Patched {n} sites")
PY

# Re-sign ad-hoc (macOS requires valid signature to exec)
codesign --remove-signature "$BIN" 2>/dev/null || true
codesign -f -s - --preserve-metadata=entitlements,requirements,flags "$BIN"

# Verify
claude --version && echo "OK: patched and signed $VER"
