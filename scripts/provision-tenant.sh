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
# construction. If the tenant call is refused with an HTTP 4xx, the script releases the registration
# it reserved (best effort: a failed release never replaces the original error) and you can run it
# again. After a timeout, a network error or a 5xx it does NOT release, because the tenant may have
# committed; the abandoned RESERVED registration is harmless and the one-hour sweep clears it.
#
# Must run from inside the relay VM's own SSH shell (metadata server + ingress:internal).
# The relay VM service account discovers its project/backend and reads both required secrets
# automatically. INTERNAL_KEY may still be exported explicitly for emergency/manual use or
# local acceptance testing.

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

# The four required positionals must carry a value: an empty one would pass the count check above
# and only fail at the tenant endpoint, after the registration was already reserved.
for required in "$TENANT_NAME" "$TENANT_SLUG" "$ADMIN_EMAIL" "$COUNTRY_CODE"; do
  if [ -z "$required" ]; then
    echo "ERROR: name, slug, adminEmail and country_code must not be empty." >&2
    echo "$USAGE" >&2
    exit 1
  fi
done

# Values are sent as JSON text: a control character (a newline, a tab) cannot be carried in one, so
# refuse it here, before the registration is reserved. Quotes and backslashes are escaped below.
for value in "$TENANT_NAME" "$TENANT_SLUG" "$ADMIN_EMAIL" "$COUNTRY_CODE" "$TIMEZONE" "$TAX_ID"; do
  if [[ "$value" =~ [[:cntrl:]] ]]; then
    echo "ERROR: arguments must not contain control characters (newlines, tabs)." >&2
    exit 1
  fi
done

# Escapes a value for use inside a JSON string: backslash first, then the double quote.
json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

# The relay-VM auth block (metadata token, backend URL, identity token, both keys, health check) is
# shared with the other operator scripts. Nothing runs until relay_auth_init is called, after the
# validation above. Secrets never travel as process arguments (docs/ENGINEERING_RULES_INFRA.md).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/relay-auth.sh
source "$SCRIPT_DIR/lib/relay-auth.sh"
relay_auth_init

# Every tenant reserves its Billing registration first (it holds the exempt flag and the tax id until
# the Billing handler builds the account from it).
{
  REG_BODY='{"source":"OPERATOR"'
  if [ "$EXEMPT" = true ]; then
    REG_BODY="${REG_BODY},\"exempt\":true"
  fi
  if [ -n "$TAX_ID" ]; then
    REG_BODY="${REG_BODY},\"taxId\":\"$(json_escape "$TAX_ID")\",\"countryCode\":\"$(json_escape "$COUNTRY_CODE")\""
  fi
  REG_BODY="${REG_BODY}}"

  echo "Reserving billing registration..." >&2
  REG_RESPONSE=$(relay_curl -X POST "$BACKEND_URL/internal/billing/registrations" -d "$REG_BODY")
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
  "$(json_escape "$TENANT_NAME")" "$(json_escape "$TENANT_SLUG")" \
  "$(json_escape "$ADMIN_EMAIL")" "$(json_escape "$COUNTRY_CODE")")
if [ -n "$TIMEZONE" ]; then
  BODY="${BODY},\"timezone\":\"$(json_escape "$TIMEZONE")\""
fi
BODY="${BODY},\"registrationId\":\"${REGISTRATION_ID}\""
BODY="${BODY}}"

echo "Provisioning tenant..." >&2
TENANT_STATUS=0
TENANT_RESPONSE=$(relay_curl -X POST "$BACKEND_URL/internal/tenants" -d "$BODY") || TENANT_STATUS=$?
printf '%s\n' "$TENANT_RESPONSE"
if [ "$TENANT_STATUS" -ne 0 ]; then
  echo >&2
  echo "ERROR: the tenant was not created." >&2
  # Release the registration only after a definite refusal (an HTTP 4xx Problem Detail): the tenant
  # was not committed, so the registration is no longer needed. After a timeout, a network error or
  # a 5xx the tenant may have committed, and deleting its RESERVED registration would make the
  # Billing handler fail for it, so the one-hour sweep clears it instead (M26-S24).
  if printf '%s' "$TENANT_RESPONSE" | grep -Eq '"status": *4[0-9][0-9]'; then
    if relay_curl -X POST "$BACKEND_URL/internal/billing/registrations/${REGISTRATION_ID}/release" >/dev/null; then
      echo "The registration $REGISTRATION_ID was released; fix the cause and run the script again." >&2
    else
      echo "WARNING: releasing registration $REGISTRATION_ID failed; it stays RESERVED and the one-hour sweep (M26-S08) will clear it." >&2
    fi
  else
    echo "The registration $REGISTRATION_ID stays RESERVED (the tenant may exist: check before running the script again); the one-hour sweep (M26-S08) clears it if no tenant was created." >&2
  fi
  exit 1
fi
