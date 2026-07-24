# TD06 — No CI step verifies a built Docker image actually boots

## Status
- **Type**: Technical Debt / CI Coverage Gap
- **Priority**: Medium-High (a production-breaking bug shipped to `main` undetected; the gap that let it happen is still open)
- **Context**: `.github/workflows/pr-security.yml` (Trivy Image Scan jobs), `apps/backend/Dockerfile`, `apps/bff/Dockerfile`
- **Created**: 2026-06-18
- **Updated**: 2026-06-18
- **Resolved**: 2026-06-18 — added a "Boot smoke test" step after each service's Trivy scan in `pr-security.yml` (same job, reuses the already-built `ikaro-<service>:scan` image). Hard-fails the job (`exit 1`) if the container exits within 5s of `docker run`. No live Postgres/Pub/Sub needed: the require()-resolution crash this TD targets happens synchronously before any network call, so the container stays `running` at the 5s checkpoint regardless of DB/Pub/Sub reachability. Regression-proofed by checking out the pre-fix commit (`02b3f04`, before `4279f96`) in an isolated worktree and confirming the new step's exact logic fails it with `Error: Cannot find module 'express'` / `STATUS=exited`.
  - First CI run caught a real bug the smoke test was designed to catch: backend crashed with `Configuration key "PUBSUB_PROJECT_ID" does not exist` (`GcpPubSubEventBusAdapter`'s constructor calls `ConfigService.getOrThrow`, which reads raw `process.env` and never sees Zod's `.default('ikaro-local')` — that default only lives on the object `validateEnv()` returns). Fixed at the root by matching bff's existing pattern instead of inventing a new one: `app.module.ts` now wires `ConfigModule.forRoot({ validate: validateEnv })`, and `validateEnv()` was changed to `throw` instead of calling `process.exit(1)` directly (`@nestjs/config`'s own `assignVariablesToProcess()` then copies every defaulted key into `process.env` automatically). An earlier version of this fix added a bespoke `applyEnvDefaults()` helper instead — replaced once `validate: validateEnv` was confirmed safe (see below). Fixes all 7 `ConfigService.getOrThrow()` call sites in backend, not just `PUBSUB_PROJECT_ID`. `main.ts` no longer calls `validateEnv()` itself; it reads `PORT` via `ConfigService`, matching bff.
  - Confirmed empirically (not just reasoned about) that `throw` is the right choice over `process.exit()` inside `validate`: `NestFactory.create()` wraps bootstrap in NestJS's own exceptions-zone and calls `process.exit(1)` on **any** fatal bootstrap exception regardless of whether the underlying code throws or exits directly, so real production boot behavior is identical either way. `Test.createTestingModule(...).compile()` has no such wrapper — a thrown error surfaces as a normal catchable rejected promise, while a direct `process.exit()` call would kill the Jest worker outright with no way to catch it. Verified both paths directly: a throwaway spec calling `NestFactory.create()` with a throwing `validate` reproduced "Jest worker encountered child process exceptions, exceeding retry limit"; the same `validate` through `Test.createTestingModule().compile()` produced a clean caught rejection. Nothing in backend's test suite imports the real `AppModule` today, so this was latent either way — `throw` closes the gap for any future test that does.
  - My first attempt at this PR also removed `pr-tests.yml`'s `bff-component` `env:` block, believing it was dead code shadowed by `component-test.helpers.ts`. That was wrong — `ConfigModule.forRoot({ validate: validateEnv })` runs synchronously at `app.module.ts` import time, before `createTestApp()` ever executes, so the workflow's literal `env:` block is the only thing actually supplying those values in CI. My local test had "confirmed" the removal safe only because my own gitignored `apps/bff/.env` was masking the gap — re-verified by moving it aside, which reproduced the exact CI failure. The block was restored.
  - Found, but **not fixed** in this PR (tracked as a follow-up): `.dockerignore`'s `.env*` pattern does not actually exclude nested `apps/*/.env` paths from the Docker build context — confirmed `apps/backend/.env` (a real, gitignored, secret-bearing local file) ends up baked into both the builder stage and the final runtime image whenever built from a machine where that file exists on disk, even with `--no-cache`. This is what masked the `PUBSUB_PROJECT_ID` bug in local testing — CI's fresh checkout never has the file, so it correctly failed there.

