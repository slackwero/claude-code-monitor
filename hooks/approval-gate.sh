#!/bin/sh
# PreToolUse: asks the dashboard for a remote decision (Nest Hub).
# - Remote mode OFF: the server replies instantly with {"decision":"none"} -> no output, normal flow.
# - Remote mode ON: long-polls up to ~28s; allow/deny arrives as a full hookSpecificOutput.
# - Timeout or server down: no output -> Claude Code shows its normal prompt (fail-open).
RESP=$(curl -s -X POST "http://127.0.0.1:${NEST_MONITOR_PORT:-8787}/approval/request" \
  -H 'Content-Type: application/json' --data-binary @- \
  --connect-timeout 0.3 --max-time 32) || exit 0
case "$RESP" in
  *'"permissionDecision"'*) printf '%s' "$RESP" ;;
esac
exit 0
