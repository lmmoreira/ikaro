#!/usr/bin/env bash
set -euo pipefail

# Fires one provider event at the fake billing provider (UC-138). Non-production only: the route
# exists when the backend runs with APP_ENV=local or staging and answers 404 in production. It works
# only for a charge whose merchant profile is a *_FAKE key.
#
# Usage: ./billing-simulate.sh (--tenant-id ID | --charge-id ID) --event EVENT [--delivery D] [--failure F]
#   --tenant-id ID   the tenant's single open charge (PAID_*, OVERDUE) or most recent paid charge (REFUND_*, CHARGEBACK_*)
#   --charge-id ID   one named charge (exactly one of --tenant-id / --charge-id)
#   --event EVENT    PAID_PIX | PAID_BOLETO | PAID_CARD | OVERDUE | REFUND_FULL | REFUND_PARTIAL | CHARGEBACK_OPENED | CHARGEBACK_LOST
#   --delivery D     NORMAL (default) | DUPLICATE | DELAYED | OUT_OF_ORDER
#   --failure F      PROVIDER_5XX | LINK_EXPIRED | INVALID_LOCATION: the next provider call fails once
#
# Env: BACKEND_URL (default http://localhost:3001), INTERNAL_API_KEY and PLATFORM_ADMIN_KEY (both
# required: the route sits behind InternalApiGuard + PlatformAdminGuard).
#
# Developer tool, not an operator one. On staging the backend is on internal ingress and this script
# is not installed on the relay VM: open the VM (docs/RUNBOOKS.md § Staging) and paste the equivalent
# curl from docs/RUNBOOKS.md § Billing. It does not move the clock (scripts/billing-clock-advance.sh).
#
# SINGLE-INSTANCE RULE: the fake keeps its charges in memory, so a restarted or second backend
# instance has forgotten them and answers 409. Create a new charge after a restart.

BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
TENANT_ID=""
CHARGE_ID=""
EVENT=""
DELIVERY=""
FAILURE=""

usage() {
  sed -n '3,23p' "$0" | sed 's/^# \{0,1\}//'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tenant-id) TENANT_ID="${2:?--tenant-id needs a value}"; shift 2 ;;
    --charge-id) CHARGE_ID="${2:?--charge-id needs a value}"; shift 2 ;;
    --event) EVENT="${2:?--event needs a value}"; shift 2 ;;
    --delivery) DELIVERY="${2:?--delivery needs a value}"; shift 2 ;;
    --failure) FAILURE="${2:?--failure needs a value}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [ -z "${INTERNAL_API_KEY:-}" ] || [ -z "${PLATFORM_ADMIN_KEY:-}" ]; then
  echo "INTERNAL_API_KEY and PLATFORM_ADMIN_KEY are both required" >&2
  exit 1
fi
if [ -z "$EVENT" ]; then
  echo "Give --event" >&2
  exit 1
fi
if { [ -z "$TENANT_ID" ] && [ -z "$CHARGE_ID" ]; } || { [ -n "$TENANT_ID" ] && [ -n "$CHARGE_ID" ]; }; then
  echo "Give exactly one of --tenant-id and --charge-id" >&2
  exit 1
fi

BODY="{\"event\":\"$EVENT\""
[ -n "$TENANT_ID" ] && BODY="$BODY,\"tenantId\":\"$TENANT_ID\""
[ -n "$CHARGE_ID" ] && BODY="$BODY,\"chargeId\":\"$CHARGE_ID\""
[ -n "$DELIVERY" ] && BODY="$BODY,\"delivery\":\"$DELIVERY\""
[ -n "$FAILURE" ] && BODY="$BODY,\"failure\":\"$FAILURE\""
BODY="$BODY}"

# Keep the body on a 4xx/5xx so the operator sees the 409 reason or the 401 detail. The keys travel
# on curl's stdin (`--config -`), never as arguments: process arguments are readable by other users
# on the host.
if ! OUT="$(printf 'header = "X-Internal-Key: %s"\nheader = "X-Platform-Admin-Key: %s"\nheader = "Content-Type: application/json"\n' "$INTERNAL_API_KEY" "$PLATFORM_ADMIN_KEY" | curl -sS --fail-with-body --config - -X POST -d "$BODY" "$BACKEND_URL/internal/dev/billing/provider/simulate")"; then
  echo "Request failed: $OUT" >&2
  exit 1
fi
echo "$OUT"
