#!/bin/zsh
# Render ScanDiffDemo with Playwright's Chrome (Remotion's own download stalls on
# this network). Usage: tools/render.sh out/preview.mp4 0.5 [extra remotion flags]
cd "$(dirname $0)/.."
CH="$HOME/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
out=$1; scale=$2; shift 2
npx remotion render ScanDiffDemo "$out" --scale="$scale" --concurrency=4 --browser-executable="$CH" --codec=h264 --audio-codec=aac --log=error "$@"
