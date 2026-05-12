# BeloAuto — AI Agent Workspace

This folder contains context files for AI coding agents working on BeloAuto.
Each file is a self-contained briefing for one specialist agent role.

---

## How It Works

The main Claude Code session is the **orchestrator**. You never invoke specialist
agents directly — you talk to the orchestrator, which reads `.agents/orchestrator.md`,
decomposes your request, and spawns the right agents.

```
YOU
 └─→ Orchestrator (main session)
        ├─→ PM agent         (read-only, no worktree — produces story brief)
        ├─→ Database agent   (worktree — migration prerequisite)
        ├─→ backend-booking  (worktree, parallel)
        ├─→ testing          (worktree, parallel)
        ├─→ api-bff          (worktree, parallel)
        └─→ frontend         (worktree, sequential after BFF)
```

Agents never talk to each other. All communication goes through the orchestrator.

---

## Day-to-Day Flow

### Implementing a Use Case

```
1. You: "Implement UC-003"

2. Orchestrator spawns PM agent (read-only)
   PM agent reads: UC-003 spec + events + API contracts
   Returns: story brief with interfaces, AC, agent assignments
   You approve the brief (or adjust it)

3. If migration needed:
   Orchestrator spawns database agent alone
   Database agent opens draft PR → you merge → proceed

4. Orchestrator spawns parallel agents (in git worktrees):
   backend-<context> + testing + api-bff
   Each agent: writes code → self-checks DoD → opens draft PR

5. Orchestrator cross-checks all PRs (no file conflicts, event payloads match)
   Presents PR links with merge order

6. You review on GitHub → CI runs automatically → you merge

7. If frontend needed: frontend agent spawns after BFF PR is merged
```

### Infrastructure / CI/CD / Observability

```
1. You: "Add Cloud Scheduler resource for the 6 AM cron"

2. Orchestrator spawns infrastructure agent alone (worktree)
   Agent writes Terraform → opens draft PR → you review → merge
```

---

## Mechanical Rules

| Rule | Detail |
|---|---|
| Agents never talk to each other | Orchestrator is the only relay |
| Every code agent uses a worktree | Isolated branch, no filesystem conflicts |
| PRs always open as DRAFT | You promote to ready after DoD cross-check |
| Production is always human-gated | Agents never approve or trigger prod deploys |
| Failed agent = stop + report | No auto-retry, worktree preserved for inspection |
| File boundary is a hard rule | Agent stops and reports if task requires crossing it |

---

## Agent Files

| File | Role |
|---|---|
| `orchestrator.md` | Main session: decomposes, spawns, reviews |
| `pm.md` | Produces story briefs — the shared contract |
| `backend-booking.md` | Booking context (UC-001 to UC-013) |
| `backend-loyalty.md` | Loyalty context (UC-016) |
| `backend-platform.md` | Platform context (UC-024 to UC-029) |
| `backend-customer.md` | Customer context |
| `backend-staff.md` | Staff context |
| `backend-notification.md` | Notification context |
| `database.md` | TypeORM entities + migrations |
| `api-bff.md` | BFF NestJS service |
| `frontend.md` | Next.js web app |
| `testing.md` | All test files |
| `infrastructure.md` | Terraform + GCP resources |
| `observability.md` | Prometheus + Grafana + Loki + OTel |
| `cicd.md` | GitHub Actions workflows |

See `AGENT_REGISTRY.md` for file ownership, dependency graph, and spawn recipe.

---

## Invariants Every Agent Must Obey

These come from `CLAUDE.md §2` and apply to every agent, no exceptions:

1. Every table has `tenant_id UUID NOT NULL` — indexed first in every composite index
2. Every query filters `WHERE tenant_id = :tenantId`
3. Every domain event includes `tenantId`, `eventId` (uuid-v7), `occurredAt`, `correlationId`
4. Composite FKs use `(tenant_id, id)` to block cross-tenant references at DB level
5. No context imports from another context path — only `src/shared/`
6. No hardcoded config values — read from `tenants.settings`
7. TypeScript strict mode — no `any`, no `@ts-ignore`, no `eslint-disable`
8. All customer-facing copy in pt-BR, money as `{ amount: Decimal, currency: 'BRL' }`
