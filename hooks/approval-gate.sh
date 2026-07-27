#!/bin/sh
# PreToolUse: consulta al dashboard por una decisión remota (Nest Hub).
# - Modo remoto OFF: el servidor responde al instante {"decision":"none"} -> sin output, flujo normal.
# - Modo remoto ON: long-poll hasta ~28s; allow/deny llega como hookSpecificOutput completo.
# - Timeout o servidor caído: sin output -> Claude Code muestra su prompt normal (fail-open).
RESP=$(curl -s -X POST "http://127.0.0.1:${NEST_MONITOR_PORT:-8787}/approval/request" \
  -H 'Content-Type: application/json' --data-binary @- \
  --connect-timeout 0.3 --max-time 32) || exit 0
case "$RESP" in
  *'"permissionDecision"'*) printf '%s' "$RESP" ;;
esac
exit 0
