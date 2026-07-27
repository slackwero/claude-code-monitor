#!/bin/sh
# Mantiene el dashboard visible: el Nest Hub vuelve solo a su pantalla ambiente
# ~10 min después del cast, así que cada 60s comprobamos y re-casteamos si hace falta.
PATH="$HOME/.local/bin:$PATH"   # catt instalado con uv/pipx
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEVICE="${CATT_DEVICE:-$(node -p "require('$DIR/config.json').device")}"

echo "Keep-alive para \"$DEVICE\" (Ctrl-C para salir)"
while true; do
  STATUS="$(catt -d "$DEVICE" status 2>/dev/null)"
  case "$STATUS" in
    *DashCast*|*Dashcast*) ;;  # sigue casteado, nada que hacer
    *)
      echo "$(date '+%H:%M:%S') Hub volvió a ambiente; re-casteando..."
      sh "$DIR/scripts/cast.sh" || echo "re-cast falló, reintento en 60s"
      ;;
  esac
  sleep 60
done
