# M16 — CI/CD Deploy Pipelines + Production Hardening

> ⚠️ **SUPERSEDED by `plan/M17-CLOUD-DEPLOY.md` (2026-07-07).** All stories were reconciled against the implemented codebase and merged into M17 (see M17's traceability appendix). Key corrections made in M17: Workload Identity Federation replaces `GCP_SA_KEY_*` JSON keys, 4 GitHub environments instead of 11, migrations run as a Cloud Run Job (this file's `docker run` on a GitHub runner cannot reach the private-IP Cloud SQL), S06's `E2E_TEST_MODE`/`test-login` bypass is superseded by the shipped Dev Login (M115-S02), S08's error catalog is already largely implemented (M17 audits it), S09's Grafana VM is replaced by managed observability (M17 D9), and S11's OAuth state must wrap the existing routing payload (implemented in `oauth-state.ts`) rather than replace it. Do not implement stories from this file. Kept for historical reference.

**Phase:** Cloud ☁️  
**Goal:** Every merge to `main` automatically builds, scans, and deploys to staging. Production is promoted via a manual approval gate. The system is hardened with E2E tests, rate limiting, a complete error catalog, and SLO monitoring. The first real tenant is provisioned and go-live is validated.  
**Depends on:** M15 (GCP infrastructure provisioned)  
**Blocks:** nothing — this is the final milestone.

---

## Stories

---

### M16-S01 — GitHub Environments + Secrets setup

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/09-CI_CD_PIPELINE.md` § GitHub environments, `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md`

**Description:**  
Create all 11 GitHub Environments with their protection rules and populate the required secrets. This is the prerequisite for all deploy workflows.

**Environments to create (in GitHub repository Settings → Environments):**
- `staging-migrations` — no approval required; auto-deploys from `main`
- `staging-backend` — no approval; depends on `staging-migrations`
- `staging-bff` — no approval; depends on `staging-backend`
- `staging-frontend` — no approval; depends on `staging-bff`
- `production-migrations` — requires 1 reviewer approval
- `production-backend` — requires 1 reviewer approval
- `production-bff` — requires 1 reviewer approval
- `production-frontend` — requires 1 reviewer approval
- `staging-infrastructure` — for Terraform applies (staging)
- `production-infrastructure` — requires 1 reviewer approval
- `observability` — for GCE VM deploys

**Secrets to configure per environment:**
- `GCP_SA_KEY_STAGING` / `GCP_SA_KEY_PROD` — service account JSON key for deployer SA
- `GCP_PROJECT_STAGING` / `GCP_PROJECT_PROD` — GCP project IDs
- `SONAR_TOKEN` — SonarCloud
- `SNYK_TOKEN` — Snyk
- `GAR_LOCATION` — `southamerica-east1`

**Acceptance criteria:**
- [ ] All 11 environments visible in GitHub repository settings
- [ ] Production environments have required reviewer protection rules (cannot bypass)
- [ ] Secrets are populated and not visible in logs
- [ ] Environment names match exactly what the deploy workflows reference

**Dependencies:** M15-S11

---

### M16-S02 — Staging auto-deploy workflow

**Agent:** `devops`  
**Complexity:** M  
**Docs to load:** `docs/09-CI_CD_PIPELINE.md` § CD pipeline, `docs/12-DEPLOYMENT_STRATEGY.md` § immutable artifacts

**Description:**  
Create the GitHub Actions workflow that automatically builds, scans, and deploys all 3 services to staging on every push to `main`. Migrations run as a hard prerequisite before any app deployment.

**`.github/workflows/deploy-staging.yml`** — triggers on `push` to `main`:

**Stage 1 — Build + scan (parallel):**
- Build Docker images for backend, BFF, web (tagged with `$GITHUB_SHA`)
- Trivy scan each image (fail on HIGH/CRITICAL)
- Push to GAR: `southamerica-east1-docker.pkg.dev/<project>/ikaro-registry/<service>:<sha>`

**Stage 2 — Migrations (environment: `staging-migrations`):**
- Pull `ikaro-backend:<sha>` image
- Run: `docker run ... migration:run`
- Must succeed before ANY service deploys

**Stage 3 — Deploy services (sequential: backend → BFF → frontend):**
- Each: `gcloud run deploy ikaro-<service> --image=<sha-tagged-image> --region=southamerica-east1`
- Each uses its GitHub Environment (`staging-backend`, `staging-bff`, `staging-frontend`)

**Stage 4 — Smoke test:**
- `curl -f https://bff-staging.<ikaro-domain>/v1/health/ready` → must return 200
- `curl -f https://staging.<ikaro-domain>/health/live` → must return 200

