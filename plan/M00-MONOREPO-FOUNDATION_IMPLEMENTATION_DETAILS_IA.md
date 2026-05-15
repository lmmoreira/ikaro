# M00 — Implementation Details for AI Agents

**Audience:** AI coding agents working on M01 and beyond.  
**Purpose:** Avoid re-learning what M00 already solved. Read this before touching any file in `apps/` or `packages/`.  
**Companion:** Always read `CLAUDE.md` first (root). This file adds what CLAUDE.md cannot: runtime discoveries, version-specific gotchas, and structural decisions made during implementation.

---

## 1. What M00 Built (quick reference)

| Artifact | Location | Notes |
|---|---|---|
| pnpm monorepo | root `package.json`, `pnpm-workspace.yaml` | 5 workspaces: backend, bff, web, types, config |
| Shared ESLint config | `packages/config/eslint-base.js` | ESLint **10** flat config format — NOT `.eslintrc` |
| Shared TS base | `packages/config/tsconfig.base.json` | TypeScript **6** — `ignoreDeprecations: "6.0"` required for `baseUrl` |
| Shared Prettier | `packages/config/prettier.config.js` | Extended in root `prettier.config.js` |
| Backend NestJS | `apps/backend/src/` | port 3001, CommonJS, SWC transpilation |
| BFF NestJS | `apps/bff/src/` | port 3002, global prefix `/v1`, CommonJS, SWC |
| Web Next.js 16 | `apps/web/` | port 3000, App Router, Tailwind v4, shadcn/ui manual install |
| Docker Compose | `docker/docker-compose.yml` | Postgres 15, Pub/Sub emulator, GCS emulator, MailHog |
| TypeORM DataSource | `apps/backend/src/shared/database/data-source.ts` | `synchronize: false`, reads `DATABASE_URL` from `.env` |
| Domain primitives | `apps/backend/src/shared/domain/` | AggregateRoot, DomainEvent (UUID v7 native), ValueObject |
| Value objects | `apps/backend/src/shared/value-objects/` | Money (decimal.js), Address |
| Shared DTO types | `packages/types/src/` | All BFF↔frontend contracts — never define locally |
| AppLogger | `apps/backend/src/shared/observability/app-logger.ts` | JSON to stdout; same file in `apps/bff/src/shared/observability/` |
| Env validation | `apps/bff/src/config/env.validation.ts` | Zod schema, exits process on failure |
| Seed script | `apps/backend/src/shared/database/seed.ts` | Fixed UUIDs for idempotency, raw SQL, creates schema tables |

---

## 2. Critical Version Facts

These differ from common tutorials. Getting them wrong causes silent failures.

| Package | Version | Why it matters |
|---|---|---|
| TypeScript | 6.0.3 | `baseUrl` deprecated — add `"ignoreDeprecations": "6.0"` to every app tsconfig |
| ESLint | 10.3.0 | **Flat config only.** Uses `eslint.config.js` array format. No `.eslintrc.*`. |
| `@typescript-eslint` | 8.x | Aligned with ESLint 10. Use `tsPlugin.configs['recommended'].rules` (not `extends`) |
| uuid | 9.0.1 (pinned) | v10+ is ESM-only; Jest (CJS mode) cannot load it. Stay on v9 OR implement UUID v7 natively (we chose native — see `domain-event.ts`) |
| Next.js | 16.x | Does NOT support `next.config.ts` — use `next.config.mjs`. `params` in page components is a `Promise<{...}>` — always `await params`. `sharp` requires native build: `pnpm.onlyBuiltDependencies: [sharp]` in root `package.json` + lockfile `settings`. |
| Tailwind CSS | 4.x | No `tailwind.config.js`. Config lives in CSS via `@import "tailwindcss"`. Uses `@tailwindcss/postcss` plugin |
| NestJS | 11.x | `@nestjs/throttler` v6. Named throttlers API (not single object) |
| TypeORM | 0.3.29 | CLI command: `typeorm-ts-node-commonjs` (not `typeorm`) for ts-node execution |
| dotenv | 17.x | Required in `data-source.ts` and `env.validation.ts` because TypeORM CLI invokes files directly without NestJS bootstrap |

---

## 3. Module System — This is NestJS/CJS, NOT ESM

**CLAUDE.md §7** mandates `strict: true` TypeScript. The tsconfig base uses `module: NodeNext`, but **both backend and BFF override this to `module: CommonJS`** in their own `tsconfig.json`. This is required because:

1. SWC (`.swcrc`) compiles to `commonjs`
2. NestJS decorators require `emitDecoratorMetadata` which works cleanly in CJS
3. Jest runs in CJS mode

**Consequence for every agent writing backend/BFF code:**
- Import paths must NOT have `.js` extensions (CJS convention)
- Use `require`-style module resolution mentally, even though you write `import`
- If you add an ESM-only dependency, add it to `transformIgnorePatterns` in `jest.config.ts`

---

## 4. Repository Conventions Set in M00

