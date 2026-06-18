# TD06 — No CI step verifies a built Docker image actually boots

## Status
- **Type**: Technical Debt / CI Coverage Gap
- **Priority**: Medium-High (a production-breaking bug shipped to `main` undetected; the gap that let it happen is still open)
- **Context**: `.github/workflows/pr-security.yml` (Trivy Image Scan jobs), `apps/backend/Dockerfile`, `apps/bff/Dockerfile`
- **Created**: 2026-06-18
- **Updated**: 2026-06-18

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
      -e DB_HOST=localhost -e DB_PORT=5432 -e DB_USER=ikaro_app -e DB_PASSWORD=ikaro_app -e DB_NAME=ikaro \
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

- [ ] Every service image (backend, bff, web) has a CI step that runs the built image and verifies it stays up for at least a few seconds without exiting
- [ ] The step fails the job (or is explicitly marked advisory, per the open question above) on a non-zero exit / crash
- [ ] Re-run against `apps/bff/Dockerfile` as it exists today to confirm the smoke test would have caught the `express`/`jsonwebtoken`/`ms` bugs before TD05 fixed them (regression-proof the gate itself)

## Open Questions

1. Hard-fail vs. advisory for the initial rollout — resolve at story-discovery time based on how noisy the first few runs are.
