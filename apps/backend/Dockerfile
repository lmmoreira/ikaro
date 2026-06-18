# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.1.1 --activate

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

RUN pnpm --filter @ikaro/backend build \
    && pnpm --filter @ikaro/backend deploy --prod /standalone --legacy \
    && rm -rf /standalone/node_modules/.pnpm/multer@2.1.1


# ─── Stage 2: Run ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Temporary mitigation for CVE-2026-45447 (OpenSSL heap UAF): node:22-alpine
# still ships libcrypto3/libssl3 3.5.6-r0; Alpine repos already have 3.5.7-r0.
# Remove once the base image is rebuilt with the patch baked in — see CLAUDE.md §18.
# Remove npm — unused in production runner, eliminates npm's bundled CVEs
RUN apk upgrade --no-cache libcrypto3 libssl3 \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

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
