# Ikaro Documentation

> **When to load:** orienting in the docs folder, finding what to read first and where a doc lives; agents start from `CLAUDE.md` and its §10 loading table, not from here.
> **Tags:** agent-process

**Start here:** `CLAUDE.md` (root) is the canonical agent context. Its §10 table names the doc, and often the section, to load for a given task, so this folder is rarely read end to end.

## Where a new doc goes

- A reference doc is a top-level `docs/*.md` file named `UPPER_SNAKE.md`. Numbered files (`01-` to `28-`) are the original reading order; a new doc takes no number. There is no `07-`: the numbering gap is historical.
- Every doc opens with two lines the `doc-orientation` check enforces: `> **When to load:** …` (the task that should make an agent open it, and where the neighbouring rules live) and `> **Tags:** …` (the topic tags `pnpm --filter @ikaro/architecture-check docs-for` routes by).
- A new doc also needs its row in `CLAUDE.md` §10 (or a tag `docs-for` resolves), otherwise nothing loads it.
- Work in progress lives in `docs/discovery/<name>/` until it is promoted into a milestone; plans in `plan/`, tech-debt in `td/`, journeys and prototypes in `journeys/`. Superseded material goes to the top-level `archive/` and is never loaded.

## Reading order

Numbered docs, in their original order:

1. `01-BUSINESS_CONTEXT.md`: problem, personas, workflows, success metrics.
2. `02-DOMAIN_MODEL.md`: bounded contexts, aggregates, entities, value objects.
3. `03-DOMAIN_EVENTS.md`: every domain event and its payload.
4. `04-USE_CASES.md`: all use cases by context and milestone.
5. `05-BOUNDED_CONTEXTS.md`: how contexts interact and stay isolated.
6. `06-TENANT_ISOLATION_STRATEGY.md`: multi-tenancy, business and technical.
7. `08-TESTING_STRATEGY.md`: test layers and mandatory patterns.
8. `09-CI_CD_PIPELINE.md`: trunk-based flow, gates and scans.
9. `10-OBSERVABILITY_STRATEGY.md`: logs, traces and metrics.
10. `11-ARCHITECTURE.md`: system diagram and hexagonal layout.
11. `12-DEPLOYMENT_STRATEGY.md`: deployment model.
12. `13-DATABASE_SCHEMA.md`: PostgreSQL schema per context.
13. `14-API_CONTRACTS.md`: REST contracts mapped to use cases.
14. `15-HOTSITE_DYNAMIC_ARCHITECTURE.md`: server-driven tenant hotsites.
15. `16-DASHBOARD_FRONTEND_ARCHITECTURE.md`: backoffice frontend, roles, gates.
16. `17-GITHUB_WORKFLOWS_GUIDELINES.md`: branching, PRs, commits, workflows.
17. `18-RELEASE_LIFECYCLE_OPERATIONS.md`: local-to-production release guide.
18. `19-INFRASTRUCTURE_TOOLING_MAP.md`: SaaS versus self-hosted tools.
19. `20-COST_OPTIMIZATION_STRATEGY.md`: cost and standards trade-offs.
20. `21-TENANTS_SETTINGS_SCHEMA.md`: every `tenants.settings` key.
21. `22-TECH_STACK_DECISIONS.md`: technology choices and reasons.
22. `23-INFRASTRUCTURE_SETUP.md`: GCP resources, environments, bootstrap.
23. `24-BFF_ARCHITECTURE.md`: BFF structure and the web-to-BFF transport.
24. `25-ERROR_CATALOG.md`: RFC 9457 errors by category.
25. `26-DATA_RETENTION_AND_PRIVACY.md`: retention windows and LGPD.
26. `27-BUSINESS_LOGIC_REFERENCE.md`: cross-use-case algorithms, with diagrams.
27. `28-LOCK_CATALOG.md`: every lock, its order and hazards.

Unnumbered docs, grouped by purpose:

- **Code rules:** `CODE_STANDARDS.md`, `ENGINEERING_RULES_SHARED.md`, `ENGINEERING_RULES_BACKEND.md`, `ENGINEERING_RULES_FRONTEND.md`, `ENGINEERING_RULES_INFRA.md`, `ENGINEERING_RULES_TESTING.md`, `ANTI_PATTERNS.md`, `AGENT_PATTERNS.md`, `VALUE_OBJECTS_REFERENCE.md`, `REPOSITORY_STRUCTURE.md`.
- **Delivery:** `DEFINITION_OF_DONE.md`, `CI_TRAPS.md`, `STORY_SCHEMA.md`, `RUNBOOKS.md`.
- **Agent context upkeep:** `AGENT_CONTEXT_TRAP_SCENARIOS.md` (the eval prompts for `.copilot/context.md`).
