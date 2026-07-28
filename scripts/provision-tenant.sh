#!/usr/bin/env bash
set -euo pipefail

# Usage: ./provision-tenant.sh <name> <slug> <adminEmail> <country_code> [timezone]
# Must run from inside the relay VM's own SSH shell (metadata server + ingress:internal).
# The relay VM service account discovers its project/backend and reads both required secrets
# automatically. INTERNAL_KEY may still be exported explicitly for emergency/manual use or
# local acceptance testing.

REGION="${REGION:-southamerica-east1}"

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 <name> <slug> <adminEmail> <country_code> [timezone]" >&2
  exit 1
fi

TENANT_NAME="$1"
TENANT_SLUG="$2"
ADMIN_EMAIL="$3"
COUNTRY_CODE="$4"
TIMEZONE="${5:-}"

meta() {
  curl -sS --fail-with-body -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/$1"
}

PROJECT_ID="${PROJECT_ID:-$(meta project/project-id)}"

echo "Fetching access token..." >&2
ACCESS_TOKEN=$(meta "instance/service-accounts/default/token" \
  | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "${BACKEND_URL:-}" ]; then
  echo "Discovering backend URL..." >&2
  BACKEND_URL=$(curl -sS --fail-with-body \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    "https://run.googleapis.com/apis/serving.knative.dev/v1/projects/$PROJECT_ID/locations/$REGION/services/ikaro-backend" \
    | grep -o '"uri": *"[^"]*"' | cut -d'"' -f4)
fi

echo "Fetching identity token for $BACKEND_URL..." >&2
ID_TOKEN=$(meta "instance/service-accounts/default/identity?audience=$BACKEND_URL")

echo "Fetching platform-admin-key from Secret Manager..." >&2
PLATFORM_ADMIN_KEY=$(curl -sS --fail-with-body \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://secretmanager.googleapis.com/v1/projects/$PROJECT_ID/secrets/platform-admin-key/versions/latest:access" \
  | grep -o '"data": *"[^"]*"' | cut -d'"' -f4 | base64 -d)

if [ -z "${INTERNAL_KEY:-}" ]; then
  echo "Fetching internal-api-key from Secret Manager..." >&2
  INTERNAL_KEY=$(curl -sS --fail-with-body \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    "https://secretmanager.googleapis.com/v1/projects/$PROJECT_ID/secrets/internal-api-key/versions/latest:access" \
    | grep -o '"data": *"[^"]*"' | cut -d'"' -f4 | base64 -d)
else
  echo "Using INTERNAL_KEY from the environment." >&2
fi

if [ -z "$ACCESS_TOKEN" ] || [ -z "$ID_TOKEN" ] || [ -z "$PLATFORM_ADMIN_KEY" ] || [ -z "$INTERNAL_KEY" ]; then
  echo "ERROR: one or more tokens/secrets came back empty. Check metadata-server reachability" >&2
  echo "and the relay service account's Secret Manager permissions." >&2
  exit 1
fi

echo "Health check..." >&2
HEALTH=$(curl -sS --fail-with-body -H "Authorization: Bearer $ID_TOKEN" "$BACKEND_URL/health/ready")
echo "$HEALTH" >&2
case "$HEALTH" in
  *'"status":"ok"'*) ;;
  *) echo "ERROR: health check did not return ok — aborting before mutating anything." >&2; exit 1 ;;
esac

BODY=$(printf '{"name":"%s","slug":"%s","adminEmail":"%s","country_code":"%s"' \
  "$TENANT_NAME" "$TENANT_SLUG" "$ADMIN_EMAIL" "$COUNTRY_CODE")
if [ -n "$TIMEZONE" ]; then
  BODY="${BODY},\"timezone\":\"${TIMEZONE}\""
fi
BODY="${BODY}}"

echo "Provisioning tenant..." >&2
curl -sS --fail-with-body -X POST "$BACKEND_URL/internal/tenants" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY" \
  -H "X-Internal-Key: $INTERNAL_KEY" \
  -H "Content-Type: application/json" \
  -d "$BODY"
echo
