#!/usr/bin/env bash
set -euo pipefail

# Billing operator cases (UC-111, UC-137): suspend, unsuspend, extend grace, set or clear exempt,
# and the read-only investigation list. The production path for the operator routes: the backend is
# on internal ingress, so this runs ONLY from the relay VM's own SSH shell
# (scripts/relay-vm-up.sh ... scripts/relay-vm-down.sh; docs/RUNBOOKS.md § Staging). The relay VM
# service account supplies the project, the backend URL, the identity token and both keys.
#
# Usage:
#   billing-operator.sh suspend   <tenantId> --reason "<why>" --operator "<your name>"
#   billing-operator.sh unsuspend <tenantId> --reason "<why>" --operator "<your name>"
#   billing-operator.sh grace     <tenantId> --until <ISO-8601 UTC> --reason "<why>" --operator "<your name>"
#   billing-operator.sh exempt    <tenantId> --set|--clear --reason "<why>" --operator "<your name>"
#   billing-operator.sh list      [--status TRIALING|ACTIVE|PAST_DUE|SUSPENDED] [--limit N] [--offset N]
#
#   suspend    Abuse / takedown suspension (reason OPERATOR). Payment does not lift it. An exempt
#              tenant is refused (403): clear exempt first.
#   unsuspend  Lifts an OPERATOR suspension only (409 for a payment-based one).
#   grace      Sets graceUntil on a PAST_DUE tenant; it only extends the 14 days (409 otherwise).
#              --until is an ISO-8601 UTC instant (YYYY-MM-DDTHH:MM:SSZ) you choose: at least 14 days
#              after the tenant went past due and never earlier than a grace already set.
#   exempt     --set gives free access (a suspended tenant is reactivated without payment);
#              --clear starts a fresh 14-day trial. Clearing it on Ikaro's own tenant is refused.
#   list       Read-only lookup of subscription status per tenant (newest first, 25 per page by
#              default, at most 100). A lookup, not a worklist.
#
# --reason and --operator are required on every write and checked here before any network call.
# --operator is YOUR NAME: it is stored as the audit row's actor. The shared platform key cannot tell
# operators apart, so the audit records the name you claim, not a verified identity.
#
# Env (optional): BACKEND_URL and INTERNAL_KEY may be exported for emergency or local acceptance
# use; otherwise both come from the relay VM.

USAGE="Usage: $0 {suspend|unsuspend|grace|exempt|list} ... (see --help)"

usage() {
  sed -n '4,29p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
  echo "ERROR: $1" >&2
  echo "$USAGE" >&2
  exit 1
}

# Escapes a value for use inside a JSON string: backslash first, then the double quote.
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

if [ "$#" -eq 0 ]; then
  die "a subcommand is required."
fi

COMMAND="$1"
shift
case "$COMMAND" in
  --help|-h) usage; exit 0 ;;
  suspend|unsuspend|grace|exempt|list) ;;
  *) die "unknown subcommand '$COMMAND'." ;;
esac

TENANT_ID=""
REASON=""
OPERATOR=""
UNTIL=""
EXEMPT_MODE=""
STATUS=""
LIMIT=""
OFFSET=""

if [ "$COMMAND" != "list" ]; then
  if [ "$#" -eq 0 ] || [[ "$1" == --* ]]; then
    die "$COMMAND needs a <tenantId> as its first argument."
  fi
  TENANT_ID="$1"
  shift
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --reason|--operator|--until|--status|--limit|--offset)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        die "$1 needs a value."
      fi
      case "$1" in
        --reason) REASON="$2" ;;
        --operator) OPERATOR="$2" ;;
        --until) UNTIL="$2" ;;
        --status) STATUS="$2" ;;
        --limit) LIMIT="$2" ;;
        --offset) OFFSET="$2" ;;
      esac
      shift 2
      ;;
    --set|--clear)
      # Both flags would silently let the last one win: clearing exempt on a free tenant starts a
      # paid trial, so refuse the conflict instead of guessing.
      [ -z "$EXEMPT_MODE" ] || die "give only one of --set and --clear."
      EXEMPT_MODE="${1#--}"
      shift
      ;;
    *) die "unknown argument '$1'." ;;
  esac
