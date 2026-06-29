# ─── Stage 1: Build ──────────────────────────────────────────────────────────
# node:22-alpine
FROM node@sha256:b74031e546d7f4faf561d797ac1b76beccac856a042815ca77db4fd047581605 AS builder

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/i18n/package.json packages/i18n/
COPY packages/observability/package.json packages/observability/
COPY packages/env-validation/package.json packages/env-validation/
COPY apps/backend/package.json apps/backend/

# --ignore-scripts avoids native builds from other workspace packages (e.g. sharp via next/web)
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/ packages/
COPY apps/backend/ apps/backend/

# @ikaro/i18n, @ikaro/observability, and @ikaro/env-validation ship compiled JS
# (main/types -> dist/) — unlike packages/types and packages/config, they are actual
# runtime dependencies, not type-only, so they must be built before deploy packages them
# up. Node's native TS type-stripping explicitly refuses files under node_modules
# (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), so shipping raw .ts source here would
# crash `node dist/main.js` at container startup. The root postinstall handles this in
# dev/CI; here we build explicitly because pnpm install uses --ignore-scripts.
RUN pnpm --filter @ikaro/i18n build \
    && pnpm --filter @ikaro/observability build \
    && pnpm --filter @ikaro/env-validation build \
    && pnpm --filter @ikaro/backend build \
    && pnpm --filter @ikaro/backend deploy --prod /standalone --legacy


# ─── Stage 2: Run ────────────────────────────────────────────────────────────
# node:22-alpine
FROM node@sha256:b74031e546d7f4faf561d797ac1b76beccac856a042815ca77db4fd047581605 AS runner

WORKDIR /app

# Remove npm — unused in production runner, eliminates npm's bundled CVEs
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Copy prod node_modules + package.json from pnpm deploy
COPY --from=builder /standalone .

# Copy compiled output (dist/ is gitignored so pnpm deploy excludes it)
COPY --from=builder /app/apps/backend/dist ./dist

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nodeapp

USER nodeapp

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3001/health/live || exit 1

CMD ["node", "dist/main.js"]
