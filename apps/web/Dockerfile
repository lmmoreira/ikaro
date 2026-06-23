# ─── Stage 1: Build ──────────────────────────────────────────────────────────
# node:22-alpine
FROM node@sha256:b74031e546d7f4faf561d797ac1b76beccac856a042815ca77db4fd047581605 AS builder

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
FROM node@sha256:b74031e546d7f4faf561d797ac1b76beccac856a042815ca77db4fd047581605 AS runner

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
