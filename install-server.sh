#!/bin/bash
# Installs KaVach background server as a macOS launchd agent.
# Runs automatically on login, survives Electron app being closed.

PLIST="$HOME/Library/LaunchAgents/nl.ancai.kavach.server.plist"
NODE=$(which node)
SCRIPT="$(cd "$(dirname "$0")" && pwd)/kavach-server.js"
LOG="$HOME/.kavach/server.log"

cat > "$PLIST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>nl.ancai.kavach.server</string>
  <key>ProgramArguments</key>  <array><string>$NODE</string><string>$SCRIPT</string></array>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>StandardOutPath</key>   <string>$LOG</string>
  <key>StandardErrorPath</key> <string>$LOG</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null
launchctl load "$PLIST"
echo "KaVach background server installed and started."
echo "Logs: $LOG"