**Acceptance criteria:**
- [ ] Push to `main` triggers the workflow automatically
- [ ] A failed Trivy scan blocks all deployments (images not pushed to GAR)
- [ ] A failed migration blocks all service deploys
- [ ] Services deploy sequentially (not in parallel — BFF needs backend ready)
- [ ] Smoke test failure sends a Slack/GitHub notification
- [ ] Image tags use Git SHA (not `latest`) — immutable artifacts
- [ ] Complete pipeline runs in under 15 minutes

**Dependencies:** M16-S01, M15-S09, M15-S05

---

### M16-S03 — Production deploy workflow (approval-gated)

**Agent:** `devops`  
**Complexity:** M  
**Docs to load:** `docs/09-CI_CD_PIPELINE.md` § production promotion, `docs/12-DEPLOYMENT_STRATEGY.md` § rollback strategy

**Description:**  
Create the GitHub Actions workflow for production deployment. Production promotes the SAME Docker image SHA that was deployed to staging — no rebuilds. The workflow is triggered manually (`workflow_dispatch`) with the SHA to promote as input.

**`.github/workflows/deploy-production.yml`** — triggers on `workflow_dispatch`:
- Input: `image_sha` (the staging-validated SHA to promote)

**Stage 1 — Approval gate:**
- Environment: `production-migrations` (requires 1 reviewer)
- Shows the diff: which SHA is being promoted, what changed since last production deploy

**Stage 2 — Migrations (environment: `production-migrations`):**
- Run migrations against production Cloud SQL
- Hard prerequisite — cannot proceed on failure

**Stage 3 — Deploy services (sequential, each with approval gate):**
- `production-backend` → deploy backend → verify readiness probe
- `production-bff` → deploy BFF → verify readiness probe
- `production-frontend` → deploy web → verify health check

**Stage 4 — Post-deploy validation:**
- Run smoke test suite against production URLs
- Verify: `GET /health/ready` on all 3 services
- Verify: Grafana shows no spike in error rate (via Prometheus query API)

**Rollback procedure (documented in workflow):**
- Re-run workflow with the previous SHA as `image_sha`
- Run migration revert if schema change was included

**Acceptance criteria:**
- [ ] Workflow can only be triggered manually — never auto-deploys to production
- [ ] Production migration step requires reviewer approval before running
- [ ] The SAME image SHA used in staging is deployed to production (no rebuild)
- [ ] Failed production smoke test triggers an automatic rollback (re-deploy previous SHA)
- [ ] Rollback completes in under 5 minutes
- [ ] All deploy steps logged with timestamps for audit trail

**Dependencies:** M16-S02

---

### M16-S04 — Tenant isolation integration test suite

**Agent:** `test-ts`  
**Complexity:** M  
**Docs to load:** `docs/08-TESTING_STRATEGY.md` § tenant isolation pattern, `docs/06-TENANT_ISOLATION_STRATEGY.md`

**Description:**  
Implement a dedicated, comprehensive tenant isolation test suite that covers all 6 bounded contexts. This runs in CI as a separate test suite (`pnpm test:isolation`) and must pass before any merge.

**Test pattern (from `docs/08-TESTING_STRATEGY.md`):**
```
1. Create Tenant A + Tenant B (via CLI or direct DB)
2. Create data for Tenant A (bookings, services, staff, loyalty entries)
3. Attempt to access Tenant A's data using Tenant B's JWT
4. Assert: 404 (not revealing existence) or 403 (forbidden)
```

