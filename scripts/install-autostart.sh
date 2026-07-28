#!/bin/sh
# Installs (or removes with --uninstall) background services so the server and
# keepalive start on login and relaunch if they die.
# macOS: launchd LaunchAgents. Linux: systemd user units.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
OS="$(uname -s)"

if [ "$OS" = "Darwin" ]; then
  LA="$HOME/Library/LaunchAgents"
  LOGS="$HOME/Library/Logs/claude-code-monitor"
  SERVER_PLIST="$LA/com.claude-code-monitor.server.plist"
  KEEPALIVE_PLIST="$LA/com.claude-code-monitor.keepalive.plist"
  # PATH for launchd: node (Homebrew/nvm), catt (~/.local/bin) and system utils
  ENV_PATH="$HOME/.local/bin:$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin"

  # migrate away from pre-release label names
  for OLD in com.nest-hub-monitor.server com.nest-hub-monitor.keepalive; do
    if [ -f "$LA/$OLD.plist" ]; then
      launchctl unload "$LA/$OLD.plist" 2>/dev/null || true
      rm -f "$LA/$OLD.plist"
      echo "Removed legacy agent $OLD"
    fi
  done

  if [ "$1" = "--uninstall" ]; then
    launchctl unload "$SERVER_PLIST" 2>/dev/null || true
    launchctl unload "$KEEPALIVE_PLIST" 2>/dev/null || true
    rm -f "$SERVER_PLIST" "$KEEPALIVE_PLIST"
    echo "Autostart removed."
    exit 0
  fi

  mkdir -p "$LA" "$LOGS"

  write_plist() {
    # $1=plist path  $2=label  $3=log name  $4=script to run
    cat > "$1" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$2</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$4</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$ENV_PATH</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOGS/$3.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$3.log</string>
</dict>
</plist>
EOF
  }

  # keepalive runs in node (not sh): macOS TCC blocks /bin/sh from ~/Documents under launchd
  write_plist "$SERVER_PLIST" "com.claude-code-monitor.server" "server" "$DIR/server/server.js"
  write_plist "$KEEPALIVE_PLIST" "com.claude-code-monitor.keepalive" "keepalive" "$DIR/scripts/keepalive.js"

  launchctl unload "$SERVER_PLIST" 2>/dev/null || true
  launchctl unload "$KEEPALIVE_PLIST" 2>/dev/null || true
  launchctl load "$SERVER_PLIST"
  launchctl load "$KEEPALIVE_PLIST"

  echo "Autostart installed and running."
  echo "  logs:   $LOGS/"
  echo "  remove: npm run autostart-off"

elif [ "$OS" = "Linux" ]; then
  UNITS="$HOME/.config/systemd/user"
  LOGS="${XDG_STATE_HOME:-$HOME/.local/state}/claude-code-monitor"
  SERVER_UNIT="$UNITS/claude-code-monitor-server.service"
  KEEPALIVE_UNIT="$UNITS/claude-code-monitor-keepalive.service"
  ENV_PATH="$HOME/.local/bin:$(dirname "$NODE"):/usr/bin:/bin"

  if [ "$1" = "--uninstall" ]; then
    systemctl --user disable --now claude-code-monitor-server.service 2>/dev/null || true
    systemctl --user disable --now claude-code-monitor-keepalive.service 2>/dev/null || true
    rm -f "$SERVER_UNIT" "$KEEPALIVE_UNIT"
    systemctl --user daemon-reload
    echo "Autostart removed."
    exit 0
  fi

  mkdir -p "$UNITS" "$LOGS"

  write_unit() {
    # $1=unit path  $2=description  $3=log name  $4=script to run
    cat > "$1" <<EOF
[Unit]
Description=$2

[Service]
ExecStart=$NODE $4
WorkingDirectory=$DIR
Environment=PATH=$ENV_PATH
Restart=always
RestartSec=10
StandardOutput=append:$LOGS/$3.log
StandardError=append:$LOGS/$3.log

[Install]
WantedBy=default.target
EOF
  }

  write_unit "$SERVER_UNIT" "claude-code-monitor server" "server" "$DIR/server/server.js"
  write_unit "$KEEPALIVE_UNIT" "claude-code-monitor cast keepalive" "keepalive" "$DIR/scripts/keepalive.js"

  systemctl --user daemon-reload
  systemctl --user enable --now claude-code-monitor-server.service claude-code-monitor-keepalive.service

  echo "Autostart installed and running."
  echo "  logs:   $LOGS/"
  echo "  remove: npm run autostart-off"
  echo "  note: to keep services running after logout: loginctl enable-linger $USER"
else
  echo "Unsupported OS: $OS (macOS and Linux only)" >&2
  exit 1
fi
