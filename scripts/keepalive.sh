#!/bin/sh
# Mantiene el dashboard visible: el Nest Hub vuelve solo a su pantalla ambiente
# ~10 min después del cast, así que cada 60s comprobamos y re-casteamos si hace falta.
PATH="$HOME/.local/bin:$PATH"   # catt instalado con uv/pipx
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEVICE="${CATT_DEVICE:-$(node -p "require('$DIR/config.json').device")}"

# DashCast (el receiver que usa `catt cast_site`) tiene app_id 84912283; si el
# Hub vuelve a ambiente u otra app, el app_id cambia y toca re-castear.
DASHCAST_APP_ID="84912283"

echo "Keep-alive para \"$DEVICE\" (Ctrl-C para salir)"
while true; do
  APP_ID="$(catt -d "$DEVICE" info 2>/dev/null | sed -n 's/^app_id: //p')"
  if [ "$APP_ID" != "$DASHCAST_APP_ID" ]; then
    echo "$(date '+%H:%M:%S') Hub en app_id=${APP_ID:-?}; re-casteando..."
    sh "$DIR/scripts/cast.sh" || echo "re-cast falló, reintento en 60s"
  fi
  sleep 60
done
