# ─── Stage 1: Build ──────────────────────────────────────────────────────────
# node:22-alpine
FROM node@sha256:f5d1cc40abc10c2843339a2134d07817cf33c405cb16bfd052b0ed790254c3a3 AS builder

RUN npm install -g pnpm@11.1.1 --ignore-scripts --no-audit --no-fund

WORKDIR /app

COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/observability/package.json packages/observability/
COPY packages/env-validation/package.json packages/env-validation/
COPY packages/nestjs-http/package.json packages/nestjs-http/
COPY packages/validation/package.json packages/validation/
COPY apps/bff/package.json apps/bff/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/ packages/
COPY apps/bff/ apps/bff/

# @ikaro/observability, @ikaro/env-validation, @ikaro/types, @ikaro/nestjs-http, and
# @ikaro/validation ship compiled JS (main/types -> dist/) -- unlike packages/config, they're
# actual runtime dependencies, not type-only, so they must be built before deploy packages them
# up. (@ikaro/types' error-code catalogs are imported as values, e.g. BffErrorCode.GUEST_TOKEN_INVALID,
# not just as types; @ikaro/nestjs-http — CanonicalParseUUIDPipe/CanonicalParseIntPipe, TD23
# Story 11 — depends on @ikaro/types and must build after it. @ikaro/validation — shared
# Address/Phone Zod schemas, TD11 — also depends on @ikaro/types.) Node's native TS type-stripping
# explicitly refuses files under node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING),
# so shipping raw .ts source here would crash `node dist/main.js` at container startup.
RUN pnpm --filter @ikaro/observability build \
    && pnpm --filter @ikaro/env-validation build \
    && pnpm --filter @ikaro/types build \
    && pnpm --filter @ikaro/nestjs-http build \
    && pnpm --filter @ikaro/validation build \
    && pnpm --filter @ikaro/bff build \
    && pnpm --filter @ikaro/bff deploy --prod /standalone --legacy


# ─── Stage 2: Run ────────────────────────────────────────────────────────────
# node:22-alpine
FROM node@sha256:f5d1cc40abc10c2843339a2134d07817cf33c405cb16bfd052b0ed790254c3a3 AS runner

WORKDIR /app

# The pinned node:22-alpine digest predates a fixed Alpine package (libssl3/libcrypto3
# 3.5.8-r0, CVE-2026-14456) that Alpine's 3.24 repo already publishes — no newer base
# image digest exists upstream yet, so patch OS packages explicitly rather than wait.
RUN apk upgrade --no-cache libssl3 libcrypto3 \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=builder /standalone .
COPY --from=builder /app/apps/bff/dist ./dist

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nodeapp

USER nodeapp

EXPOSE 3002

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3002/v1/health/live || exit 1

CMD ["node", "-r", "./dist/tracing.js", "dist/main.js"]