### 4.1 Ports / Symbols
Every DI injection token is a `Symbol`, not a string:
```typescript
export const EVENT_BUS = Symbol('IEventBus');    // apps/backend/src/shared/ports/event-bus.port.ts
export const EMAIL_SENDER = Symbol('IEmailSender'); // apps/backend/src/shared/ports/email-sender.port.ts
```
Future context modules must follow the same pattern.

### 4.2 AppLogger — never use console.*
`no-console: "error"` is enforced by ESLint. Use `AppLogger` everywhere:
```typescript
private readonly logger = new AppLogger(MyService.name);
this.logger.log('message', { tenantId, correlationId });
```
`tenantId` and `correlationId` are optional fields on every log call — include them whenever in a request context. See **CLAUDE.md §8 anti-patterns** (logging without tenant_id blocks merge).

### 4.3 Domain Events
`DomainEvent` base class is in `apps/backend/src/shared/domain/domain-event.ts`. UUID v7 is generated natively (no dependency). Every concrete event must:
1. Extend `DomainEvent<TData>`
2. Declare `readonly eventName`, `readonly eventVersion`, `readonly data`
3. Call `super(tenantId, correlationId)` in constructor

See **CLAUDE.md §4** for the required 7-field envelope.

### 4.4 Money
`Money.from(amount, 'BRL').format()` → `"R$ 1.234,56"`. Always use `Money` value object for prices — never `number`. The `@beloauto/types` `Money` interface (for BFF responses) uses `{ amount: number, currency: 'BRL', formatted: string }`.

### 4.5 Context isolation
Each context has `domain/`, `application/`, `infrastructure/` directories. Cross-context imports are blocked by the ESLint rule `no-restricted-imports` (to be added in M02). For now, enforced by convention: **only import from `src/shared/` across contexts**.

---

## 5. Testing Setup

```
apps/backend/
  jest.config.ts          ← rootDir: 'src', testRegex: '*.spec.ts'
  tsconfig.test.json      ← extends tsconfig.json, adds "types": ["node","jest"]
```

**Key facts:**
- `ts-jest` with `tsconfig: '<rootDir>/../tsconfig.test.json'`
- `transformIgnorePatterns` not needed (uuid v9 is CJS-compatible)
- Test files: `*.spec.ts` (unit), `*.integration-spec.ts` will be added in feature milestones
- Coverage: `jest --coverage` runs via `pnpm test:cov`
- **CLAUDE.md §7** requires ≥80% coverage on changed code (differential, not global)

---

## 6. Environment Variables

### What runs locally without real credentials
All four infra services (Postgres, Pub/Sub emulator, GCS emulator, MailHog) run locally via Docker. No GCP account needed for M01–M14.

### .env file locations
| File | Loaded by | When |
|---|---|---|
| `apps/backend/.env` | `dotenv` in `data-source.ts` and `validateEnv()` | TypeORM CLI + app startup |
| `apps/bff/.env` | `validateEnv()` in `main.ts` | BFF startup |
| `apps/web/.env.local` | Next.js automatically | Web dev server |

### BFF required vars (validation fails without these)
`BACKEND_INTERNAL_URL`, `JWT_SECRET` (≥64 chars), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `CRON_SECRET` (≥32 chars)

### JWT cookie config
`JWT_COOKIE_OPTIONS` is declared in `apps/bff/src/main.ts` and exported for M03-S04 to import. Do not re-declare.

---

## 7. Docker Compose — Known Issue and Fix

The Docker daemon's default bridge subnet pool can be exhausted on machines with many existing networks. The compose file uses an explicit subnet `192.168.240.0/24` to avoid this. If you see `all predefined address pools have been fully subnetted`, run `docker network prune -f` first.

Compose file: `docker/docker-compose.yml`  
Init SQL (creates 6 schemas): `docker/init-db.sql`

---

## 8. Seed Script

`apps/backend/src/shared/database/seed.ts` — uses **fixed UUIDs** so every run is idempotent. The script creates its own tables (`CREATE TABLE IF NOT EXISTS`) — it is self-contained and does NOT depend on TypeORM migrations having been run. This is intentional for local dev convenience.

**Idempotency check:** queries `platform.tenants` for the fixed tenant A UUID before inserting. If found → skip.

Fixed IDs are in the `IDS` constant at the top of the file. Use these when writing tests that reference seed data.

---

## 9. What Is STUBBED — Do Not Implement Until the Right Milestone

| Stub | Location | Implemented in |
|---|---|---|
| `JwtAuthGuard` | `apps/bff/src/shared/guards/` | M03 |
| `TenantGuard` | `apps/bff/src/shared/guards/` | M03 |
| `RolesGuard` | `apps/bff/src/shared/guards/` | M03 |
| `GET /health/ready` DB check | `apps/backend/src/health/` | M07 (DB-connected health) |
| `NoopEventBusAdapter` | `apps/backend/src/shared/infrastructure/` | Replaced in M11 (GCP Pub/Sub) |
| Auth module | `apps/bff/src/auth/` | M03 |
| Signed URL actual GCS | `apps/bff/src/uploads/uploads.controller.ts` | M09 |
| `app.useLogger()` in BFF | Already wired | — |

---

## 10. CLAUDE.md Cross-References

