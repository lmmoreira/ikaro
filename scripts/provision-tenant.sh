#!/usr/bin/env bash
set -euo pipefail

# Usage: ./provision-tenant.sh <name> <slug> <adminEmail> <country_code> [timezone]
# Must run from inside the relay VM's own SSH shell (metadata server + ingress:internal).
# INTERNAL_KEY must be exported beforehand — fetch it from YOUR OWN machine:
#   gcloud secrets versions access latest --secret=internal-api-key --project=ikaro-staging
# then on the relay VM:
#   export INTERNAL_KEY="<value>"

PROJECT_ID="${PROJECT_ID:-ikaro-staging}"
REGION="${REGION:-southamerica-east1}"
BACKEND_URL="${BACKEND_URL:-https://ikaro-backend-729809528251.southamerica-east1.run.app}"

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 <name> <slug> <adminEmail> <country_code> [timezone]" >&2
  exit 1
fi

TENANT_NAME="$1"
TENANT_SLUG="$2"
ADMIN_EMAIL="$3"
COUNTRY_CODE="$4"
TIMEZONE="${5:-}"

if [ -z "${INTERNAL_KEY:-}" ]; then
  echo "ERROR: INTERNAL_KEY is not set. Fetch it from your own machine (not this VM):" >&2
  echo "  gcloud secrets versions access latest --secret=internal-api-key --project=$PROJECT_ID" >&2
  echo "then: export INTERNAL_KEY=\"<value>\"" >&2
  exit 1
fi

meta() {
  curl -s -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/$1"
}

echo "Fetching access token..." >&2
ACCESS_TOKEN=$(meta "instance/service-accounts/default/token" \
  | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

echo "Fetching identity token for $BACKEND_URL..." >&2
ID_TOKEN=$(meta "instance/service-accounts/default/identity?audience=$BACKEND_URL")

echo "Fetching platform-admin-key from Secret Manager..." >&2
PLATFORM_ADMIN_KEY=$(curl -s -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://secretmanager.googleapis.com/v1/projects/$PROJECT_ID/secrets/platform-admin-key/versions/latest:access" \
  | grep -o '"data": *"[^"]*"' | cut -d'"' -f4 | base64 -d)

if [ -z "$ACCESS_TOKEN" ] || [ -z "$ID_TOKEN" ] || [ -z "$PLATFORM_ADMIN_KEY" ]; then
  echo "ERROR: one or more tokens/secrets came back empty. Check metadata-server reachability" >&2
  echo "and that you're actually inside the relay VM's own interactive SSH shell." >&2
  exit 1
fi

echo "Health check..." >&2
HEALTH=$(curl -s -H "Authorization: Bearer $ID_TOKEN" "$BACKEND_URL/health/ready")
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
curl -X POST "$BACKEND_URL/internal/tenants" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY" \
  -H "X-Internal-Key: $INTERNAL_KEY" \
  -H "Content-Type: application/json" \
  -d "$BODY"
echo
