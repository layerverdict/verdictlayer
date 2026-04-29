#!/usr/bin/env bash
#
# Minimal uptime probe. Runs every minute under a systemd timer and
# writes a single line per attempt to journalctl. Off-host alerting
# (UptimeRobot, healthchecks.io) can scrape this via `journalctl -u
# verdict-health.service` or we can pipe the exit code to curl a
# ping URL — leaving that wiring to the operator.

set -euo pipefail

API_URL="https://api.verdictlayer.xyz"
WEB_URL="https://verdictlayer.xyz"

check() {
  local name="$1" url="$2" path="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${url}${path}" || echo "000")
  if [[ "$code" != "200" ]]; then
    echo "[health] FAIL  $name  $path  http=$code"
    return 1
  fi
  echo "[health] ok    $name  $path  http=$code"
}

rc=0
check "api" "$API_URL" "/health" || rc=1
check "api" "$API_URL" "/ready"  || rc=1
check "web" "$WEB_URL" "/"       || rc=1
check "web" "$WEB_URL" "/dashboard" || rc=1

exit "$rc"