**Contexts to cover:**
- **Booking:** GET /bookings/:tenantA-booking-id as Tenant B → `404`
- **Service:** PATCH /services/:tenantA-service-id as Tenant B → `404`
- **Staff:** GET /staff/:tenantA-staff-id as Tenant B → `404`
- **Loyalty:** GET /loyalty/entries as Tenant B → returns only Tenant B's entries (Tenant A's invisible)
- **Schedule:** DELETE /schedule/closures/:tenantA-closure-id as Tenant B → `404`
- **Platform/Settings:** PATCH /tenants/settings as Tenant B → only affects Tenant B's settings

**Acceptance criteria:**
- [ ] 6 dedicated isolation tests — one per context
- [ ] All tests use real Testcontainers (PostgreSQL + Pub/Sub emulator) — no mocks
- [ ] All 6 tests pass — any failure is a critical security bug that blocks merge
- [ ] Tests run in CI as `pnpm test:isolation` (separate suite from unit/integration tests)
- [ ] No `.skip()` — all 6 must run every time
- [ ] Test names follow pattern: `should not expose TenantA [entity] to TenantB request`

**Dependencies:** M07-S03, M08-S06, M10-S05

---

### M16-S05 — Migration CI job (Stage 4.5 — separate prerequisite)

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/09-CI_CD_PIPELINE.md` § Stage 4.5 migrations

**Description:**  
Implement the migration runner as a dedicated CI step that runs BEFORE app deployment and AFTER the Docker image build. This enforces the "migrations before deploy" rule at the pipeline level — it is impossible to deploy without migrations having run.

**`.github/workflows/run-migrations.yml`** (reusable workflow):
- Inputs: `environment` (staging | production), `image_sha`
- Pulls `ikaro-backend:<sha>` image from GAR
- Runs: `docker run --env DATABASE_URL=<from secret> ikaro-backend migration:run`
- On success: outputs `migrations_applied` count
- On failure: exits with code 1 — caller workflow cannot proceed

**Also add to local dev:**
- CI checks that migration files are backward-compatible (expand/contract pattern)
- A migration that drops a column while code still reads it will fail the backward-compatibility check

**Acceptance criteria:**
- [ ] Migration workflow runs before any service deploy in both staging and production pipelines
- [ ] A failed migration returns exit code 1 and prevents all downstream deploy steps
- [ ] Migration output (number of applied migrations, names) is printed to workflow logs
- [ ] Re-running migrations when up-to-date is idempotent (TypeORM handles this — just logs "No migrations to run")
- [ ] `DATABASE_URL` is read from GitHub Secret (never logged)

**Dependencies:** M16-S01, M15-S04

---

### M16-S06 — E2E test suite (Playwright — 5 critical paths)

**Agent:** `test-ts`  
**Complexity:** L  
**Docs to load:** `docs/08-TESTING_STRATEGY.md` § E2E tests, `docs/04-USE_CASES.md` § relevant UCs

> **⚠️ Partially absorbed by AUD-015 (2026-06-22):**
> The CI infrastructure work originally scoped here — spinning up the full stack (docker-compose infra + backend + BFF + web) in GitHub Actions and running Playwright per-PR — has been implemented in `.github/workflows/pr-e2e.yml` as part of AUD-015. The existing spec suite (`guest-booking.spec.ts`, `localization.spec.ts`, `not-found.spec.ts`, `hotsite-auth-bar.spec.ts`) already runs in CI on every PR against the local dev stack.
>
> **Remaining scope for M16-S06:** adapt the CI job to run against the **staging/production URL** (set `PLAYWRIGHT_BASE_URL` to the deployed environment) and implement the auth-flow journeys (Journey 2–5 below) once Google OAuth test-bypass (`ENABLE_DEV_AUTH`) is wired up in staging.

**Description:**  
Implement the 5 critical end-to-end journeys using Playwright. These tests run against the staging environment after deployment (smoke test). They cover the golden paths — no negative/edge cases (those are unit/integration tests).

**Journey 1 — Guest booking flow (UC-001 + UC-011):**
1. Navigate to `/{slug}` hotsite
2. Select 1 service
3. Pick an available slot
4. Fill guest info (name, email)
5. Submit → see "Solicitação enviada!" confirmation screen

**Journey 2 — Customer OAuth login + booking (UC-021 + UC-002):**
1. Navigate to `/auth/login`
2. Click "Entrar com Google" (uses mock OAuth — see implementation note below)
3. Land on `/dashboard`
4. Navigate to "Novo Agendamento"
5. Complete booking → see it in "Próximos agendamentos"

**Journey 3 — Staff approval workflow (UC-003):**
1. Login as staff
2. Navigate to booking queue (CommandCenter)
3. See the pending booking from Journey 1
4. Click "Aprovar" → booking removed from queue
5. Customer dashboard shows booking as "Confirmado"

**Journey 4 — Loyalty earn + view (UC-009 + UC-016):**
1. Login as staff
2. Mark booking from Journey 3 as complete (set actual price, upload after photo)
3. Login as customer
4. Navigate to Fidelidade page
5. Assert points balance > 0 and entry appears in history

**Journey 5 — Hotsite renders per tenant (UC-027):**
1. Admin publishes hotsite with HERO + SERVICE_LIST modules
2. Navigate to `/{slug}` in incognito
3. Assert HERO renders with correct tenant name
4. Assert SERVICE_LIST shows the tenant's services
5. Assert primary color CSS variable applied

**OAuth mock implementation (required for Journeys 2, 3, 4):**
Real Google OAuth cannot be automated in Playwright (Google blocks headless browsers). Implement a test bypass in the BFF:

In `apps/bff/src/auth/auth.controller.ts`:
```typescript
// Test-only bypass: enabled ONLY when E2E_TEST_MODE=true (never in production)
@Get('test-login')
@Public()
async testLogin(@Query('googleSub') sub: string, @Query('role') role: string) {
  if (process.env.E2E_TEST_MODE !== 'true') throw new ForbiddenException();
  // Look up or create user by sub, issue JWT directly
}
```

`E2E_TEST_MODE=true` must be set ONLY in the E2E test environment — it is blocked at the env validation level from being set in production (`NODE_ENV=production` + `E2E_TEST_MODE=true` → startup error).

Playwright tests use `GET /v1/auth/test-login?googleSub=google-sub-customer-a&role=CUSTOMER` to get a JWT, then set it as a cookie — bypassing the browser OAuth flow entirely.

**Acceptance criteria:**
- [ ] All 5 journeys pass against staging environment after deploy
- [ ] Journeys use real API calls — no HTTP mocking in Playwright
- [ ] `GET /v1/auth/test-login` returns `403` when `E2E_TEST_MODE` is not `'true'`
- [ ] `E2E_TEST_MODE=true` combined with `NODE_ENV=production` causes BFF startup failure
- [ ] Each journey runs in under 60 seconds
- [ ] `pnpm test:e2e` runs all 5 journeys; `--grep Journey1` runs individually
- [ ] Screenshots captured on failure for debugging

**Dependencies:** M13-S13, M12-S07, M10-S01

---

### M16-S07 — Rate limiting enforcement (all public endpoints)

**Agent:** `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md` § rate limiting, `docs/14-API_CONTRACTS.md` § public vs protected routes

**Description:**  
Finalize the rate limiting configuration that was scaffolded in M00-S04. Apply the correct throttling limits to all endpoint groups and add the correct response headers.

**Throttling rules (from `docs/24-BFF_ARCHITECTURE.md`):**
- Public (unauthenticated) endpoints: **60 requests/minute** per IP
- Authenticated endpoints: **300 requests/minute** per JWT `sub`
- Cron endpoints (`/cron/*`): bypassed (protected by `CRON_SECRET` only)
- Health endpoints (`/health/*`): bypassed
- `POST /internal/tenants`: **3 requests/hour** per IP (provisioning is a rare operation; extremely strict to limit brute-force of `PLATFORM_ADMIN_KEY`)

**NestJS `@nestjs/throttler` configuration:**
- Two named throttlers: `public` (60/min) and `authenticated` (300/min)
- Override per-endpoint with `@Throttle({ public: { limit: 10, ttl: 60 } })` for sensitive endpoints like `/auth/token`
- Override for `/internal/tenants`: `@Throttle({ public: { limit: 3, ttl: 3600 } })`
- Brute-force lockout on `/internal/tenants`: block IP for 1 hour after 10 consecutive `401` responses (Cloud Armor WAF rule — pair with M15-S12)
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

**Acceptance criteria:**
- [ ] 61st unauthenticated request within 1 minute returns `429 Too Many Requests`
- [ ] `429` response body is RFC 9457 Problem Detail with pt-BR message: `"Muitas requisições. Tente novamente em alguns segundos."`
- [ ] `X-RateLimit-Remaining` header decrements correctly with each request
- [ ] Authenticated requests have 300 req/min limit (not 60)
- [ ] `/health/live` and `/health/ready` are never rate-limited
- [ ] `POST /auth/token` (JWT issuance) has a stricter limit: 10 req/min per IP
- [ ] `POST /internal/tenants` blocks after 3 requests/hour per IP

**Dependencies:** M00-S04, M03-S06, M15-S12

---

### M16-S08 — Complete error catalog implementation (RFC 9457)

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/25-ERROR_CATALOG.md`

**Description:**  
Implement the complete error catalog from `docs/25-ERROR_CATALOG.md`. Every non-2xx response must return a RFC 9457 Problem Detail JSON. This story ensures consistency across all error cases.

**RFC 9457 Problem Detail structure:**
```json
{
  "type": "https://<ikaro-domain>/errors/booking-slot-unavailable",
  "title": "Horário indisponível",
  "status": 409,
  "detail": "O horário selecionado não está mais disponível. Por favor, escolha outro horário.",
  "instance": "/v1/bookings",
  "correlationId": "uuid"
}
```

**What to create:**
- `apps/backend/src/shared/http/problem-detail.exception.ts` — base exception class wrapping RFC 9457 fields
- One typed exception per error code in `docs/25-ERROR_CATALOG.md` (e.g., `BookingSlotUnavailableException`, `TenantNotFoundError`, `StaffLastManagerException`)
- Global exception filter in both backend and BFF: catches all exceptions, formats as Problem Detail
- All error `detail` messages in pt-BR

**Acceptance criteria:**
- [ ] Every `4xx` and `5xx` response has `Content-Type: application/problem+json`
- [ ] Every error response includes `correlationId` matching the request's `X-Correlation-ID`
- [ ] `type` URI is consistent: `https://<ikaro-domain>/errors/<kebab-case-name>`
- [ ] Validation errors (`400`) include a `violations` array: `[{ field: "email", message: "E-mail inválido" }]`
- [ ] Unhandled exceptions return `500` with generic pt-BR message (never exposes stack traces in production)
- [ ] Unit test: throw each custom exception → assert Problem Detail shape

**Dependencies:** M00-S03, M00-S04

---

### M16-S09 — GCE observability VM (production only)

**Agent:** `devops`  
**Complexity:** M  
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § deployment, `docs/23-INFRASTRUCTURE_SETUP.md` § GCE VM

**Description:**  
Create the Terraform module for the GCE e2-small VM that hosts the production observability stack (Prometheus, Grafana, Loki, OTel Collector). This only deploys when `create_observability_vm=true` (production environment). The VM runs the same Docker Compose files from `docker/docker-compose.observability.yml`.

**`infrastructure/terraform/observability.tf`:**
- GCE instance: `e2-small` in `southamerica-east1-b`, 20GB SSD
- Runs `cos-cloud/cos-stable` (Container-Optimized OS) or Ubuntu with Docker
- Startup script: clones repo, starts `docker compose -f docker/docker-compose.observability.yml up -d`
- Firewall: allows ingress on port 3100 (Grafana) from admin IP only
- Persistent disk for Prometheus + Loki data

**Acceptance criteria:**
- [ ] `create_observability_vm=false` (staging) → no VM created
- [ ] `create_observability_vm=true` (production) → VM created and Docker Compose starts automatically
- [ ] Grafana accessible at `http://<vm-external-ip>:3100` (admin access only)
- [ ] Prometheus scraping Cloud Run services via internal URLs
- [ ] Data volumes persisted on separate disk (not wiped on VM restart)
- [ ] Checkov: OS login enabled, project-wide SSH keys disabled

**Dependencies:** M15-S09, M15-S02

---

### M16-S10 — Production go-live checklist + first tenant

**Agent:** `devops` + `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/12-DEPLOYMENT_STRATEGY.md` § go-live, `docs/04-USE_CASES.md` § UC-024

**Description:**  
Execute the final go-live checklist: configure production secrets, deploy to production, provision the first real tenant, validate SLOs, and configure monitoring alerts.

**Go-live checklist (execute in order):**

1. **Populate production secrets** in GCP Secret Manager:
   - `database-url` — Cloud SQL production connection string
   - `jwt-secret` — freshly generated 64+ character random string (NOT the staging secret)
   - `google-oauth-client-id` / `google-oauth-client-secret` — production OAuth credentials
   - `sendgrid-api-key` — production SendGrid API key
   - `cron-secret` — freshly generated random string

2. **Apply production Terraform:**
   - `terraform apply -var-file=prod.tfvars` (requires `production-infrastructure` environment approval)

3. **First production deploy** (via M16-S03 workflow with staging-validated SHA)

4. **Provision first tenant** (via `POST /internal/tenants` — M02-S05):
   ```bash
   curl -X POST https://backend.<ikaro-domain>/internal/tenants \
     -H "Authorization: Bearer $(gcloud secrets versions access latest --secret=platform-admin-key)" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Lavacar BeloAuto",
       "slug": "lavacar-beloauto",
       "adminEmail": "admin@lavacar.com.br",
       "timezone": "America/Sao_Paulo"
     }'
   ```
   Prerequisite: Cloud IAP token must be included (M15-S12). The operator must be in the IAP allowlist.
   Verify: `TenantProvisioned` event published, first MANAGER staff row created (M04-S06), invitation email in SendGrid logs.

5. **Validate SLOs:**
   - API availability: 100% over first 30 minutes
   - Booking P99 latency: <2s (test with Playwright E2E)
   - Health checks: all 3 services returning `200` on `/health/ready`

6. **Configure Grafana alerting channels** (email/Slack for on-call)

7. **DNS + domain mapping** (if custom domain ready): configure Cloud Run domain mapping for `<ikaro-domain>`

**Acceptance criteria:**
- [ ] Production deployment completes with zero errors
- [ ] `GET https://bff.<ikaro-domain>/v1/health/ready` returns `200`
- [ ] First tenant exists in production database
- [ ] All 5 Playwright E2E journeys (M16-S06) pass against production URLs
- [ ] Grafana dashboards show live data from production
- [ ] Alerting rules active (Prometheus `/alerts` shows all rules in INACTIVE = healthy)
- [ ] All production secrets populated (none with placeholder values)
- [ ] Billing alert configured in GCP: notify at $50, $100, $200/month

**Dependencies:** M16-S03, M16-S06, M16-S09, M15-S11

---

### M16-S11 — OAuth state parameter (stateless CSRF protection)

**Agent:** `bff-ts`
**Complexity:** S
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md` § Security Considerations

**Description:**
The `GoogleStrategy` currently omits the OAuth `state` parameter, leaving the login flow vulnerable to CSRF (an attacker can forge a callback that logs the victim into the attacker's session). This story implements a stateless signed nonce as the `state` value — no sessions required.

**What to implement:**
- On `GET /auth/google`: generate a short-lived signed JWT (`{ nonce: uuidv7() }`, 5-minute TTL) and pass it as `state` to Google via `passReqToCallback: true` + manual state injection, or by extending `GoogleStrategy` with a custom `authorizationParams()`.
- On `GET /auth/google/callback`: extract and verify the `state` JWT. Reject with `400` if missing, tampered, or expired.
- Use the existing `JwtIssuerService` (M03-S04) for signing/verifying the state nonce.

**Acceptance criteria:**
- [ ] `/auth/google` redirect URL includes a `state` query parameter containing a signed JWT
- [ ] `/auth/google/callback` with a missing or invalid `state` returns `400`
- [ ] `/auth/google/callback` with an expired `state` (> 5 min) returns `400`
- [ ] Valid callback with correct `state` completes the OAuth flow normally
- [ ] Unit tests cover all three rejection scenarios

**Dependencies:** M03-S04 (JwtIssuerService), M16-S10
