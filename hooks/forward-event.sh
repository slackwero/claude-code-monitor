#!/bin/sh
# Forwards the hook's JSON (stdin) to the dashboard server. Fail-open: if the
# server is down, the Claude Code session is neither blocked nor slowed down.
curl -s -X POST "http://127.0.0.1:${NEST_MONITOR_PORT:-8787}/hook" \
  -H 'Content-Type: application/json' --data-binary @- \
  --connect-timeout 0.3 --max-time 1 >/dev/null 2>&1
exit 0
