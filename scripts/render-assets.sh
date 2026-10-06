#!/usr/bin/env bash
# Regenerates assets/*.gif|png from the plugin's pixel-art code. Needs node 22+ and ImageMagick.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
node --experimental-strip-types scripts/render-assets.mts "$tmp" 2>/dev/null
magick -delay 18 -loop 0 "$tmp"/hero-*.ppm -filter point -resize 1200% -layers Optimize assets/hero.gif
magick -delay 25 -loop 0 "$tmp"/classes-*.ppm -filter point -resize 600% -layers Optimize assets/classes.gif
magick -delay 20 -loop 0 "$tmp"/hit-*.ppm -filter point -resize 1000% -layers Optimize assets/hit.gif
magick -delay 20 -loop 0 "$tmp"/drain-*.ppm -filter point -resize 2000x1000% -layers Optimize assets/xp-drain.gif
magick -delay 9 -loop 0 "$tmp"/ranks-*.ppm -filter point -resize 800% -layers Optimize assets/ranks.gif
for f in "$tmp"/still-*.ppm; do magick "$f" "${f%.ppm}.png"; done
cp scripts/mockups/*.html scripts/mockups/*.css "$tmp"/
for page in band-strong band-weak pane-hero pane-skills pane-rules; do
  size=$(grep -o 'data-size="[0-9]*,[0-9]*"' "scripts/mockups/$page.html" | grep -o '[0-9]*,[0-9]*')
  chromium --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size="$size" --screenshot="$tmp/$page.png" "file://$tmp/$page.html" >/dev/null 2>&1
  magick "$tmp/$page.png" -trim +repage -bordercolor '#11111b' -border 40 -strip assets/$page.png
done
rm -rf "$tmp"