---

## Problem

No CI job ever runs `docker run` on a built backend/bff/web image. `Trivy Image Scan` (`pr-security.yml`) builds each image and scans its filesystem for known-vulnerable packages — it never starts the container or makes a request against it. Every other gate (lint, type-check, unit/integration tests, SonarCloud, Snyk, Gitleaks, Checkov) operates on source code or the dependency graph, not the actual built artifact running as a process.

This gap is not theoretical — it already let a real bug through. While resolving TD05 (PR #7), `apps/bff`'s production image was discovered to crash immediately on `node dist/main.js` with `Cannot find module 'express'`. Confirmed via an isolated `git worktree` + frozen-lockfile build that this was **pre-existing on `main`**, unrelated to that PR — `express` (used directly in `apps/bff/src/main.ts` for body-parser middleware) was only available transitively via `@nestjs/platform-express`, never as a direct `dependencies` entry, so `pnpm deploy --prod`'s strict linking never made it resolvable to bff's own code. Two more instances of the same root cause (`jsonwebtoken` misclassified under `devDependencies`, `ms` not declared at all) were found by sweeping all production imports — see `ANTI_PATTERNS.md`.

Every one of these went unnoticed through `docker build` succeeding, Trivy passing, and every unit/integration/component test passing — because none of those exercise the actual compiled artifact as a running process resolving its own `require()` graph from the deployed `node_modules`.

## Why this matters

Without a boot check, the **same class of bug can reappear silently** for any future dependency change, any future `packages/*` addition (see TD05's `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` discovery — same "looks fine until production" shape), or any Dockerfile edit. The current detection method is "someone happens to manually `docker run` it," which is exactly what caught this instance and is not repeatable or guaranteed.

## Proposed fix (not yet scoped as a story)

Add a smoke-test step after each service's Trivy scan (or as its own job) in `pr-security.yml`:

```yaml
- name: Boot smoke test — ${{ matrix.service }}
  run: |
    docker run --name smoke-${{ matrix.service }} -d \
      -e JWT_SECRET="$(openssl rand -hex 32)" \
      -e DB_HOST=localhost -e DB_PORT=5432 -e DB_USER=ikaro -e DB_PASSWORD=ikaro -e DB_NAME=ikaro \
      ikaro-${{ matrix.service }}:scan
    sleep 5
    docker logs smoke-${{ matrix.service }}
    STATUS=$(docker inspect smoke-${{ matrix.service }} --format='{{.State.Status}}')
    if [ "$STATUS" != "running" ]; then
      echo "❌ Container exited instead of staying up — see logs above"
      exit 1
    fi
    echo "✅ Container booted and is still running"
    docker rm -f smoke-${{ matrix.service }}
```

Open questions to resolve at story-discovery time:
- backend needs a real (or stubbed) Postgres reachable at boot — does the job need a `services:` Postgres container, or is "still running after N seconds without exiting" sufficient even if DB connection retries indefinitely? (It was sufficient to catch the bug class this TD documents — DB-dependent failures are a separate, already-covered concern via integration tests.)
- web's Dockerfile/runtime needs the same treatment for parity, even though it wasn't implicated this time.
- Should this gate the PR (`exit-code: 1`-style hard fail) or start as advisory/non-blocking for a trial period given it's new and could have its own false-positive surface (env var requirements, startup timing)?

## Acceptance criteria (when this is picked up)

- [x] Every service image (backend, bff, web) has a CI step that runs the built image and verifies it stays up for at least a few seconds without exiting
- [x] The step fails the job (or is explicitly marked advisory, per the open question above) on a non-zero exit / crash — hard-fail, decided up front (see Open Questions)
- [x] Re-run against `apps/bff/Dockerfile` as it exists today to confirm the smoke test would have caught the `express`/`jsonwebtoken`/`ms` bugs before TD05 fixed them (regression-proof the gate itself) — confirmed against the pre-fix commit in an isolated worktree

## Open Questions

1. ~~Hard-fail vs. advisory for the initial rollout~~ — resolved: hard-fail from the start. The false-positive surface is low because the gate doesn't depend on any live infra (DB/Pub/Sub reachability) — only on the exact required env vars per service, which are now fully enumerated from each app's `env.validation.ts`.
