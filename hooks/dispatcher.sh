#!/usr/bin/env bash
# Sidecar hook dispatcher for Claude Code (Unix/macOS)
# Fail-open: exits 0 always, never blocks Claude Code.

body=$(cat)
[ -z "$body" ] && exit 0

curl -s --max-time 0.09 \
     -X POST "http://127.0.0.1:7878/event" \
     -H "Content-Type: application/json" \
     -d "$body" \
     > /dev/null 2>&1 || true

exit 0
