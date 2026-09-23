# M00 — Monorepo Foundation

**Phase:** Local Development  
**Goal:** A developer can clone the repository, run `pnpm infra:up && pnpm db:migrate && pnpm dev`, and have all three services (backend :3001, BFF :3002, web :3000) running locally with live-reload within 30 minutes.  
**Depends on:** nothing — this is the starting point.  
**Blocks:** all other milestones.

---

## Stories

---

### M00-S01 — Initialize pnpm monorepo structure ✅ Done

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/22-TECH_STACK_DECISIONS.md` § monorepo, `docs/11-ARCHITECTURE.md` § repository layout

**Description:**  
Create the root monorepo scaffold. This is the empty skeleton that every subsequent story will build upon. No application code exists yet — only the workspace wiring, shared config files, and `.gitignore`.

**What to create:**
- `package.json` (root) — with `"workspaces": ["apps/*", "packages/*"]`, scripts: `dev`, `build`, `test`, `lint`, `type-check`
- `pnpm-workspace.yaml` — declares `apps/*` and `packages/*`
- `.npmrc` — `shamefully-hoist=false`, `strict-peer-dependencies=false`
- `.gitignore` — node_modules, dist, .env*, coverage, .next, *.tsbuildinfo
- `packages/config/` — empty directory with `package.json` (name: `@ikaro/config`)
- `packages/types/` — empty directory with `package.json` (name: `@ikaro/types`) and `src/index.ts` (empty barrel export)
- `apps/backend/`, `apps/bff/`, `apps/web/` — empty directories each with a stub `package.json`

**Acceptance criteria:**
- [ ] `pnpm install` runs from root with zero errors
- [ ] `pnpm -r list` shows all workspaces: `@ikaro/config`, `@ikaro/types`, `@ikaro/backend`, `@ikaro/bff`, `@ikaro/web`
- [ ] No `node_modules` committed (`.gitignore` covers it)
- [ ] Root `package.json` has `"engines": { "node": ">=20", "pnpm": ">=9" }`

**Dependencies:** none

---

### M00-S02 — Shared packages: ESLint, TypeScript, Prettier configs ✅ Done

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/CODE_STANDARDS.md`

**Description:**  
Populate `packages/config` with the shared ESLint, TypeScript base, and Prettier configurations that all three apps (`backend`, `bff`, `web`) will extend. This ensures every agent writing code in any app follows identical linting and formatting rules from day one.

**What to create:**
- `packages/config/eslint-base.js` — ESLint config: TypeScript strict, `@typescript-eslint/no-explicit-any: error`, `@typescript-eslint/no-unused-vars: error`, Prettier plugin
- `packages/config/tsconfig.base.json` — `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, `target: ES2022`, `module: NodeNext`
- `packages/config/tsconfig.nextjs.json` — extends base, adds Next.js-specific settings
- `packages/config/prettier.config.js` — `singleQuote: true`, `trailingComma: 'all'`, `printWidth: 100`, `semi: true`
- Each app's `tsconfig.json` must extend the relevant base config

**Acceptance criteria:**
- [ ] `pnpm lint` from root runs ESLint across all apps with zero errors on empty stubs
- [ ] `pnpm type-check` runs `tsc --noEmit` across all apps with zero errors
- [ ] `@typescript-eslint/no-explicit-any` is set to `error` (not warn)
- [ ] Prettier config is shared — running `pnpm format` from root formats all files consistently

**Dependencies:** M00-S01

---

### M00-S03 — Backend app skeleton (NestJS v11) ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/11-ARCHITECTURE.md` § hexagonal layers, `docs/ENGINEERING_RULES_SHARED.md`

**Description:**  
Bootstrap the NestJS v11 backend application with the correct hexagonal folder structure, health check endpoints, and the IEventBus port wired to a no-op adapter for local development. No business logic yet — this is the structural scaffold all backend contexts will be built on top of.

**Folder structure to create:**
```
apps/backend/src/
├── app.module.ts
├── main.ts                          ← bootstrap, port 3001
├── shared/
│   ├── ports/                       ← IEventBus, IEmailSender (interfaces only)
│   ├── domain/                      ← AggregateRoot, DomainEvent, ValueObject (stubs)
│   ├── tenant/                      ← TenantContext class (stub)
│   ├── observability/               ← AppLogger (stub — just console.log wrapper for now)
│   └── http/                        ← ProblemDetail base type (RFC 9457)
├── contexts/
│   ├── platform/
│   ├── customer/
│   ├── staff/
│   ├── booking/
│   ├── loyalty/
│   └── notification/
└── health/
    └── health.controller.ts         ← GET /health/live, GET /health/ready
```

**Acceptance criteria:**
- [ ] `pnpm --filter @ikaro/backend dev` starts on port 3001 with no errors
- [ ] `GET /health/live` returns `200 { status: 'ok' }`
- [ ] `GET /health/ready` returns `200 { status: 'ok' }` (DB check stubbed as always-true for now)
- [ ] Each `src/contexts/<name>/` directory has `domain/`, `application/`, `infrastructure/` subdirectories
- [ ] `IEventBus` interface exists in `src/shared/ports/` with a `publish(event)` method
- [ ] TypeScript compiles with zero errors

**Dependencies:** M00-S01, M00-S02

---

### M00-S04 — BFF app skeleton (NestJS v11) ✅ Done

**Agent:** `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md`, `docs/14-API_CONTRACTS.md` § base standards

**Description:**  
Bootstrap the NestJS v11 BFF service. The BFF is the sole public entry point for the web layer — it handles OAuth, JWT validation, tenant enforcement, and proxies requests to the backend. At this stage it only needs the structural skeleton, rate-limiting module wired in, health endpoints, and the `CorrelationInterceptor` generating `X-Correlation-ID` on every request.

**Folder structure to create:**
```
apps/bff/src/
├── app.module.ts
├── main.ts                          ← port 3002, global prefix /v1
├── shared/
│   ├── guards/                      ← JwtAuthGuard, TenantGuard, RolesGuard (stubs)
│   ├── interceptors/
│   │   ├── correlation.interceptor.ts   ← generates/propagates X-Correlation-ID
│   │   └── error.interceptor.ts         ← re-emits backend errors as RFC 9457
│   └── decorators/                  ← @CurrentUser(), @Roles(), @Public()
├── health/
│   └── health.controller.ts         ← GET /health/live, GET /health/ready
└── auth/                            ← stub module
```

**Acceptance criteria:**
- [ ] `pnpm --filter @ikaro/bff dev` starts on port 3002 with no errors
- [ ] `GET /v1/health/live` returns `200 { status: 'ok' }`
- [ ] Every response includes `X-Correlation-ID` header (generated UUID v4 if not in request)
- [ ] `@nestjs/throttler` is installed and configured: 60 req/min for public, 300 req/min for authenticated (using named throttlers)
- [ ] TypeScript compiles with zero errors

**Dependencies:** M00-S01, M00-S02

---

### M00-S05 — Web app skeleton (Next.js 14 + shadcn/ui) ✅ Done

**Agent:** `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`

**Description:**  
Bootstrap the Next.js 14 application with the App Router, Tailwind CSS, and shadcn/ui component library initialised. Establish the top-level folder structure for both the hotsite (`app/[slug]/`) and the dashboard (`app/dashboard/`) so future stories can place components in the right place without structural conflicts.

**Folder structure to create:**
```
apps/web/
├── app/
│   ├── layout.tsx                   ← root layout
│   ├── page.tsx                     ← redirect → /dashboard or first tenant slug
│   ├── [slug]/                      ← hotsite (public)
│   │   └── page.tsx                 ← stub: "Hotsite for {slug}"
│   ├── dashboard/                   ← authenticated area stub
│   │   └── page.tsx                 ← stub: "Dashboard"
│   └── auth/
│       └── login/page.tsx           ← stub login page
├── components/
│   ├── hotsite/
│   ├── dashboard/
│   └── shared/
├── lib/
│   ├── api/                         ← typed BFF client (empty)
│   ├── auth/                        ← session helpers (empty)
│   └── hooks/                       ← TanStack Query wrappers (empty)
└── middleware.ts                    ← redirects /dashboard/* → /auth/login if no JWT cookie
```

**Acceptance criteria:**
- [ ] `pnpm --filter @ikaro/web dev` starts on port 3000 with no errors
- [ ] `GET /` returns 200
- [ ] `GET /[any-slug]` renders the hotsite stub page
- [ ] `GET /dashboard` renders the dashboard stub page (no redirect yet — auth is M03)
- [ ] `shadcn/ui` init complete: `components/ui/button.tsx` exists (Button component)
- [ ] Tailwind CSS applied: root layout has `<body className="font-sans antialiased">`
- [ ] TypeScript compiles with zero errors

**Dependencies:** M00-S01, M00-S02

---

### M00-S06 — Docker Compose local development environment ✅ Done

**Agent:** `devops`  
**Complexity:** M  
**Docs to load:** `docs/23-INFRASTRUCTURE_SETUP.md` § local development setup

**Description:**  
Create the `docker/docker-compose.yml` that launches every external dependency the application needs locally. This single command (`pnpm infra:up`) must replicate the production environment. Agents implementing backend features must be able to run against this stack with no cloud credentials.

**Services to configure:**
- `postgres` — PostgreSQL 17, port 5432, creates 6 databases/schemas on init: `platform`, `customer`, `staff`, `booking`, `loyalty`, `notification`
- `pubsub-emulator` — GCP Pub/Sub Emulator, port 8085
- `gcs-emulator` — GCS Emulator (fake-gcs-server), port 4443
- `mailhog` — MailHog SMTP (port 1025) + web UI (port 8025)

**Also create:**
- `docker/init-db.sql` — creates the 6 PostgreSQL schemas
- `.env.example` — all environment variables with safe placeholder values (no real secrets)
- Root `package.json` scripts: `"infra:up": "docker compose -f docker/docker-compose.yml up -d"`, `"infra:down": "docker compose -f docker/docker-compose.yml down"`

**Acceptance criteria:**
- [ ] `pnpm infra:up` starts all 4 containers with zero errors
- [ ] `psql -U ikaro -d ikaro` can connect on port 5432
- [ ] All 6 schemas exist: `\dn` lists platform, customer, staff, booking, loyalty, notification
- [ ] Pub/Sub emulator responds on `http://localhost:8085`
- [ ] MailHog web UI is accessible at `http://localhost:8025`
- [ ] `pnpm infra:down` stops and removes all containers cleanly
- [ ] No real credentials in any committed file

**Dependencies:** M00-S01

---

### M00-S07 — Database migration infrastructure ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/13-DATABASE_SCHEMA.md` § migration ordering, `docs/09-CI_CD_PIPELINE.md` § Stage 4.5 migrations

**Description:**  
Set up TypeORM DataSource configuration for each bounded context and the migration runner scripts. No migration files are created yet — this story establishes the tooling so that every subsequent backend story can generate and run migrations with a single command. TypeORM `synchronize` must be `false` — the app never auto-migrates.

**What to create:**
- `apps/backend/src/shared/database/data-source.ts` — TypeORM DataSource factory, reads `DATABASE_URL` from env, `synchronize: false`, `migrationsRun: false`
- `apps/backend/src/contexts/<each>/infrastructure/migrations/` — empty directory per context
- `apps/backend/package.json` scripts:
  - `"migration:generate": "typeorm migration:generate"`
  - `"migration:run": "typeorm migration:run -d src/shared/database/data-source.ts"`
  - `"migration:revert": "typeorm migration:revert -d src/shared/database/data-source.ts"`
- Root `package.json` script: `"db:migrate": "pnpm --filter @ikaro/backend migration:run"`
- `apps/backend/.env.example` — `DATABASE_URL=postgresql://ikaro:ikaro@localhost:5432/ikaro`

**Acceptance criteria:**
- [ ] `pnpm db:migrate` runs (with no migrations to run) without errors when Docker Compose is up
- [ ] TypeORM DataSource can connect to the local PostgreSQL instance
- [ ] `synchronize: false` is set — app startup never touches the schema
- [ ] Running `migration:generate` produces a timestamped file in the correct context's `migrations/` folder
- [ ] Migration files include `tenant_id UUID NOT NULL` on every table (validated by code review, enforced by convention checklist in the script)

**Dependencies:** M00-S03, M00-S06

---

### M00-S08 — Shared domain primitives ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/02-DOMAIN_MODEL.md` § value objects, `docs/ENGINEERING_RULES_SHARED.md` § Architecture

**Description:**  
Implement the base domain classes that every bounded context's domain layer will extend or use. These live in `apps/backend/src/shared/` and are the only shared code importable across contexts. No framework dependencies — pure TypeScript.

**What to create:**
- `src/shared/domain/aggregate-root.ts` — `AggregateRoot<T>` with `domainEvents: DomainEvent[]`, `addDomainEvent()`, `clearDomainEvents()`
- `src/shared/domain/domain-event.ts` — abstract `DomainEvent` with all 7 envelope fields: `eventId` (UUID v7), `tenantId`, `occurredAt` (UTC ISO-8601), `correlationId`, `eventName`, `eventVersion`, `data`
- `src/shared/domain/value-object.ts` — abstract `ValueObject<T>` with structural equality `equals()`
- `src/shared/value-objects/money.ts` — `Money { amount: Decimal, currency: 'BRL' }` immutable value object; `add()`, `format()` returns `"R$ 1.234,56"` (pt-BR format)
- `src/shared/value-objects/address.ts` — `Address { street, number, complement?, neighborhood, city, state, zipCode }` Brazilian postal format
- `src/shared/ports/event-bus.port.ts` — `IEventBus { publish(event: DomainEvent): Promise<void> }`
- `src/shared/ports/email-sender.port.ts` — `IEmailSender { send(to, template, data): Promise<void> }`

**Acceptance criteria:**
- [ ] `Money.from(1234.56, 'BRL').format()` returns `'R$ 1.234,56'` (comma decimal, dot thousands)
- [ ] `Money` is immutable — `add()` returns a new instance, never mutates
- [ ] `DomainEvent` constructor auto-populates `eventId` with UUID v7 and `occurredAt` with `new Date().toISOString()`
- [ ] `AggregateRoot.clearDomainEvents()` returns the events AND empties the internal array
- [ ] No framework imports (`@nestjs/*`) anywhere in `src/shared/domain/` or `src/shared/value-objects/`
- [ ] Unit tests cover `Money.format()`, `Money.add()`, `ValueObject.equals()`, and `AggregateRoot` event lifecycle

**Dependencies:** M00-S03

---

### M00-S09 — AppLogger (structured JSON logging) ✅ Done

**Agent:** `backend-ts`  
**Complexity:** S  
**Docs to load:** `docs/10-OBSERVABILITY_STRATEGY.md` § logging contract

**Description:**  
Implement the `AppLogger` service used by all backend and BFF code. It wraps NestJS's `LoggerService` and outputs structured JSON to stdout with the mandatory fields defined in the observability strategy. `console.log` is forbidden everywhere — ESLint rule must enforce this.

**What to create:**
- `apps/backend/src/shared/observability/app-logger.ts` — NestJS injectable logger; outputs JSON with fields: `timestamp`, `level`, `service`, `context`, `tenantId?`, `userId?`, `correlationId?`, `traceId?`, `spanId?`, `message`, `metadata?`
- Same file replicated (or shared via `packages/`) for `apps/bff`
- ESLint rule in `packages/config/eslint-base.js`: `"no-console": "error"` to block direct `console.*` calls

**Acceptance criteria:**
- [ ] `AppLogger.log('message', { tenantId: 'x' })` outputs valid JSON to stdout with all mandatory fields
- [ ] Level methods: `log()` → INFO, `warn()` → WARN, `error()` → ERROR, `debug()` → DEBUG
- [ ] `"no-console": "error"` ESLint rule is active — `console.log('x')` in any app file fails lint
- [ ] `AppLogger` is registered as global in `AppModule` via `app.useLogger()`
- [ ] Unit test: assert output is valid JSON and contains `timestamp`, `level`, `message`

**Dependencies:** M00-S03, M00-S02

---

### M00-S10 — Root developer scripts and .env wiring ✅ Done

**Agent:** `devops`  
**Complexity:** S  
**Docs to load:** `docs/23-INFRASTRUCTURE_SETUP.md` § local development setup

**Description:**  
Wire up all root-level developer scripts so a new developer (or AI agent) can operate the entire project with a small set of well-known commands. Also create the `.env.local` loading convention so each app picks up its variables without manual copying.

**Scripts to add to root `package.json`:**
```json
"dev":          "pnpm -r --parallel run dev",
"build":        "pnpm -r run build",
"test":         "pnpm -r run test",
"test:e2e":     "pnpm --filter @ikaro/web run test:e2e",
"lint":         "pnpm -r run lint",
"type-check":   "pnpm -r run type-check",
"infra:up":     "docker compose -f docker/docker-compose.yml up -d",
"infra:down":   "docker compose -f docker/docker-compose.yml down",
"obs:up":       "docker compose -f docker/docker-compose.observability.yml up -d",
"db:migrate":   "pnpm --filter @ikaro/backend migration:run",
"db:revert":    "pnpm --filter @ikaro/backend migration:revert"
```

**Also create:**
- `apps/backend/.env.example`, `apps/bff/.env.example`, `apps/web/.env.example` — all variables with safe placeholder values
- `README.md` at repo root — quick-start: 5 commands to get running locally

**Acceptance criteria:**
- [ ] `pnpm infra:up && pnpm db:migrate && pnpm dev` starts all three services without errors
- [ ] Backend runs on :3001, BFF on :3002, web on :3000
- [ ] `pnpm lint` and `pnpm type-check` both pass across all workspaces
- [ ] Root `README.md` exists with the 5-command quick-start guide
- [ ] No `.env` files with real values are committed

**Dependencies:** M00-S03, M00-S04, M00-S05, M00-S06, M00-S07

---

### M00-S11 — Shared TypeScript types package (`packages/types`) ✅ Done

**Agent:** `fullstack-ts`  
**Complexity:** M  
**Docs to load:** `docs/14-API_CONTRACTS.md` (full), `docs/02-DOMAIN_MODEL.md` § value objects

**Description:**  
Populate `packages/types` with the canonical TypeScript DTO and response types shared between the BFF and the frontend. Without this, backend agents and frontend agents define their own types independently — they will drift and integration will break. Every BFF response type and every request body type lives here. Neither the backend nor the frontend owns these types; the `@ikaro/types` package does.

**What to create in `packages/types/src/`:**

Value objects:
```typescript
// money.ts
export interface Money { amount: number; currency: 'BRL'; formatted: string; }

// address.ts
export interface Address { street: string; number: string; complement?: string; neighborhood: string; city: string; state: string; zipCode: string; }

// pagination.ts
export interface Pagination { limit: number; offset: number; total: number; hasMore: boolean; nextOffset?: number; }
```

Enums (mirror backend domain exactly):
```typescript
// booking-status.ts
export type BookingStatus = 'PENDING' | 'INFO_REQUESTED' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
export type BookingType = 'GUEST' | 'CUSTOMER';
export type StaffRole = 'MANAGER' | 'STAFF';
export type ClosureReason = 'STAFF_DAY_OFF' | 'MAINTENANCE' | 'HOLIDAY';
export type HotsiteModuleType = 'HERO' | 'SERVICE_LIST' | 'GALLERY' | 'TESTIMONIALS' | 'BOOKING_CTA' | 'ABOUT' | 'CONTACT';
```

Request/Response DTOs (one file per domain area, named `*.dto.ts`):
- `booking.dto.ts` — `CreateBookingRequest`, `BookingResponse`, `BookingLineResponse`, `CompleteBookingRequest`, `RescheduleBookingRequest`
- `service.dto.ts` — `CreateServiceRequest`, `UpdateServiceRequest`, `ServiceResponse`
- `schedule.dto.ts` — `CreateClosureRequest`, `ClosureResponse`, `AvailabilitySlot`, `AvailabilityResponse`
- `loyalty.dto.ts` — `LoyaltyBalanceResponse`, `LoyaltyEntryResponse`
- `staff.dto.ts` — `InviteStaffRequest`, `StaffResponse`
- `auth.dto.ts` — `TokenResponse`, `TenantSelectionItem`, `SwitchTenantRequest`
- `tenant.dto.ts` — `TenantManifestResponse`, `UpdateTenantSettingsRequest`, `HotsiteConfigResponse`, `UpdateHotsiteRequest`
- `errors.dto.ts` — `ProblemDetail`, `ValidationViolation`

**Barrel export:** `packages/types/src/index.ts` re-exports everything.

**Acceptance criteria:**
- [ ] `import { BookingResponse } from '@ikaro/types'` works in both `apps/bff` and `apps/web`
- [ ] Every BFF controller's response type annotation uses a type from `@ikaro/types` (not a locally-defined interface)
- [ ] Every frontend hook's return type uses a type from `@ikaro/types`
- [ ] `BookingStatus` enum in `@ikaro/types` matches the backend domain enum exactly — any mismatch is a TypeScript error
- [ ] `Money.formatted` is always `"R$ 1.234,56"` — the shape contract prevents agents from displaying `"150.00"` in the UI
- [ ] `pnpm type-check` passes after types are imported in both BFF and web

**Dependencies:** M00-S01, M00-S02

---

### M00-S12 — Local development seed script ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-024, `docs/02-DOMAIN_MODEL.md`

**Description:**  
Create a `pnpm db:seed` script that populates the local database with two complete tenants and realistic test data. Without this, every agent working on a feature starts from an empty database and must manually create prerequisite data every time. This alone will save hours across the project.

**Seed data to create:**

**Tenant A — "Lavacar BeloAuto" (slug: `lavacar-beloauto`)**
- MANAGER staff: `admin@lavacar.com.br` (activated, `google_oauth_id: 'google-sub-admin-a'`)
- STAFF: `funcionario@lavacar.com.br` (activated)
- Services: "Lavagem Simples" (R$ 80, 30min, 5pts), "Lavagem Completa" (R$ 150, 60min, 10pts), "Polimento" (R$ 350, 120min, 25pts, requires pickup address)
- Customer: `cliente@email.com.br` (`google_oauth_id: 'google-sub-customer-a'`)
- Bookings: 1 PENDING, 1 APPROVED (scheduled tomorrow), 1 COMPLETED (last week, loyalty earned)
- HotsiteConfig: published, with HERO + SERVICE_LIST + BOOKING_CTA modules
- Business hours: Mon–Sat 08:00–18:00, Sunday closed

**Tenant B — "AutoSpa Premium" (slug: `autospa-premium`)**
- MANAGER staff: `admin@autospa.com.br` (activated)
- Services: "Higienização Interna" (R$ 200, 90min, 15pts)
- Customer: same `cliente@email.com.br` person (different Customer row — multi-tenant test)
- HotsiteConfig: published

**Script location:** `apps/backend/src/shared/database/seed.ts`
- Runs via: `pnpm --filter @ikaro/backend seed`
- Root script: `"db:seed": "pnpm --filter @ikaro/backend seed"`
- Idempotent: detects if tenants already exist by slug, skips if already seeded
- Prints a summary table of what was created

**Acceptance criteria:**
- [ ] `pnpm db:seed` runs against the local Docker Compose database without errors
- [ ] After seeding, `GET /v1/tenants/slug/lavacar-beloauto` returns the hotsite manifest
- [ ] Both tenants exist with different slugs and no data overlap
- [ ] Same customer (`cliente@email.com.br`) exists as separate `Customer` rows in both tenants
- [ ] The COMPLETED booking has a `LoyaltyEntry` associated (so loyalty balance > 0 on first login)
- [ ] Running `pnpm db:seed` twice does not create duplicate data
- [ ] Root `README.md` documents the seed credentials (emails + `google_oauth_id` values for test login)

**Dependencies:** M00-S07, M00-S03

---

### M00-S13 — BFF CORS, cookie config, env validation, and photo upload limits ✅ Done

**Agent:** `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/24-BFF_ARCHITECTURE.md`, `docs/14-API_CONTRACTS.md`

**Description:**  
Four small but critical configurations that must be established in M00 so every subsequent story can rely on them. Each is a deliberate decision documented below with the rationale.

**1. CORS configuration (in `apps/bff/src/main.ts`):**
```typescript
app.enableCors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,           // required for cookies
  methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Tenant-Slug','X-Correlation-ID'],
});
```
- `ALLOWED_ORIGINS` env var — comma-separated list; in production: `https://<ikaro-domain>`

**2. JWT cookie configuration (applied when issuing JWT in M03-S04):**
```typescript
res.cookie('access_token', jwt, {
  httpOnly: true,        // not accessible via JavaScript (XSS protection)
  secure: process.env.NODE_ENV === 'production',  // HTTPS only in prod
  sameSite: 'lax',       // allows OAuth redirect to work while blocking CSRF
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days in ms
  path: '/',
});
```
**Decision rationale:** `sameSite: 'lax'` is chosen over `'strict'` because OAuth redirects (cross-site GET) must carry the cookie. `'strict'` would break the OAuth callback.

**3. Photo upload size limit (in BFF request config):**
- Max request body size: `10MB` (covers high-quality phone photos)
- Enforced via `app.use(express.json({ limit: '10mb' }))` in `main.ts`
- Signed URL endpoint validates `contentType` is `image/jpeg` or `image/png` only — no PDFs, no videos

**4. Environment variable validation at startup:**
Create `apps/bff/src/config/env.validation.ts` using `joi` or `zod`:
```typescript
const schema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.coerce.number().default(3002),
  BACKEND_INTERNAL_URL: z.string().url(),
  JWT_SECRET: z.string().min(64, 'JWT_SECRET must be at least 64 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  CRON_SECRET: z.string().min(32),
});
```
- Same pattern applied to `apps/backend/src/config/env.validation.ts`
- App fails to start with a clear error listing all missing/invalid vars

**Acceptance criteria:**
- [ ] `OPTIONS` preflight request from `http://localhost:3000` to BFF returns `200` with correct CORS headers
- [ ] JWT cookie is `httpOnly=true` — `document.cookie` in browser does NOT show it
- [ ] Uploading a `.pdf` file via signed URL endpoint returns `400`
- [ ] Uploading a file >10MB returns `413 Payload Too Large`
- [ ] Starting BFF without `JWT_SECRET` set prints: `"❌ ENV validation failed: JWT_SECRET must be at least 64 characters"` and exits with code 1
- [ ] Starting BFF without `GOOGLE_CLIENT_ID` set prints all missing vars at once (not one by one)

**Dependencies:** M00-S04
