# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

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
FROM node:22-alpine AS runner

WORKDIR /app

# Temporary mitigation for CVE-2026-45447 (OpenSSL heap UAF): node:22-alpine
# still ships libcrypto3/libssl3 3.5.6-r0; Alpine repos already have 3.5.7-r0.
# Remove once the base image is rebuilt with the patch baked in — see CLAUDE.md §18.
RUN apk upgrade --no-cache libcrypto3 libssl3 \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

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
