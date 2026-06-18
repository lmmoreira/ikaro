# M01 — Implementation Details for AI Agents

**Audience:** AI coding agents working on M02 and beyond.  
**Purpose:** Avoid re-learning what M01 already solved. Read when touching CI workflows, Dockerfiles, or local dev scripts.  
**Companion:** Always read `CLAUDE.md` first. Then load `plan/M00-MONOREPO-FOUNDATION_IMPLEMENTATION_DETAILS_IA.md` for workspace/version facts.

---

## 1. What M01 Built (quick reference)

| Artifact | Location | Notes |
|---|---|---|
| Quality gates workflow | `.github/workflows/pr-quality.yml` | lint, format, type-check, SonarCloud |
| Test workflow | `.github/workflows/pr-tests.yml` | unit tests + integration tests (Testcontainers) |
| Security workflow | `.github/workflows/pr-security.yml` | Gitleaks, Snyk SCA, Trivy, Checkov |
| Backend Dockerfile | `apps/backend/Dockerfile` | multi-stage builder/runner, port 3001 |
| BFF Dockerfile | `apps/bff/Dockerfile` | multi-stage builder/runner, port 3002 |
| Web Dockerfile | `apps/web/Dockerfile` | multi-stage Next.js build, port 3000 |
| Docker ignore | `.dockerignore` | excludes node_modules, .env*, dist, .next, docs, plan |
| Gitleaks config | `.gitleaks.toml` | allowlists test fixtures and .env.example patterns |
| SonarCloud config | `sonar-project.properties` | differential coverage ≥80% on changed code |
| Local CI script | `scripts/ci-local.sh` | full pipeline without tokens (Snyk/Sonar skipped) |
| Pre-push hook | `.githooks/pre-push` | runs `pnpm ci:fast` before every push |

---

## 2. Workflow Job Map

```
pr-quality.yml
  ├── lint          (pnpm lint — ESLint zero warnings)
  ├── format        (pnpm prettier --check . )
  ├── type-check    (pnpm type-check — tsc --noEmit all workspaces)
  └── sonarcloud    (fetch-depth: 0 required — SonarSource/sonarcloud-github-action@master)

pr-tests.yml
  ├── backend-unit          (pnpm --filter @ikaro/backend test:cov → uploads lcov.info artifact)
  └── backend-integration   (pnpm --filter @ikaro/backend test:integration + TESTCONTAINERS_REUSE_ENABLE=true)

pr-security.yml
  ├── gitleaks      (gitleaks/gitleaks-action@v2 — fetch-depth: 0 required)
  ├── snyk-sca      (snyk/actions/node@master — --severity-threshold=high --all-projects)
  ├── trivy-scan    (matrix: backend/bff/web — fail-fast: false — aquasecurity/trivy-action@master)
  └── checkov       (bridgecrewio/checkov-action@master — conditional on Terraform file changes)
```

---

## 3. Dockerfile Pattern (all three apps follow this)

### Builder stage
```dockerfile
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY apps/<app>/package.json apps/<app>/
RUN pnpm install --frozen-lockfile --ignore-scripts   # ← see gotcha #1
COPY packages/ packages/
COPY apps/<app>/ apps/<app>/
RUN pnpm --filter @ikaro/<app> build
RUN pnpm --filter @ikaro/<app> deploy --prod /standalone  # ← see gotcha #2
```

### Runner stage
```dockerfile
FROM node:20-alpine AS runner
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx  # ← gotcha #3
COPY --from=builder /standalone .
COPY --from=builder /app/apps/<app>/dist ./dist   # ← gotcha #4 (or .next for web)
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs nodeapp
USER nodeapp
EXPOSE <port>
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:<port>/... || exit 1  # ← gotcha #5
```

---

## 4. Dockerfile Gotchas

**#1 — `--ignore-scripts` in builder**  
`sharp` (a Next.js dependency) tries to compile a native binary. In the backend/BFF builder stages `sharp` is not needed but pnpm's install traverses all workspace `package.json` files. Without `--ignore-scripts`, the builder fails because native build tools may be missing. Always use `--ignore-scripts` in all three Dockerfiles.

**#2 — `pnpm deploy --prod /standalone`**  
Creates a flat, production-only `node_modules` at `/standalone` with no workspace symlinks. This is how the runner stage gets a self-contained install. Do NOT copy `node_modules` directly — symlinks break across stages and include devDependencies.

**#3 — Remove npm from runner**  
Alpine ships with npm bundled. npm itself has CVEs that Trivy reports against the image. Removing it eliminates those findings without affecting runtime behavior (the app uses `node` directly, not `npm`).

**#4 — Explicitly copy `dist/` and `.next/`**  
Both are in `.gitignore`. `pnpm deploy` copies the package source from git-tracked files only, so build output is excluded. The `COPY --from=builder` step after `pnpm deploy` is not optional.

