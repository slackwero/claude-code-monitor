#!/bin/sh
# Reenvía el JSON del hook (stdin) al servidor del dashboard. Fail-open: si el
# servidor no está, la sesión de Claude Code no se entera ni se ralentiza.
curl -s -X POST "http://127.0.0.1:${NEST_MONITOR_PORT:-8787}/hook" \
  -H 'Content-Type: application/json' --data-binary @- \
  --connect-timeout 0.3 --max-time 1 >/dev/null 2>&1
exit 0
