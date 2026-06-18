# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

WORKDIR /app

COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/observability/package.json packages/observability/
COPY apps/bff/package.json apps/bff/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/ packages/
COPY apps/bff/ apps/bff/

# @ikaro/observability ships compiled JS (main/types -> dist/) -- unlike packages/types
# and packages/config, it's an actual runtime dependency, not type-only, so it must be
# built before deploy packages it up. Node's native TS type-stripping explicitly refuses
# files under node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), so shipping raw
# .ts source here would crash `node dist/main.js` at container startup.
RUN pnpm --filter @ikaro/observability build \
    && pnpm --filter @ikaro/bff build \
    && pnpm --filter @ikaro/bff deploy --prod /standalone --legacy \
    && rm -rf /standalone/node_modules/.pnpm/multer@2.1.1


# ─── Stage 2: Run ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=builder /standalone .
COPY --from=builder /app/apps/bff/dist ./dist

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nodeapp

USER nodeapp

EXPOSE 3002

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3002/v1/health/live || exit 1

CMD ["node", "dist/main.js"]