**#5 — `wget` not `curl` for health checks**  
Alpine does not include `curl`. Use `wget -qO-` for HTTP health checks. Backend is `/health/live`, BFF is `/v1/health/live`, web is `/`.

---

## 5. Checkov Conditional Execution

Checkov must only run when `infrastructure/terraform/**` files change. Native GitHub `paths:` filtering at the workflow level would skip the entire job (which is fine), but the story required the job to always appear in the PR check list and be skipped at the step level. Solution: `dorny/paths-filter@v3` inside the job.

```yaml
- name: Detect Terraform changes
  id: filter
  uses: dorny/paths-filter@v3
  with:
    filters: |
      terraform:
        - 'infrastructure/terraform/**'

- name: Checkov — Terraform
  if: steps.filter.outputs.terraform == 'true'
  uses: bridgecrewio/checkov-action@master
  ...

- name: Upload SARIF
  if: steps.filter.outputs.terraform == 'true' && always()
  uses: github/codeql-action/upload-sarif@v3
  ...
```

The SARIF upload uses `&& always()` so it runs even when Checkov fails — GitHub Security tab needs the file to display findings.

---

## 6. SonarCloud — Key Config Facts

**`sonar-project.properties` values:**
- `sonar.projectKey=lmmoreira_ikaro`
- `sonar.organization=lmmoreira`
- `sonar.javascript.lcov.reportPaths=apps/backend/coverage/lcov.info`
- `sonar.newCode.referenceBranch=main` ← differential coverage on changed code only

**Coverage flow:** `test:cov` (pr-quality.yml) → `apps/backend/coverage/lcov.info` → SonarCloud reads via `sonar-project.properties`. The same lcov file is also uploaded as artifact in `pr-tests.yml`.

**`fetch-depth: 0` is required** for SonarCloud PR analysis. Without it, SonarCloud cannot compute the diff against `main`.

---

## 7. Trivy Scan Details

Uses a `matrix` strategy so all three images are scanned independently:

```yaml
matrix:
  include:
    - service: backend
      dockerfile: apps/backend/Dockerfile
    - service: bff
      dockerfile: apps/bff/Dockerfile
    - service: web
      dockerfile: apps/web/Dockerfile
```

`fail-fast: false` — all three scans run even if one fails. `ignore-unfixed: true` — CVEs with no available fix are not reported (reduces noise from Alpine base image findings).

Build command from repo root: `docker build -f ${{ matrix.dockerfile }} -t ikaro-${{ matrix.service }}:scan .`

---

## 8. Gitleaks Allowlist (`.gitleaks.toml`)

Patterns allowlisted as of M01:
- Paths: `.env.example`, `pnpm-lock.yaml`
- Regexes: seed script fake Google OAuth IDs (`google-sub-(admin|worker|customer)-[a-z]`), placeholder strings in `.env.example` (`change-me-to-a-random`, `your-google-client`)

When adding new test fixtures with fake credentials, add a regex to the `[allowlist]` block rather than suppressing Gitleaks globally.

---

## 9. Local CI vs Full CI

| Check | `pnpm ci:fast` | `pnpm ci:local` | GitHub Actions |
|---|---|---|---|
| ESLint | ✅ | ✅ | ✅ |
| Prettier | ✅ | ✅ | ✅ |
| TypeScript | ✅ | ✅ | ✅ |
| Unit tests | ✅ | ✅ | ✅ |
| Integration tests | ❌ | ✅ | ✅ |
| Gitleaks | ❌ | ✅ (Docker) | ✅ |
| Docker builds | ❌ | ✅ | ✅ |
| Trivy | ❌ | ✅ (Docker) | ✅ |
| Snyk SCA | ❌ | ❌ (needs token) | ✅ |
| SonarCloud | ❌ | ❌ (needs token) | ✅ |
| Checkov | ❌ | ❌ | ✅ (when TF changed) |

`ci:fast` runs in ~15s (no containers). `ci:local` takes ~5min (Docker builds + Trivy).

---

## 10. GitHub Secrets Required

| Secret | Used by | Notes |
|---|---|---|
| `SNYK_TOKEN` | `pr-security.yml` (snyk-sca job) | From snyk.io account |
| `SONAR_TOKEN` | `pr-quality.yml` (sonarcloud job) | From sonarcloud.io account |
| `GITHUB_TOKEN` | All workflows | Auto-provided by Actions — no setup needed |

`SONAR_ORGANIZATION` is in `sonar-project.properties` (not a secret).

---

## 11. Pre-push Hook

File: `.githooks/pre-push`  
Runs: `pnpm ci:fast`  
Activation (one-time per developer): `git config core.hooksPath .githooks`

The hook is not activated automatically — developers must run the git config command once. Check CLAUDE.md §15 item 12 for the reminder.

---

## 13. SonarCloud Rules Encountered in Practice

**Constructor parameter count (S107):** SonarCloud enforces a maximum of **7 constructor parameters**. Exceeding this triggers a code smell that sets the Quality Gate to RED. Fix: group related parameters into a single object parameter.

