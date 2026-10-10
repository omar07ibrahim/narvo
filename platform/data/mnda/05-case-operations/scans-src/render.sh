#!/usr/bin/env bash
# Render every HTML scan source to /public/demo/05-case-operations/<case>/<doc>.png with headless Chrome.
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SRC/../../../.." && pwd)"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
for f in "$SRC"/*/*.html; do
  rel="${f#$SRC/}"; case_dir="$(dirname "$rel")"; name="$(basename "$rel" .html)"
  out="$ROOT/public/demo/05-case-operations/$case_dir/$name.png"
  mkdir -p "$(dirname "$out")"
  win_out="$(cygpath -w "$out" 2>/dev/null || echo "$out")"
  win_in="file:///$(cygpath -m "$f" 2>/dev/null || echo "$f")"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=4000 \
    --window-size=1100,1556 --screenshot="$win_out" "$win_in" >/dev/null 2>&1
  echo "rendered $case_dir/$name.png"
done
