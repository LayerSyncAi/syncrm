#!/usr/bin/env bash
# Frames the phone screenshots in ../screenshots/raw into 1080x1920 Play Store
# images in ../screenshots/final, using screenshot-frame.html and headless Chrome.
# Run from anywhere: bash mobile/store/android/source/render-screenshots.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
raw="$here/../screenshots/raw"
out="$here/../screenshots/final"
chrome="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
mkdir -p "$out"

# file name | headline | green part of the headline | line underneath
shots=(
  "01-hub.jpg|Your whole agency,|one login|Leads, lettings, valuations and finance in one place"
  "02-crm-dashboard.jpg|Your pipeline|at a glance|Win rate, open leads and today's agenda"
  "03-leads.jpg|Call or WhatsApp|in one tap|Every lead, scored and ready to follow up"
  "04-stay-dashboard.jpg|Rent and arrears,|tracked|Payments, leases, vacancies and maintenance"
  "05-notifications.jpg|Never miss|a deadline|Alerts for valuations, rent and tasks"
  "06-sign-in.jpg|One secure|sign-in|The same account as the SyncEstate website"
)

enc() { node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"; }

for row in "${shots[@]}"; do
  IFS='|' read -r file title accent sub <<<"$row"
  [ -f "$raw/$file" ] || { echo "skip $file (not in raw/)"; continue; }
  img="file:///$(cd "$raw" && pwd -W 2>/dev/null || pwd)/$file"
  url="file:///$(cd "$here" && pwd -W 2>/dev/null || pwd)/screenshot-frame.html?img=$(enc "$img")&title=$(enc "$title")&accent=$(enc "$accent")&sub=$(enc "$sub")"
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1080,1920 --virtual-time-budget=8000 --allow-file-access-from-files \
    --screenshot="$out/${file%.*}.png" "$url" 2>/dev/null
  echo "framed $file -> final/${file%.*}.png"
done
