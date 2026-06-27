#!/bin/bash
# ci-local.sh — replicates the full CI pipeline locally using only Docker.
# No tokens required. Snyk and SonarCloud run in CI only.
#
# Usage:
#   pnpm ci:local              — all checks except E2E
#   RUN_E2E=true pnpm ci:local — include Playwright E2E (requires pnpm infra:up first)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PASS="\033[0;32m✔\033[0m"
FAIL="\033[0;31m✖\033[0m"
HEAD="\033[1;34m==>\033[0m"

step() { echo -e "\n${HEAD} $1"; }
ok()   { echo -e "${PASS} $1"; }

# ─── Static analysis ─────────────────────────────────────────────────────────
step "ESLint"
pnpm lint
ok "ESLint"

step "Prettier"
pnpm prettier --check .
ok "Prettier"

step "TypeScript"
pnpm type-check
ok "TypeScript"

# ─── Unit tests (ci:fast equivalent) ─────────────────────────────────────────
step "Backend unit tests"
pnpm --filter @ikaro/backend test:unit
ok "Backend unit tests"

step "BFF unit tests"
pnpm --filter @ikaro/bff test:unit
ok "BFF unit tests"

step "Web tests (Vitest)"
pnpm --filter @ikaro/web test
ok "Web tests (Vitest)"

# ─── Integration / component tests (ci:integration equivalent) ───────────────
step "Backend integration tests"
pnpm --filter @ikaro/backend test:integration
ok "Backend integration tests"

step "BFF component tests"
pnpm --filter @ikaro/bff test:component
ok "BFF component tests"

# ─── E2E (Playwright) ─────────────────────────────────────────────────────────
step "E2E tests (Playwright)"
if [ "${RUN_E2E:-false}" = "true" ]; then
  pnpm --filter @ikaro/web e2e:ci
  ok "E2E tests"
else
  echo -e "  Skipped — run with RUN_E2E=true pnpm ci:local to include"
  echo -e "  Requires: pnpm infra:up + apps running"
fi

# ─── Secret scan (gitleaks via Docker — no token needed) ─────────────────────
step "Gitleaks secret scan"
docker run --rm \
  -v "$ROOT:/repo" \
  ghcr.io/gitleaks/gitleaks:latest \
  detect --source /repo --config /repo/.gitleaks.toml
ok "Gitleaks"

# ─── Docker builds ───────────────────────────────────────────────────────────
step "Docker build — backend"
docker build -f apps/backend/Dockerfile -t ikaro-backend:scan . -q
ok "Docker build — backend"

step "Docker build — bff"
docker build -f apps/bff/Dockerfile -t ikaro-bff:scan . -q
ok "Docker build — bff"

step "Docker build — web"
docker build -f apps/web/Dockerfile -t ikaro-web:scan . -q
ok "Docker build — web"

# ─── Trivy image scans (via Docker — no install needed) ──────────────────────
TRIVY="docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:latest"

step "Trivy — backend"
$TRIVY image --severity HIGH,CRITICAL --ignore-unfixed ikaro-backend:scan
ok "Trivy — backend"

step "Trivy — bff"
$TRIVY image --severity HIGH,CRITICAL --ignore-unfixed ikaro-bff:scan
ok "Trivy — bff"

step "Trivy — web"
$TRIVY image --severity HIGH,CRITICAL --ignore-unfixed ikaro-web:scan
ok "Trivy — web"

echo -e "\n\033[1;32m✔ All local checks passed — safe to open a PR.\033[0m\n"
