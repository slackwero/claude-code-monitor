#!/bin/sh
# Instala (o quita con --uninstall) los LaunchAgents de macOS para que el
# servidor y el keepalive arranquen solos al iniciar sesión y se relancen si mueren.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
LA="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/nest-hub-monitor"
SERVER_PLIST="$LA/com.nest-hub-monitor.server.plist"
KEEPALIVE_PLIST="$LA/com.nest-hub-monitor.keepalive.plist"
# PATH para launchd: node (Homebrew/nvm), catt (~/.local/bin) y utilidades del sistema
ENV_PATH="$HOME/.local/bin:$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin"

if [ "$1" = "--uninstall" ]; then
  launchctl unload "$SERVER_PLIST" 2>/dev/null || true
  launchctl unload "$KEEPALIVE_PLIST" 2>/dev/null || true
  rm -f "$SERVER_PLIST" "$KEEPALIVE_PLIST"
  echo "Autostart desinstalado."
  exit 0
fi

mkdir -p "$LA" "$LOGS"

write_plist() {
  # $1=ruta plist  $2=label  $3=programa  $4=argumento
  cat > "$1" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$2</string>
  <key>ProgramArguments</key>
  <array>
    <string>$3</string>
    <string>$4</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$ENV_PATH</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOGS/$2.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$2.log</string>
</dict>
</plist>
EOF
}

write_plist "$SERVER_PLIST" "com.nest-hub-monitor.server" "$NODE" "$DIR/server/server.js"
# keepalive en node (no sh): TCC de macOS bloquea a /bin/sh en ~/Documents bajo launchd
write_plist "$KEEPALIVE_PLIST" "com.nest-hub-monitor.keepalive" "$NODE" "$DIR/scripts/keepalive.js"

launchctl unload "$SERVER_PLIST" 2>/dev/null || true
launchctl unload "$KEEPALIVE_PLIST" 2>/dev/null || true
launchctl load "$SERVER_PLIST"
launchctl load "$KEEPALIVE_PLIST"

echo "Autostart instalado y arrancado."
echo "  logs: $LOGS/"
echo "  quitar: npm run autostart-off"
