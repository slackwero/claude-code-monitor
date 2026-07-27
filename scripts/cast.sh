#!/bin/sh
# Castea el dashboard al Nest Hub. El Hub necesita la IP LAN de la Mac (no localhost).
set -e
PATH="$HOME/.local/bin:$PATH"   # catt instalado con uv/pipx
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEVICE="${CATT_DEVICE:-$(node -p "require('$DIR/config.json').device")}"
PORT="$(node -p "require('$DIR/config.json').port")"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1)"

if [ -z "$IP" ]; then
  echo "No pude detectar la IP LAN (en0/en1). ¿Estás conectado a la red?" >&2
  exit 1
fi

echo "Casteando http://$IP:$PORT a \"$DEVICE\"..."
catt -d "$DEVICE" cast_site "http://$IP:$PORT"
