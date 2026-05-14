# BeloAuto

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
| PostgreSQL | localhost:5432 | Database (`beloauto` / `beloauto`) |

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

After running migrations, seed the database with two tenants and realistic test data:

```bash
pnpm db:seed
```

| Tenant | Slug | Admin email | `google_oauth_id` |
|--------|------|-------------|-------------------|
| Lavacar BeloAuto | `lavacar-beloauto` | admin@lavacar.com.br | `google-sub-admin-a` |
| AutoSpa Premium | `autospa-premium` | admin@autospa.com.br | `google-sub-admin-b` |

Staff (Tenant A): `funcionario@lavacar.com.br` — `google-sub-worker-a`

Test customer: `cliente@email.com.br` — `google-sub-customer-a`
(exists in **both tenants** as separate rows — multi-tenancy invariant test)

Bookings seeded for Tenant A: 1 PENDING, 1 APPROVED (tomorrow), 1 COMPLETED (last week)
Loyalty: 10 pts earned on the completed booking (balance > 0 on first login)

## Architecture

```
apps/
  backend/   NestJS modular monolith (port 3001)
  bff/       NestJS Backend-for-Frontend (port 3002)
  web/       Next.js 14 — hotsite + dashboard (port 3000)
packages/
  types/     Shared TypeScript DTOs
  config/    Shared ESLint, TypeScript, Prettier configs
```

See `docs/` for full architecture documentation and `plan/` for the implementation roadmap.

## Requirements

- Node.js ≥ 20
- pnpm ≥ 9
- Docker (for local infrastructure)
