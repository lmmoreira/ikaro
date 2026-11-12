#!/usr/bin/env bash
set -euo pipefail

# Moves the Billing dev clock (UC-138). Non-production only: the routes exist when the backend runs
# with APP_ENV=local or staging and answer 404 in production.
#
# Usage: ./billing-clock-advance.sh [--days N] [--hours N] | --reset | --status | --help
#   --days N    advance by N whole days (24 h each)
#   --hours N   advance by N whole hours
#   --reset     set the offset back to zero
#   --status    print the current offset and instanceId without moving time
#
# Env: BACKEND_URL (default http://localhost:3001), INTERNAL_API_KEY and PLATFORM_ADMIN_KEY (both
# required: the routes sit behind InternalApiGuard + PlatformAdminGuard).
#
# Developer tool, not an operator one. On staging the backend is on internal ingress, so run it from
# the relay VM's SSH shell (docs/RUNBOOKS.md § Staging) with BACKEND_URL and both keys exported.
#
# SINGLE-INSTANCE RULE: the offset lives in the backend process. On staging, hold the backend Cloud
# Run service to ONE instance while the clock is in use (docs/RUNBOOKS.md § Billing). This script
# prints the instanceId that answered; a different id between calls means a second instance.

BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
DAYS=""
HOURS=""
ACTION="advance"

usage() {
  sed -n '3,21p' "$0" | sed 's/^# \{0,1\}//'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --days) DAYS="${2:?--days needs a value}"; shift 2 ;;
    --hours) HOURS="${2:?--hours needs a value}"; shift 2 ;;
    --reset) ACTION="reset"; shift ;;
    --status) ACTION="status"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [ -z "${INTERNAL_API_KEY:-}" ] || [ -z "${PLATFORM_ADMIN_KEY:-}" ]; then
  echo "INTERNAL_API_KEY and PLATFORM_ADMIN_KEY are both required" >&2
  exit 1
fi

call() {
  local out
  # Keep the body on a 4xx/5xx so the operator sees the violation or the 401 detail.
  if ! out="$(curl -sS --fail-with-body -H "X-Internal-Key: $INTERNAL_API_KEY" -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY" -H "Content-Type: application/json" "$@")"; then
    echo "Request failed: $out" >&2
    exit 1
  fi
  printf '%s' "$out"
}

case "$ACTION" in
  status) RESPONSE="$(call "$BACKEND_URL/internal/dev/clock")" ;;
  reset) RESPONSE="$(call -X POST "$BACKEND_URL/internal/dev/clock/reset")" ;;
  advance)
    if [ -z "$DAYS" ] && [ -z "$HOURS" ]; then
      echo "Give --days and/or --hours (whole numbers)" >&2
      exit 1
    fi
    BODY="{"
    [ -n "$DAYS" ] && BODY="$BODY\"days\":$DAYS"
    [ -n "$DAYS" ] && [ -n "$HOURS" ] && BODY="$BODY,"
    [ -n "$HOURS" ] && BODY="$BODY\"hours\":$HOURS"
    BODY="$BODY}"
    RESPONSE="$(call -X POST -d "$BODY" "$BACKEND_URL/internal/dev/clock/advance")"
    ;;
esac

echo "$RESPONSE"
echo "instanceId reached: $(echo "$RESPONSE" | grep -o '"instanceId":"[^"]*' | cut -d'"' -f4)" >&2
