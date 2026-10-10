#!/usr/bin/env bash
# Render every scans-src/*.html to public/demo/14-finance-operations/*.png with headless Chrome.
set -e
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
SRC="$ROOT/data/raseen/14-finance-operations/scans-src"
OUT="$ROOT/public/demo/14-finance-operations"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
mkdir -p "$OUT"
for f in "$SRC"/*.html; do
  name="$(basename "$f" .html)"
  win_out="$(cygpath -w "$OUT/$name.png")"
  url="file:///$(cygpath -m "$f")"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1240,1754 --screenshot="$win_out" "$url" >/dev/null 2>&1
  echo "rendered $name.png"
done
