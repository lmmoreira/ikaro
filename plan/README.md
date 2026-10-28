# Ikaro — Project Plan

- **Milestones:** M00 – M13, M17 – M24 and M115. M14 – M16 (observability, GCP infrastructure, deploy pipelines) were superseded by M17 and removed; they stay recoverable from git history.
- **Stories:** counted in each milestone file
- **Two phases:** Local Development (no cloud cost) → Cloud Deployment
- **Development model:** All stories are designed to be executed by AI agents under human review.

---

## Phase Overview

### Phase 1 — Local Development (M00 – M13, M18 – M24, M115)
All work runs on the developer's machine via Docker Compose. Zero GCP cost.  
The local environment replicates production exactly:  
PostgreSQL 17 · GCP Pub/Sub Emulator · GCS Emulator · MailHog (email preview).

### Phase 2 — Cloud Deployment (M17)
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
| [M04](M04-STAFF-MANAGEMENT.md) | Staff Management | Local | 6 | M03 |
| [M05](M05-SERVICE-CATALOG.md) | Service Catalog | Local | 5 | M02, M03 |
| [M06](M06-CALENDAR-SCHEDULE.md) | Calendar & Schedule Availability | Local | 8 | M05 |
| [M07](M07-BOOKING-CREATION.md) | Booking Creation | Local | 7 | M06, M03 |
| [M08](M08-BOOKING-APPROVAL.md) | Booking Approval Workflow | Local | 6 | M07 |
| [M09](M09-CANCELLATION-RESCHEDULING.md) | Cancellation & Rescheduling | Local | 4 | M08 |
| [M10](M10-COMPLETION-LOYALTY.md) | Booking Completion + Loyalty | Local | 9 | M09 |
| [M11](M11-NOTIFICATIONS-CRON.md) | Notifications & Cron Jobs | Local | 8 | M10, M04 |
| [M12](M12-HOTSITE-FRONTEND.md) | Hotsite Public Frontend | Local | 12 | M02, M05-S05, M06-S04, M07-S04, M115-S01 |
| [M13](M13-DASHBOARD-FRONTEND.md) | Dashboard Frontend | Local | 44 | M02, M03, M04, M05, M08, M09, M10, M12, M115 |
| [M17](M17-CLOUD-DEPLOY.md) | Cloud Deploy: GCP Infrastructure, CI/CD, Hardening & Observability | **Cloud** | 56 | M13 |
| [M18](M18-BOOKING-IMPROVEMENTS.md) | Booking Improvements | Local | 11 | M07, M12 |
| [M19](M19-HOTSITE-CHATBOT.md) | Hotsite Chatbot | Local | 14 | M12, M13 |
| [M20](M20-LEAD-FORM-MODULE.md) | Lead Form Hotsite Module | Local | 16 | M12, M13, M19 |
| [M21](M21-MULTIVERTICAL-FOUNDATION.md) | Multi-Vertical Scheduling: Foundation | Local | 6 | — |
| [M22](M22-MULTIVERTICAL-SERVICE-AVAILABILITY.md) | Multi-Vertical Scheduling: Service Extensions & Availability Engine | Local | 6 | M21 |
| [M23](M23-MULTIVERTICAL-APPOINTMENT-BOOKING.md) | Multi-Vertical Scheduling: Appointment Booking & Extensions | Local | 51 | M21, M22 |
| [M24](M24-MULTIVERTICAL-CLASSES-SESSIONS.md) | Multi-Vertical Scheduling: Classes & Sessions | Local | 22 | M21, M22, M23 |
| [M115](M115-PRODUCTION-READINESS.md) | Production Readiness | Local | 4 | M10, M03, M00 |

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
 └─► M17 (Cloud Deploy)          ← after M13; includes infra, CI/CD and observability
 └─► M21 (Multi-Vertical Foundation) ◄─ independent of the sequence above
           └─► M22 ─► M23 ─► M24
```

---

## Agent Types Reference

Each story in the milestone files tags the agent type required. Quick reference:

| Agent Tag | Capabilities |
|-----------|-------------|
| `backend-ts` | NestJS, TypeORM, domain layer, use cases, event handlers, migrations |
| `bff-ts` | NestJS BFF, OAuth, JWT, guards, interceptors, HTTP proxy to backend |
| `frontend-ts` | Next.js 16, React 19, shadcn/ui, TanStack Query, Tailwind |
| `web-ts` | Same scope as `frontend-ts` (both target `apps/web`; see `docs/STORY_SCHEMA.md`) |
| `devops` | GitHub Actions YAML, Docker Compose, Terraform, GCP CLI |
| `fullstack-ts` | Spans backend + BFF + frontend for a single vertical slice |
| `test-ts` | Jest, Testcontainers, Playwright, tenant-isolation patterns (legacy tag — not in `docs/STORY_SCHEMA.md`'s Agent set; new stories use the layer's tag) |

---

## Key Documents for Agents

Before starting any story, agents must read `CLAUDE.md` (root).  
Additional docs are listed per story. Quick map:

| Task type | Docs to load |
|-----------|-------------|
| Domain / aggregate | `docs/DOMAIN_MODEL.md` (relevant section) |
| Use case implementation | `docs/USE_CASES.md` (that UC) |
| Events | `docs/DOMAIN_EVENTS.md` |
| Database migration | `docs/DATABASE_SCHEMA.md` |
| BFF / API | `docs/API_CONTRACTS.md` + `docs/BFF_ARCHITECTURE.md` |
| Multi-tenancy | `docs/TENANT_ISOLATION_STRATEGY.md` |
| Testing patterns | `docs/TESTING_STRATEGY.md` |
| CI/CD | `docs/CI_CD_PIPELINE.md` + `docs/GITHUB_WORKFLOWS_GUIDELINES.md` |
| GCP Infrastructure | `docs/INFRASTRUCTURE_SETUP.md` + `docs/DEPLOYMENT_STRATEGY.md` |
| Observability | `docs/OBSERVABILITY_STRATEGY.md` |
| Hotsite frontend | `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` |
| Dashboard frontend | `docs/DASHBOARD_FRONTEND_ARCHITECTURE.md` |
| Tenant settings schema | `docs/TENANTS_SETTINGS_SCHEMA.md` |
| Error handling | `docs/ERROR_CATALOG.md` |

---

## Non-Negotiable Rules (applies to every story)

1. Every DB query filters `WHERE tenant_id = :tenantId` — no exceptions.
2. Every domain event includes `tenantId`, `eventId`, `occurredAt`, `correlationId`.
3. No `any`, no `@ts-ignore`, no `eslint-disable`.
4. No hardcoded config values — read from `tenants.settings`.
5. All customer-facing text in pt-BR. Money displayed as `R$ 1.234,56`.
6. Functions ≤ 40 lines (`.ts`) / ≤ 200 lines (`.tsx`), files ≤ 250 lines.
7. Migrations run separately — never `synchronize: true` in TypeORM.
8. Coverage ≥ 80% on changed code (differential, not global).
9. Every use case has: ≥1 unit test + ≥1 integration test + ≥1 tenant-isolation test.
10. No `.skip()`, `.only()`, `setTimeout` in tests.