done

# Everything is validated here, before any network call.
UUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'

for value in "$TENANT_ID" "$REASON" "$OPERATOR" "$UNTIL" "$STATUS" "$LIMIT" "$OFFSET"; do
  if [[ "$value" =~ [[:cntrl:]] ]]; then
    die "arguments must not contain control characters (newlines, tabs)."
  fi
done

if [ "$COMMAND" = "list" ]; then
  [ -z "$REASON" ] && [ -z "$OPERATOR" ] && [ -z "$UNTIL" ] && [ -z "$EXEMPT_MODE" ] \
    || die "list takes only --status, --limit and --offset."
  case "$STATUS" in ''|TRIALING|ACTIVE|PAST_DUE|SUSPENDED) ;; *) die "--status must be TRIALING, ACTIVE, PAST_DUE or SUSPENDED." ;; esac
  [[ -z "$LIMIT" || "$LIMIT" =~ ^[0-9]+$ ]] || die "--limit must be a whole number (1-100)."
  [[ -z "$OFFSET" || "$OFFSET" =~ ^[0-9]+$ ]] || die "--offset must be a whole number."
else
  [[ "$TENANT_ID" =~ $UUID_RE ]] || die "<tenantId> must be a UUID."
  [ -n "$REASON" ] || die "--reason is required."
  [ -n "$OPERATOR" ] || die "--operator is required (your name)."
  [ "${#REASON}" -le 500 ] || die "--reason must be at most 500 characters."
  [ "${#OPERATOR}" -le 100 ] || die "--operator must be at most 100 characters."
  [ -z "$STATUS$LIMIT$OFFSET" ] || die "--status, --limit and --offset belong to list."
  if [ "$COMMAND" = "grace" ]; then
    [[ "$UNTIL" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$ ]] \
      || die "grace needs --until as an ISO-8601 UTC instant (YYYY-MM-DDTHH:MM:SSZ)."
  elif [ -n "$UNTIL" ]; then
    die "--until belongs to grace."
  fi
  if [ "$COMMAND" = "exempt" ]; then
    [ -n "$EXEMPT_MODE" ] || die "exempt needs --set or --clear."
  elif [ -n "$EXEMPT_MODE" ]; then
    die "--set and --clear belong to exempt."
  fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/relay-auth.sh
source "$SCRIPT_DIR/lib/relay-auth.sh"
relay_auth_init

BASE="$BACKEND_URL/internal"
FIELDS="\"operator\":\"$(json_escape "$OPERATOR")\",\"reason\":\"$(json_escape "$REASON")\""

echo "Calling the backend..." >&2
case "$COMMAND" in
  suspend|unsuspend)
    relay_curl -X POST "$BASE/tenants/$TENANT_ID/billing/$COMMAND" -d "{$FIELDS}"
    ;;
  grace)
    relay_curl -X POST "$BASE/tenants/$TENANT_ID/billing/grace" \
      -d "{$FIELDS,\"graceUntil\":\"$UNTIL\"}"
    ;;
  exempt)
    if [ "$EXEMPT_MODE" = "set" ]; then EXEMPT_JSON=true; else EXEMPT_JSON=false; fi
    relay_curl -X PUT "$BASE/tenants/$TENANT_ID/billing/exempt" \
      -d "{$FIELDS,\"exempt\":$EXEMPT_JSON}"
    ;;
  list)
    QUERY=""
    [ -n "$STATUS" ] && QUERY="${QUERY}&status=$STATUS"
    [ -n "$LIMIT" ] && QUERY="${QUERY}&limit=$LIMIT"
    [ -n "$OFFSET" ] && QUERY="${QUERY}&offset=$OFFSET"
    relay_curl "$BASE/billing/tenants?${QUERY#&}"
    ;;
esac
echo
