#!/usr/bin/env bash
# Deploy the locally built main binary into the installed Code-Codex
# so that clicking the desktop Codex icon immediately runs the latest build.
#
# The installed launcher (shim -> versioned launcher -> main binary) reads the
# main binary from versions/<current-version>/code-codex.exe.
set -euo pipefail

SRC="e:/Python_Project/Code-Codex/target/release/code-codex.exe"
INSTALL_ROOT="C:/Users/lenovo/AppData/Local/Programs/Code-Codex"
POINTER="$INSTALL_ROOT/current-version"

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: built binary not found: $SRC" >&2
  exit 1
fi
if [[ ! -f "$POINTER" ]]; then
  echo "ERROR: install pointer not found: $POINTER" >&2
  exit 1
fi

VERSION="$(tr -d '\r\n' < "$POINTER")"
DST_DIR="$INSTALL_ROOT/versions/$VERSION"
DST="$DST_DIR/code-codex.exe"

if [[ ! -d "$DST_DIR" ]]; then
  echo "ERROR: installed version dir not found: $DST_DIR" >&2
  exit 1
fi

# Stop any running instance so the file is not locked.
taskkill //F //IM code-codex.exe >/dev/null 2>&1 || true
taskkill //F //IM CodeCodex.exe >/dev/null 2>&1 || true
sleep 1

cp "$SRC" "$DST"
echo "Deployed $(stat -c%s "$DST") bytes to $DST (version $VERSION)"
