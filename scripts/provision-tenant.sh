#!/usr/bin/env bash
set -euo pipefail

# Usage: ./provision-tenant.sh <name> <slug> <adminEmail> <country_code> [timezone]
#          [--exempt] [--tax-id <cpf|cnpj|ein>]
#
# Every tenant is provisioned through one pattern: the script first reserves an OPERATOR Billing
# registration (POST /internal/billing/registrations), which holds the billing intent of the new
# tenant, then creates the tenant (POST /internal/tenants) with the returned registrationId.
#
#   --exempt           Free access, never charged: the registration carries exempt = true.
#   --tax-id           The tenant's tax id (CPF/CNPJ for BR, EIN for the US), validated and held by
#                      the registration. Optional: the operator is trusted, and a tenant without one
#                      has the manager type it in the billing page.
#
# The registration id always comes from the registrations call's response, so it is valid by
# construction. If the tenant call fails after the reservation, run the script again: the abandoned
# RESERVED registration is harmless and is released by the one-hour sweep.
#
# Must run from inside the relay VM's own SSH shell (metadata server + ingress:internal).
# The relay VM service account discovers its project/backend and reads both required secrets
# automatically. INTERNAL_KEY may still be exported explicitly for emergency/manual use or
# local acceptance testing.

REGION="${REGION:-southamerica-east1}"

USAGE="Usage: $0 <name> <slug> <adminEmail> <country_code> [timezone] [--exempt] [--tax-id <id>]"

# Flags may appear anywhere after the four required positionals; the optional fifth positional is
# the timezone. Everything is validated here, before any network call.
POSITIONAL=()
EXEMPT=false
TAX_ID=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --exempt) EXEMPT=true; shift ;;
    --tax-id)
      if [ "$#" -lt 2 ] || [ -z "$2" ]; then
        echo "ERROR: $1 needs a value." >&2
        echo "$USAGE" >&2
        exit 1
      fi
      case "$1" in
        --tax-id) TAX_ID="$2" ;;
      esac
      shift 2
      ;;
    --*)
      echo "ERROR: unknown flag $1." >&2
      echo "$USAGE" >&2
      exit 1
      ;;
    *) POSITIONAL+=("$1"); shift ;;
  esac
done

if [ "${#POSITIONAL[@]}" -lt 4 ] || [ "${#POSITIONAL[@]}" -gt 5 ]; then
  echo "$USAGE" >&2
  exit 1
fi

TENANT_NAME="${POSITIONAL[0]}"
TENANT_SLUG="${POSITIONAL[1]}"
ADMIN_EMAIL="${POSITIONAL[2]}"
COUNTRY_CODE="${POSITIONAL[3]}"
TIMEZONE="${POSITIONAL[4]:-}"

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
    "https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/services/ikaro-backend" \
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

# Every tenant reserves its Billing registration first (it holds the exempt flag and the tax id until
# the Billing handler builds the account from it).
{
  REG_BODY='{"source":"OPERATOR"'
  if [ "$EXEMPT" = true ]; then
    REG_BODY="${REG_BODY},\"exempt\":true"
  fi
  if [ -n "$TAX_ID" ]; then
    REG_BODY="${REG_BODY},\"taxId\":\"${TAX_ID}\",\"countryCode\":\"${COUNTRY_CODE}\""
  fi
  REG_BODY="${REG_BODY}}"

  echo "Reserving billing registration..." >&2
  REG_RESPONSE=$(curl -sS --fail-with-body -X POST "$BACKEND_URL/internal/billing/registrations" \
    -H "Authorization: Bearer $ID_TOKEN" \
    -H "X-Internal-Key: $INTERNAL_KEY" \
    -H "Content-Type: application/json" \
    -d "$REG_BODY")
  REGISTRATION_ID=$(printf '%s' "$REG_RESPONSE" \
    | grep -o '"registrationId": *"[^"]*"' | cut -d'"' -f4 || true)
  if [ -z "$REGISTRATION_ID" ]; then
    echo "ERROR: the registrations call returned no registrationId — aborting before the tenant is created." >&2
    echo "$REG_RESPONSE" >&2
    exit 1
  fi
  echo "Registration reserved: $REGISTRATION_ID" >&2
}

BODY=$(printf '{"name":"%s","slug":"%s","adminEmail":"%s","country_code":"%s"' \
  "$TENANT_NAME" "$TENANT_SLUG" "$ADMIN_EMAIL" "$COUNTRY_CODE")
if [ -n "$TIMEZONE" ]; then
  BODY="${BODY},\"timezone\":\"${TIMEZONE}\""
fi
BODY="${BODY},\"registrationId\":\"${REGISTRATION_ID}\""
BODY="${BODY}}"

echo "Provisioning tenant..." >&2
if ! curl -sS --fail-with-body -X POST "$BACKEND_URL/internal/tenants" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "X-Platform-Admin-Key: $PLATFORM_ADMIN_KEY" \
  -H "X-Internal-Key: $INTERNAL_KEY" \
  -H "Content-Type: application/json" \
  -d "$BODY"; then
  echo >&2
  echo "ERROR: the tenant was not created. The registration $REGISTRATION_ID stays RESERVED (released by the one-hour sweep); run the script again." >&2
  exit 1
fi
echo
