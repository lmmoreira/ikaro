#!/usr/bin/env bash
# Shared relay-VM auth block for the operator scripts (provision-tenant.sh, billing-operator.sh).
# SOURCED, never executed: it only defines functions and runs nothing at source time, so a caller
# validates its own arguments first and touches the network only after.
#
# The backend is on internal ingress, so a script that calls it must run from the relay VM's own
# SSH shell (scripts/relay-vm-up.sh; docs/RUNBOOKS.md § Staging). On the VM the metadata server and
# Secret Manager give everything this needs.
#
#   relay_auth_init   sets PROJECT_ID, BACKEND_URL, ACCESS_TOKEN, ID_TOKEN, PLATFORM_ADMIN_KEY and
#                     INTERNAL_KEY, checks none is empty, and runs the health check. BACKEND_URL
#                     and INTERNAL_KEY may be exported beforehand (emergency / local acceptance).
#   relay_curl ...    curl against the backend: sends the identity token, both keys and a JSON
#                     content type, and keeps the output body on a 4xx/5xx.
#
# NO SECRET IN PROCESS ARGUMENTS (docs/ENGINEERING_RULES_INFRA.md): `ps` shows every user's command
# lines on the relay VM, so tokens and keys never go through `-H`. Both helpers hand curl its
# headers on stdin through `--config -`, written with the `printf` builtin (which is not a process).

REGION="${REGION:-southamerica-east1}"

# Non-secret metadata-server read: the header is a fixed marker, so `-H` is fine here.
relay_meta() {
  curl -sS --fail-with-body -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/$1"
}

# curl with headers on stdin. Usage: _relay_curl_with_headers <header>... -- <curl arguments...>
_relay_curl_with_headers() {
  local config="" header
  while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do
    config+="header = \"$1\""$'\n'
    shift
  done
  shift # the "--"
  printf '%s' "$config" | curl -sS --fail-with-body --config - "$@"
}

# Reads one Secret Manager secret's latest version (base64 in the JSON answer) as plain text.
_relay_secret() {
  _relay_curl_with_headers "Authorization: Bearer $ACCESS_TOKEN" -- \
    "https://secretmanager.googleapis.com/v1/projects/$PROJECT_ID/secrets/$1/versions/latest:access" \
    | grep -o '"data": *"[^"]*"' | cut -d'"' -f4 | base64 -d
}

# A BACKEND_URL taken from the environment must not send the identity token and both keys over
# plain HTTP to a remote host. Loopback stays allowed for local acceptance (the default of
# scripts/billing-clock-advance.sh is http://localhost:3001).
_relay_require_safe_backend_url() {
  case "$1" in
    https://*|http://localhost|http://localhost[:/]*|http://127.0.0.1|http://127.0.0.1[:/]*|http://\[::1\]|http://\[::1\][:/]*) ;;
    *)
      echo "ERROR: BACKEND_URL must be https:// (plain http:// is allowed only for localhost): $1" >&2
      return 1
      ;;
  esac
}

relay_auth_init() {
  if [ -n "${BACKEND_URL:-}" ]; then
    _relay_require_safe_backend_url "$BACKEND_URL" || return 1
  fi
  PROJECT_ID="${PROJECT_ID:-$(relay_meta project/project-id)}"

  echo "Fetching access token..." >&2
  ACCESS_TOKEN=$(relay_meta "instance/service-accounts/default/token" \
    | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

  if [ -z "${BACKEND_URL:-}" ]; then
    echo "Discovering backend URL..." >&2
    BACKEND_URL=$(_relay_curl_with_headers "Authorization: Bearer $ACCESS_TOKEN" -- \
      "https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/services/ikaro-backend" \
      | grep -o '"uri": *"[^"]*"' | cut -d'"' -f4)
  fi

  echo "Fetching identity token for $BACKEND_URL..." >&2
  ID_TOKEN=$(relay_meta "instance/service-accounts/default/identity?audience=$BACKEND_URL")

  echo "Fetching platform-admin-key from Secret Manager..." >&2
  PLATFORM_ADMIN_KEY=$(_relay_secret platform-admin-key)

  if [ -z "${INTERNAL_KEY:-}" ]; then
    echo "Fetching internal-api-key from Secret Manager..." >&2
    INTERNAL_KEY=$(_relay_secret internal-api-key)
  else
    echo "Using INTERNAL_KEY from the environment." >&2
  fi

  if [ -z "$ACCESS_TOKEN" ] || [ -z "$ID_TOKEN" ] || [ -z "$PLATFORM_ADMIN_KEY" ] || [ -z "$INTERNAL_KEY" ]; then
    echo "ERROR: one or more tokens/secrets came back empty. Check metadata-server reachability" >&2
    echo "and the relay service account's Secret Manager permissions." >&2
    return 1
  fi

  echo "Health check..." >&2
  local health
  health=$(relay_curl "$BACKEND_URL/health/ready")
  echo "$health" >&2
  case "$health" in
    *'"status":"ok"'*) ;;
    *) echo "ERROR: health check did not return ok — aborting before mutating anything." >&2; return 1 ;;
  esac
}

relay_curl() {
  _relay_curl_with_headers \
    "Authorization: Bearer $ID_TOKEN" \
    "X-Internal-Key: $INTERNAL_KEY" \
    "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY" \
    "Content-Type: application/json" \
    -- "$@"
}
