# Ikaro

Multi-tenant SaaS for car-wash booking and loyalty — Brazilian market (pt-BR / BRL).

## Quick Start

Five commands to get the full stack running locally:

```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure (PostgreSQL, Pub/Sub emulator, GCS emulator, MailHog)
pnpm infra:up

# 3. Copy environment files
cp apps/backend/.env.example apps/backend/.env
cp apps/bff/.env.example     apps/bff/.env
cp apps/web/.env.example     apps/web/.env.local

# 4. Run database migrations
pnpm db:migrate

# 5. Start all services in parallel (backend :3001, BFF :3002, web :3000)
pnpm dev
```

## Services

| Service | URL | Description |
|---------|-----|-------------|
| Web (Next.js) | http://localhost:3000 | Hotsite + Dashboard |
| BFF (NestJS) | http://localhost:3002/v1 | Backend-for-Frontend API |
| Backend (NestJS) | http://localhost:3001 | Internal domain service |
| MailHog | http://localhost:8025 | Email preview UI |
| Pub/Sub emulator | http://localhost:8085 | GCP Pub/Sub (local) |
| GCS emulator | http://localhost:4443 | GCS storage (local) |
| PostgreSQL | localhost:5432 | Database `ikaro`, user `ikaro_app` |

## VS Code Setup

Open the project — VS Code will prompt **"Do you want to install the recommended extensions?"**. Click **Install All**.

The `.vscode/settings.json` is pre-configured for:

| Setting | Value |
|---|---|
| Format on save | Prettier (matches CI gate) |
| ESLint auto-fix on save | enabled |
| TypeScript version | workspace v6 (not VS Code's bundled) |
| Ruler | 100 chars (matches `printWidth`) |
| Tailwind IntelliSense | CVA + clsx class regex enabled |
| Jest runner | `pnpm --filter @ikaro/backend test` |
| Coverage gutters | reads `apps/backend/coverage/lcov.info` |

**REST Client** (`humao.rest-client`) — test backend endpoints directly from VS Code without leaving the editor:

1. Install the extension (included in the recommended list above)
2. Start the app: `pnpm infra:up && pnpm dev`
3. Open any `.http` file under `apps/backend/http/`
4. Select the **`local`** environment from the VS Code status bar (bottom-right corner)
5. Click **"Send Request"** above any request block — the response appears in a split panel

```
apps/backend/http/
└── platform/
    └── internal-tenants.http   ← UC-024: provision tenant (all scenarios)
```

Each `.http` file covers the full scenario set for a resource: happy path, 4xx errors, edge cases. The `PLATFORM_ADMIN_KEY` is read automatically from your `apps/backend/.env` — nothing is hard-coded.

> Add a new `.http` file for every new endpoint you implement. Follow the existing file as a template.

**SonarLint connected mode** (mirrors the CI SonarCloud gate):
1. Install the `SonarLint` extension
2. `F1` → **"SonarLint: Connect to SonarCloud"** → sign in with GitHub
3. VS Code will automatically bind to the `lmmoreira_ikaro` project

**Database explorer** (`vscode-database-client2`): add a connection to `localhost:5432` with user/pass `ikaro_app` / `ikaro_app` (database `ikaro`) after running `pnpm infra:up`.

## Local CI (run before opening a PR)

These commands replicate the CI pipeline locally using only Docker — no tokens required.

```bash
pnpm ci:fast    # ~15s — lint + prettier + type-check + unit tests
                # Runs automatically on every git push (pre-push hook)

pnpm ci:local   # ~5min — everything above + integration tests
                #         + gitleaks secret scan (Docker)
                #         + docker build × 3
                #         + trivy image scan × 3 (Docker)
```

**Enable the pre-push hook once** after cloning:

```bash
git config core.hooksPath .githooks
```

## Monitoring CI checks after a push

After pushing a branch or opening a PR, run this script to wait for all GitHub CI checks to complete and get a one-line result:

```bash
bash scripts/wait-ci.sh
```

It auto-detects the open PR for the current branch, waits for checks to queue, polls every 30 s, and prints either:

```
✅ All 13 CI checks passed on PR #62.
```
```
❌ 2 of 13 CI checks failed on PR #62 — please verify: ESLint, SonarCloud Analysis
```

**Running inside Claude** — prefix the command with `!` so the output lands directly in the conversation:

```
! bash scripts/wait-ci.sh
```

Claude reads the result and acts on any failures immediately, without needing polling loops in the session.

## Common Commands

```bash
pnpm lint          # ESLint across all workspaces
pnpm type-check    # tsc --noEmit across all workspaces
pnpm test          # Jest unit tests across all workspaces
pnpm format        # Prettier across all workspaces

pnpm infra:down    # Stop all infrastructure containers
pnpm db:revert     # Revert last migration
```

## Seed Data (local dev)

After running migrations, seed the database with three tenants and realistic test data:

```bash
pnpm db:seed
```

| Tenant | Slug | Admin email | `google_oauth_id` |
|--------|------|-------------|-------------------|
| Ikaro | `ikaro` | admin@ikaro.com.br | `google-sub-admin-ikaro` |
| Lavacar BeloAuto | `lavacar-beloauto` | admin@lavacar.com.br | `google-sub-admin-a` |
| AutoSpa Premium | `autospa-premium` | admin@autospa.com.br | `google-sub-admin-b` |

Staff (Lavacar BeloAuto): `funcionario@lavacar.com.br` — `google-sub-worker-a`

Test customer: `cliente@email.com.br` — `google-sub-customer-a`
(exists in **Lavacar BeloAuto and AutoSpa Premium** as separate rows — multi-tenancy invariant test)

Bookings seeded for Lavacar BeloAuto: 1 PENDING, 1 APPROVED (tomorrow), 1 COMPLETED (last week)
Loyalty: 10 pts earned on the completed booking (balance > 0 on first login)

## Architecture

```
apps/
  backend/   NestJS modular monolith (port 3001)
  bff/       NestJS Backend-for-Frontend (port 3002)
  web/       Next.js 16 — hotsite + dashboard (port 3000)
packages/
  types/     Shared TypeScript DTOs
  config/    Shared ESLint, TypeScript, Prettier configs
```

See `docs/` for full architecture documentation and `plan/` for the implementation roadmap.

## Requirements

- Node.js ≥ 20
- pnpm ≥ 9
- Docker (for local infrastructure)
