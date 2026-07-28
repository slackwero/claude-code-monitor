#!/bin/sh
# Casts the dashboard to the configured Chromecast device. The device needs the
# machine's LAN IP (not localhost).
set -e
PATH="$HOME/.local/bin:$PATH"   # catt installed via uv/pipx
DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONF="$DIR/config.json"
[ -f "$CONF" ] || CONF="$DIR/config.example.json"
DEVICE="${CATT_DEVICE:-$(node -p "require('$CONF').device" 2>/dev/null)}"
PORT="$(node -p "require('$CONF').port" 2>/dev/null || echo 8787)"

if [ -z "$DEVICE" ] || [ "$DEVICE" = "YOUR CHROMECAST DEVICE NAME" ]; then
  echo "No cast device configured. Run: npm run setup" >&2
  exit 1
fi

IP="$(node "$DIR/scripts/lan-ip.js" || true)"
if [ -z "$IP" ]; then
  echo "Could not detect a LAN IP. Are you connected to a network?" >&2
  exit 1
fi

# If DashCast is already showing the same URL, cast_site won't reload the page:
# stop first and add a cache-buster to force fresh navigation.
catt -d "$DEVICE" stop >/dev/null 2>&1 || true
sleep 2
URL="http://$IP:$PORT/?v=$(date +%s)"
echo "Casting $URL to \"$DEVICE\"..."
catt -d "$DEVICE" cast_site "$URL"