```typescript
// ❌ 8 params — SonarCloud S107 violation
constructor(tenantId, correlationId, staffId, email, firstName, lastName, role, invitedBy)

// ✅ 3 params — params object groups the event-specific fields
export interface StaffInvitedParams { staffId, email, firstName, lastName, role, invitedBy }
constructor(tenantId: string, correlationId: string, params: StaffInvitedParams)
```

This pattern is also better design: the params object is named, self-documenting, and easier to extend.

**Other common rules to watch:**
- Functions > 10 lines with high cognitive complexity → SonarCloud "Cognitive Complexity" smell
- Duplicated code blocks across files → SonarCloud "Duplication" metric affects Quality Gate
- `TODO` / `FIXME` comments in committed code → tracked as tech debt

Check the SonarCloud PR decoration (appears as a check in the PR, not just a comment) for the full list on each PR.

**⚠️ Custom "Fail on any new issue" CI step — MINOR issues also block merge:**
`pr-quality.yml` has a step after the SonarCloud scan that calls the SonarCloud API and exits 1 if _any_ open issue exists on the PR — regardless of severity. The Quality Gate (coverage ≥ 80%, 0 security hotspots) is a separate check. Both must be green. Zero new issues of any severity is required.

**S2699 — Every `it()` must have at least one Jest `expect()`:**
Supertest's `.expect(401)` or `.expect(200)` does NOT count as a Jest assertion. Every test block must contain at least one `expect(...)` from Jest. If the HTTP status code is all you care about, add `expect(response.status).toBe(...)` on the returned `body`.

```typescript
// ❌ S2699 — no Jest expect
it('returns 401 for wrong key', async () => {
  await request(app.getHttpServer()).post('/internal/tenants').expect(401);
});

// ✅ correct
it('returns 401 for wrong key', async () => {
  const { body } = await request(app.getHttpServer()).post('/internal/tenants').expect(401);
  expect(body.status).toBe(401);
});
```

**S1874 — Zod v4 deprecated string validators:**
The overloads `z.string().email(msg)`, `.url()`, `.regex(pattern, msg)` that accept a `string | { message }` param are deprecated in Zod v4. Use `z.string().refine()` instead:

```typescript
// ❌ S1874 — deprecated overload
z.string().email('must be a valid email')

// ✅ correct
z.string().refine(
  (val) => val.includes('@') && val.includes('.'),
  { message: 'must be a valid email' }
)
```

Use `ZodType` instead of `ZodSchema` (also deprecated): `import { ZodType } from 'zod'`.

**S5852 — ReDoS security hotspot for regex validation:**
Regex-based validation in DTOs can trigger an S5852 Security Hotspot (MEDIUM), which fails the Quality Gate. Use non-regex alternatives for common validators:

```typescript
// Email — index-based (no regex)
const isValidEmail = (val: string): boolean => {
  const atIdx = val.indexOf('@');
  if (atIdx <= 0) return false;
  const domain = val.slice(atIdx + 1);
  const dotIdx = domain.lastIndexOf('.');
  return domain.length > 0 && dotIdx > 0 && dotIdx < domain.length - 1;
};

// URL — URL constructor
const isValidUrl = (val: string): boolean => {
  try { new URL(val); return true; } catch { return false; }
};

// IANA timezone — Intl API
const isValidTimezone = (tz: string): boolean => {
  try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; } catch { return false; }
};
```

**S3696 — `throw err as Error` is flagged:**
TypeScript cast `throw err as Error` when `err: unknown` triggers S3696. Use an `instanceof` guard:

```typescript
// ❌ S3696
throw err as Error;

// ✅ correct
if (err instanceof Error) throw err;
throw new Error(`Unexpected error: ${String(err)}`);
```

---

## 14. Branch Protection — `main` Is Now Fully Gated

Branch protection was enabled on `main` after M02-S01. All 12 CI checks are required status checks:

```
ESLint, Prettier, TypeScript, Backend Unit Tests, Backend Integration Tests,
SonarCloud Code Analysis, Gitleaks Secret Scan, Snyk SCA,
Trivy Image Scan (backend), Trivy Image Scan (bff), Trivy Image Scan (web),
Checkov IaC Scan
```

**Consequence for agents:** `gh pr merge` will fail if any check has not passed. The merge button is disabled at the GitHub level — not just a convention. Always verify with `gh pr checks <N> --repo lmmoreira/ikaro` before attempting to merge.

**`enforce_admins: false`** — the repo owner can bypass protection in emergencies. Agents must not rely on this.

---

## 12. CLAUDE.md Cross-References

| Topic | CLAUDE.md section |
|---|---|
| CI gates that block merge | §7 (Engineering Rules) |
| Definition of Done checklist | §7 |
| Self-check before push / PR | §15 |
| ci:fast and ci:local commands | §15 items 12–13 |
