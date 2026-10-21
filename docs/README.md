# Ikaro Documentation

> **When to load:** orienting in the docs folder, finding what to read first and where a doc lives; agents start from `CLAUDE.md` and its §10 loading table, not from here.
> **Tags:** agent-process

**Start here:** `CLAUDE.md` (root) is the canonical agent context. Its §10 table names the doc, and often the section, to load for a given task, so this folder is rarely read end to end.

## Where a new doc goes

- A reference doc is a top-level `docs/*.md` file named `UPPER_SNAKE.md`, with no numeric prefix. The ordered list under "Reading order" below is the original reading order; a new doc is added to that list or to one of the groups after it, and the `doc-orientation` check fails when the list and the set of `docs/*.md` files differ.
- Every doc opens with two lines the `doc-orientation` check enforces: `> **When to load:** …` (the task that should make an agent open it, and where the neighbouring rules live) and `> **Tags:** …` (the topic tags `pnpm --filter @ikaro/architecture-check docs-for` routes by).
- A new doc also needs its row in `CLAUDE.md` §10 (or a tag `docs-for` resolves), otherwise nothing loads it.
- Work in progress lives in `docs/discovery/<name>/` until it is promoted into a milestone; plans in `plan/`, tech-debt in `td/`, journeys and prototypes in `journeys/`. Superseded material goes to the top-level `archive/` and is never loaded.

## Reading order

The first 27 docs, in their original reading order:

1. `BUSINESS_CONTEXT.md`: problem, personas, workflows, success metrics.
2. `DOMAIN_MODEL.md`: bounded contexts, aggregates, entities, value objects.
3. `DOMAIN_EVENTS.md`: every domain event and its payload.
4. `USE_CASES.md`: all use cases by context and milestone.
5. `BOUNDED_CONTEXTS.md`: how contexts interact and stay isolated.
6. `TENANT_ISOLATION_STRATEGY.md`: multi-tenancy, business and technical.
7. `TESTING_STRATEGY.md`: test layers and mandatory patterns.
8. `CI_CD_PIPELINE.md`: trunk-based flow, gates and scans.
9. `OBSERVABILITY_STRATEGY.md`: logs, traces and metrics.
10. `ARCHITECTURE.md`: system diagram and hexagonal layout.
11. `DEPLOYMENT_STRATEGY.md`: deployment model.
12. `DATABASE_SCHEMA.md`: PostgreSQL schema per context.
13. `API_CONTRACTS.md`: REST contracts mapped to use cases.
14. `HOTSITE_DYNAMIC_ARCHITECTURE.md`: server-driven tenant hotsites.
15. `DASHBOARD_FRONTEND_ARCHITECTURE.md`: backoffice frontend, roles, gates.
16. `GITHUB_WORKFLOWS_GUIDELINES.md`: branching, PRs, commits, workflows.
17. `RELEASE_LIFECYCLE_OPERATIONS.md`: local-to-production release guide.
18. `INFRASTRUCTURE_TOOLING_MAP.md`: SaaS versus self-hosted tools.
19. `COST_OPTIMIZATION_STRATEGY.md`: cost and standards trade-offs.
20. `TENANTS_SETTINGS_SCHEMA.md`: every `tenants.settings` key.
21. `TECH_STACK_DECISIONS.md`: technology choices and reasons.
22. `INFRASTRUCTURE_SETUP.md`: GCP resources, environments, bootstrap.
23. `BFF_ARCHITECTURE.md`: BFF structure and the web-to-BFF transport.
24. `ERROR_CATALOG.md`: RFC 9457 errors by category.
25. `DATA_RETENTION_AND_PRIVACY.md`: retention windows and LGPD.
26. `BUSINESS_LOGIC_REFERENCE.md`: cross-use-case algorithms, with diagrams.
27. `LOCK_CATALOG.md`: every lock, its order and hazards.

Every other doc, grouped by purpose:

- **Code rules:** `CODE_STANDARDS.md`, `ENGINEERING_RULES_SHARED.md`, `ENGINEERING_RULES_BACKEND.md`, `ENGINEERING_RULES_FRONTEND.md`, `ENGINEERING_RULES_INFRA.md`, `ENGINEERING_RULES_TESTING.md`, `ANTI_PATTERNS.md`, `AGENT_PATTERNS.md`, `VALUE_OBJECTS_REFERENCE.md`, `REPOSITORY_STRUCTURE.md`.
- **Delivery:** `DEFINITION_OF_DONE.md`, `CI_TRAPS.md`, `STORY_SCHEMA.md`, `RUNBOOKS.md`.
- **Agent context upkeep:** `AGENT_CONTEXT_TRAP_SCENARIOS.md` (the eval prompts for `.copilot/context.md`).
