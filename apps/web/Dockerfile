# ─── Stage 1: Build ──────────────────────────────────────────────────────────
# node:22-alpine
FROM node@sha256:76789712cd1ae89a1225eac9077010d68987a423588042dac30446f502f1858c AS builder

RUN npm install -g pnpm@11.1.1 --ignore-scripts --no-audit --no-fund

WORKDIR /app

COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/ packages/
COPY apps/web/ apps/web/

RUN pnpm --filter @ikaro/web build \
    && pnpm --filter @ikaro/web deploy --prod /standalone --legacy


# ─── Stage 2: Run ────────────────────────────────────────────────────────────
# node:22-alpine
FROM node@sha256:76789712cd1ae89a1225eac9077010d68987a423588042dac30446f502f1858c AS runner

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nodeapp

# --chown so nodeapp can write .next/cache/* at runtime (ISR/fetch-cache) —
# without it these are root-owned (default COPY owner) and every prerender
# cache write fails with EACCES once the process drops to nodeapp below.

# Copy prod node_modules + config files from pnpm deploy
COPY --from=builder --chown=nodeapp:nodejs /standalone .

# Copy Next.js build output (.next/ is gitignored so pnpm deploy excludes it)
COPY --from=builder --chown=nodeapp:nodejs /app/apps/web/.next ./.next

USER nodeapp

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node_modules/.bin/next", "start"]