| Topic | CLAUDE.md section |
|---|---|
| Multi-tenancy invariants (tenant_id on every query) | §2 |
| Domain event envelope (7 fields) | §4 |
| Bounded contexts and what each owns | §3 |
| Hexagonal layers per context | §7 |
| Anti-patterns that block merge | §8 |
| Which docs to load for which task | §10 |
| Repository layout (canonical paths) | §11 |
| Open decisions (do not implement yet) | §12 |

---

## 11. Common Commands (for agent scripts)

```bash
pnpm -w run infra:up          # start Docker (Postgres, Pub/Sub, GCS, MailHog)
pnpm -w run db:migrate        # run TypeORM migrations
pnpm -w run db:seed           # seed local database (idempotent)
pnpm -r run type-check        # tsc --noEmit all workspaces
pnpm -r run lint              # ESLint all workspaces
pnpm --filter @beloauto/backend run test       # Jest unit tests
pnpm --filter @beloauto/backend run test:unit  # unit tests only (jest --selectProjects unit)
pnpm --filter @beloauto/backend run test:integration  # integration tests only
pnpm --filter @beloauto/backend run test:cov   # unit tests + lcov coverage report
pnpm ci:fast                  # lint + prettier + type-check + unit tests (~15s)
pnpm ci:local                 # full local CI via Docker — no tokens needed (~5min)
```

---

## 13. VS Code Tooling

`.vscode/extensions.json` and `.vscode/settings.json` are committed and shared. They configure:
- Format on save with Prettier
- ESLint auto-fix on save
- Workspace TypeScript v6 (not VS Code bundled)
- Tailwind IntelliSense with CVA/clsx class regex
- Jest runner pointing at `apps/backend`
- Coverage gutters reading `apps/backend/coverage/lcov.info`
- SonarLint connected mode bound to `lmmoreira_beloauto` (requires user auth once)

These settings are project-scoped — they do not override developer personal VS Code settings outside this workspace.

---

## 14. Story Implementation Workflow (mandatory for every story)

This is the exact sequence every agent MUST follow for each story. CLAUDE.md §15 lists the checks; this section adds the concrete commands.

### Step 1 — Create feature branch (before writing any code)
```bash
git checkout -b feat/M0X-SYY-<short-description>
# e.g. feat/M02-S01-platform-domain
```

### Step 2 — Implement the story
Write all files defined in the story. See CLAUDE.md §0 for permission rules (code files = autonomous once story is approved).

### Step 3 — Verify locally
```bash
pnpm --filter @beloauto/backend run type-check   # zero errors
pnpm --filter @beloauto/backend run lint          # zero warnings
pnpm --filter @beloauto/backend exec jest --testPathPatterns="<context>" --no-coverage
```

### Step 4 — Commit with Conventional Commit
```bash
git add <specific files — never git add -A>
git commit -m "feat(<context>): <short description> (M0X-SYY)"
# Append Co-Authored-By trailer
```

### Step 5 — Push (pre-push hook runs ci:fast automatically)
```bash
git push -u origin feat/M0X-SYY-<short-description>
# ci:fast = lint + prettier + type-check + unit tests (~15s)
```
If ci:fast fails, fix before continuing.

### Step 6 — Run ci:local before opening the PR
```bash
pnpm ci:local   # ~5 min — Docker must be running
# Runs: lint → type-check → unit tests → integration tests →
#        gitleaks (Docker) → docker build ×3 → trivy ×3
```
Fix any failures before opening the PR.

### Step 7 — Open the PR
```bash
gh pr create \
  --title "feat(platform): <description> (M0X-SYY)" \
  --body "$(cat <<'EOF'
## Summary
- <bullet points>

## Story
M0X-SYY — <title>

## Test plan
- [ ] Unit tests pass
- [ ] Type-check clean
- [ ] ci:local green

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" \
  --repo lmmoreira/beloauto
```

### Step 8 — Monitor CI and self-fix
```bash
gh pr checks <PR-number> --repo lmmoreira/beloauto
# If any check fails:
gh run view <run-id> --repo lmmoreira/beloauto --log-failed
# Fix → commit → push → re-check until all green
```

### Step 9 — Merge once all checks are green
```bash
gh pr merge <PR-number> --repo lmmoreira/beloauto --squash --delete-branch
```

### Step 10 — Mark story done (AFTER merge, not before)
In `plan/M0X-<NAME>.md`:
```
### M0X-SYY — title  →  ### M0X-SYY — title ✅ Done
```

### Step 11 — If ALL stories in milestone are now Done: create wrap-up docs
See CLAUDE.md §15 item 16 for the two wrap-up files to create.

---

## 12. Workspace Dependency Graph

```
packages/config  ←  apps/backend (devDep)
                 ←  apps/bff     (devDep)
                 ←  apps/web     (devDep)
                 ←  packages/types (devDep)

packages/types   ←  apps/bff     (dep)
                 ←  apps/web     (dep)
                 (NOT imported by apps/backend — backend has its own domain types)
```

`apps/backend` does NOT depend on `@beloauto/types`. The backend owns its domain model. Types are for BFF↔frontend contracts only.
