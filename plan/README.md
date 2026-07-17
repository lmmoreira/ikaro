# Ikaro — Project Plan

**Total milestones:** 17 (M00 – M16)  
**Total stories:** ~105  
**Two phases:** Local Development (no cloud cost) → Cloud Deployment  
**Development model:** All stories are designed to be executed by AI agents under human review.

---

## Phase Overview

### Phase 1 — Local Development (M00 – M14)
All work runs on the developer's machine via Docker Compose. Zero GCP cost.  
The local environment replicates production exactly:  
PostgreSQL 17 · GCP Pub/Sub Emulator · GCS Emulator · MailHog (email preview).

### Phase 2 — Cloud Deployment (M15 – M16)
GCP infrastructure is provisioned, CI/CD deploy pipelines are activated, and the system goes live.  
**Cloud charges begin here.**

---

## Milestone Index

| ID | Title | Phase | Stories | Depends On |
|----|-------|-------|---------|------------|
| [M00](M00-MONOREPO-FOUNDATION.md) | Monorepo Foundation | Local | 13 | — |
| [M01](M01-CI-QUALITY-GATES.md) | CI Quality Gates | Local | 7 | M00 |
| [M02](M02-PLATFORM-CONTEXT.md) | Platform Context — Tenant Core | Local | 6 | M00 |
| [M03](M03-AUTHENTICATION.md) | Authentication | Local | 8 | M02 |
| [M04](M04-STAFF-MANAGEMENT.md) | Staff Management | Local | 5 | M03 |
| [M05](M05-SERVICE-CATALOG.md) | Service Catalog | Local | 5 | M02 |
| [M06](M06-CALENDAR-SCHEDULE.md) | Calendar & Schedule Availability | Local | 5 | M05 |
| [M07](M07-BOOKING-CREATION.md) | Booking Creation | Local | 7 | M06, M03 |
| [M08](M08-BOOKING-APPROVAL.md) | Booking Approval Workflow | Local | 6 | M07 |
| [M09](M09-CANCELLATION-RESCHEDULING.md) | Cancellation & Rescheduling | Local | 4 | M08 |
| [M10](M10-COMPLETION-LOYALTY.md) | Booking Completion + Loyalty | Local | 6 | M09 |
| [M11](M11-NOTIFICATIONS-CRON.md) | Notifications & Cron Jobs | Local | 8 | M10, M04 |
| [M12](M12-HOTSITE-FRONTEND.md) | Hotsite Public Frontend | Local | 11 | M07, M02 |
| [M13](M13-DASHBOARD-FRONTEND.md) | Dashboard Frontend | Local | 13 | M10, M11, M12 |
| [M14](M14-OBSERVABILITY.md) | Observability | Local | 8 | M00 |
| [M15](M15-GCP-INFRASTRUCTURE.md) | GCP Infrastructure (Terraform) | **Cloud** | 11 | M14 |
| [M16](M16-CICD-DEPLOY-HARDENING.md) | CI/CD Deploy Pipelines + Production Hardening | **Cloud** | 10 | M15 |

---

## Dependency Graph

```
M00 (Foundation)
 ├─► M01 (CI Gates)              ← quality guard, runs early, no cloud cost
 ├─► M02 (Platform/Tenant)
 │     ├─► M03 (Auth)
 │     │     ├─► M04 (Staff)
 │     │     └─► M07 (Booking Creation) ◄─ M06 (Calendar) ◄─ M05 (Services) ◄─ M02
 │     │               ├─► M08 (Approval)
 │     │               │     └─► M09 (Cancel/Reschedule)
 │     │               │               └─► M10 (Completion + Loyalty)
 │     │               │                         └─► M11 (Notifications + Cron) ◄─ M04
 │     │               │                                    └─► M13 (Dashboard)
 │     └─► M12 (Hotsite) ◄─────── M07 (for booking form)
 │               └─► M13 (Dashboard) ◄─ M10, M11, M12
 └─► M14 (Observability)         ← parallel track, can start after M00
           └─► M15 (GCP Infra)
                     └─► M16 (Deploy + Hardening)
```

---

## Agent Types Reference

Each story in the milestone files tags the agent type required. Quick reference:

| Agent Tag | Capabilities |
|-----------|-------------|
| `backend-ts` | NestJS, TypeORM, domain layer, use cases, event handlers, migrations |
| `bff-ts` | NestJS BFF, OAuth, JWT, guards, interceptors, HTTP proxy to backend |
| `frontend-ts` | Next.js 14, React 18, shadcn/ui, TanStack Query, Tailwind |
| `devops` | GitHub Actions YAML, Docker Compose, Terraform, GCP CLI |
| `fullstack-ts` | Spans backend + BFF + frontend for a single vertical slice |
| `test-ts` | Jest, Testcontainers, Playwright, tenant-isolation patterns |

---

## Key Documents for Agents

Before starting any story, agents must read `CLAUDE.md` (root).  
Additional docs are listed per story. Quick map:

| Task type | Docs to load |
|-----------|-------------|
| Domain / aggregate | `docs/02-DOMAIN_MODEL.md` (relevant section) |
| Use case implementation | `docs/04-USE_CASES.md` (that UC) |
| Events | `docs/03-DOMAIN_EVENTS.md` |
| Database migration | `docs/13-DATABASE_SCHEMA.md` |
| BFF / API | `docs/14-API_CONTRACTS.md` + `docs/24-BFF_ARCHITECTURE.md` |
| Multi-tenancy | `docs/06-TENANT_ISOLATION_STRATEGY.md` |
| Testing patterns | `docs/08-TESTING_STRATEGY.md` |
| CI/CD | `docs/09-CI_CD_PIPELINE.md` + `docs/17-GITHUB_WORKFLOWS_GUIDELINES.md` |
| GCP Infrastructure | `docs/23-INFRASTRUCTURE_SETUP.md` + `docs/12-DEPLOYMENT_STRATEGY.md` |
| Observability | `docs/10-OBSERVABILITY_STRATEGY.md` |
| Hotsite frontend | `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` |
| Dashboard frontend | `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` |
| Tenant settings schema | `docs/21-TENANTS_SETTINGS_SCHEMA.md` |
| Error handling | `docs/25-ERROR_CATALOG.md` |

---

## Non-Negotiable Rules (applies to every story)

1. Every DB query filters `WHERE tenant_id = :tenantId` — no exceptions.
2. Every domain event includes `tenantId`, `eventId`, `occurredAt`, `correlationId`.
3. No `any`, no `@ts-ignore`, no `eslint-disable`.
4. No hardcoded config values — read from `tenants.settings`.
5. All customer-facing text in pt-BR. Money displayed as `R$ 1.234,56`.
6. Functions ≤ 20 lines, classes ≤ 200 lines.
7. Migrations run separately — never `synchronize: true` in TypeORM.
8. Coverage ≥ 80% on changed code (differential, not global).
9. Every use case has: ≥1 unit test + ≥1 integration test + ≥1 tenant-isolation test.
10. No `.skip()`, `.only()`, `setTimeout` in tests.
