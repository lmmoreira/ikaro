# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY apps/backend/package.json apps/backend/

# --ignore-scripts avoids native builds from other workspace packages (e.g. sharp via next/web)
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/ packages/
COPY apps/backend/ apps/backend/

RUN pnpm --filter @beloauto/backend build

# Create standalone deployment with flat prod node_modules (no symlinks)
RUN pnpm --filter @beloauto/backend deploy --prod /standalone


# ─── Stage 2: Run ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

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
