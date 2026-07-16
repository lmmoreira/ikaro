# ─── Stage 1: Build ──────────────────────────────────────────────────────────
# node:22-alpine
FROM node@sha256:0473e7dc433a1310f436edee02aa79737ec78a4b345433ab0963d4a256f9ad85 AS builder

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

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
FROM node@sha256:0473e7dc433a1310f436edee02aa79737ec78a4b345433ab0963d4a256f9ad85 AS runner

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Copy prod node_modules + config files from pnpm deploy
COPY --from=builder /standalone .

# Copy Next.js build output (.next/ is gitignored so pnpm deploy excludes it)
COPY --from=builder /app/apps/web/.next ./.next

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nodeapp

USER nodeapp

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node_modules/.bin/next", "start"]
