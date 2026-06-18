# Agent Registry — Ikaro

Master reference for all agents: file ownership, dependency graph, spawn recipe.
The orchestrator reads this on every task.

---

## Agent List

| Agent | Worktree | Role |
|---|---|---|
| orchestrator | No (main session) | Decomposes tasks, spawns agents, reviews outputs |
| pm | No (read-only) | Produces story briefs, defines contracts |
| backend-booking | Yes | Booking bounded context — UC-001 to UC-013 |
| backend-loyalty | Yes | Loyalty bounded context — UC-016 |
| backend-platform | Yes | Platform bounded context — UC-024 to UC-029 |
| backend-customer | Yes | Customer bounded context |
| backend-staff | Yes | Staff bounded context |
| backend-notification | Yes | Notification bounded context |
| database | Yes | TypeORM entities + migrations (all contexts) |
| api-bff | Yes | BFF NestJS service |
| frontend | Yes | Next.js web app (hotsite + dashboard) |
| testing | Yes | All spec files across the monorepo |
| infrastructure | Yes | Terraform + GCP resources |
| observability | Yes | Prometheus + Grafana + Loki + OTel Collector |
| cicd | Yes | GitHub Actions workflows |

---

## File Ownership (hard boundaries)

Crossing a boundary = agent stops and reports to orchestrator. No exceptions.

| Agent | May ONLY create or edit |
|---|---|
| backend-booking | `apps/backend/src/contexts/booking/**` |
| backend-loyalty | `apps/backend/src/contexts/loyalty/**` |
| backend-platform | `apps/backend/src/contexts/platform/**` |
| backend-customer | `apps/backend/src/contexts/customer/**` |
| backend-staff | `apps/backend/src/contexts/staff/**` |
| backend-notification | `apps/backend/src/contexts/notification/**` |
| database | `apps/backend/src/contexts/*/infrastructure/migrations/**` |
| | `apps/backend/src/contexts/*/infrastructure/persistence/**` |
| | `apps/backend/src/contexts/*/domain/entities/**` |
| api-bff | `apps/bff/src/**` |
| frontend | `apps/web/src/**` |
| testing | `**/*.spec.ts` `**/*.integration-spec.ts` `**/*.e2e-spec.ts` |
| infrastructure | `infrastructure/terraform/**` |
| observability | `infrastructure/observability/**` |
| cicd | `.github/workflows/**` |

### Shared paths — special rules

| Path | Rule |
|---|---|
| `packages/types/**` | PM agent pre-defines all shared types in the story brief. Code agents import only — never create types here independently. |
| `apps/backend/src/shared/**` | No agent touches this without explicit orchestrator instruction. Changes here require a dedicated task. |
| `docker/**` | Infrastructure agent only. |
| `pnpm-lock.yaml` | No agent modifies this directly. It updates automatically on `pnpm install`. |

---

## Dependency Graph

```
[User request]
      │
      ▼
[PM agent] ──→ story brief ──→ [User approval]
      │
      ▼ (if migration needed)
[Database agent] ──→ PR ──→ [User merges] ──→ proceed
      │
      ▼ (parallel, in worktrees)
[backend-<context>] + [testing] + [api-bff]
      │
      ▼ (sequential — after BFF PR merged)
[frontend]

Independent (no prerequisites, run anytime):
  [infrastructure]  [cicd]  [observability]
```

### Migration dependency order (always this sequence)

```
1. platform        ← tenants table must exist first
2. customer
3. staff
4. booking
5. loyalty
6. notification
```

---

## Spawn Recipe

Orchestrator uses this table to decide which agents to spawn for each task type.

| Task type | Spawn (parallel unless noted) | Hard prerequisite |
|---|---|---|
| New UC — no DB change | backend-`<context>` + testing + api-bff | PM brief approved |
| New UC — needs migration | database first (sequential), then above 3 | Migration merged to main |
| New UC — with frontend | above 3 + frontend (sequential after BFF) | BFF PR merged |
| New bounded context | database + backend-`<context>` + testing | DB migration merged |
| Bug fix — no schema change | backend-`<context>` + testing | PM brief |
| Bug fix — schema change | database first, then backend + testing | Migration merged |
| New Terraform resource | infrastructure alone | None |
| New GitHub workflow | cicd alone | None |
| Observability change | observability alone | None |
| New shared type in packages/types | PM agent defines it first, then relevant agents | PM brief |
| Full feature (UC + DB + API + UI + tests) | Sequential: DB → domain+tests+BFF → frontend | Each layer |

---

## Branch Naming Convention

```
feat/UC-XXX-domain       ← backend-<context> agent
feat/UC-XXX-tests        ← testing agent
feat/UC-XXX-bff          ← api-bff agent
feat/UC-XXX-frontend     ← frontend agent
feat/UC-XXX-migration    ← database agent
fix/XXX-domain           ← bug fix in domain
infra/add-scheduler      ← infrastructure agent
cicd/add-bff-pipeline    ← cicd agent
```

---

## PR Merge Order

For a full UC implementation, always merge in this order:

```
1. feat/UC-XXX-migration   (if exists) — prerequisite for everything
2. feat/UC-XXX-domain      — core business logic
3. feat/UC-XXX-tests       — can merge alongside domain
4. feat/UC-XXX-bff         — depends on domain interfaces being merged
5. feat/UC-XXX-frontend    — depends on BFF route being merged
```
