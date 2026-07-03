# Dashboard Frontend Architecture (Backoffice) - Ikaro

## Overview

The Dashboard is the authenticated area of Ikaro where **Customers** manage their bookings/loyalty and **Staff** manage the business operations. It is a single React application that dynamically adapts its layout and capabilities based on the user's **Role** and **Tenant Context**.

---

## 1. Role-Based Rendering (RBR)

> **Two separate shells, not one `AppShell` with a mode switch.** M13 (`plan/M13-DASHBOARD-FRONTEND.md`, stories `S15`/`S16`) builds a **staff/manager dashboard shell** at `/dashboard/**` and a **separate customer "Minha Conta" shell** at `/{slug}/my-account/**`. They live under different route trees, are protected by different middleware checks, and share no top-level shell component. There is no unified `AppShell`/"mode" concept and no `CommandCenter`/`BookingTimeline`/`LoyaltyCard`/`ServiceEditor`/`TenantSwitcher` components — those names predate the M13 plan and were never built.

> **Naming note:** the customer area's pt-BR *concept* "Minha Conta" keeps that name in UI copy and in the prototype folder (`plan/journey/customer/prototypes/minha-conta/` — prototypes are conceptual mockups, kept pt-BR on purpose). The production route/file/component names are English (`my-account`, not `minha-conta`) per the code-standards English-only rule (`CLAUDE.md` §7) — established in `M13-S42`.

### **Staff/Manager Shell — `/dashboard/**` (UC-003, UC-004, UC-005, UC-008, UC-009, UC-010, UC-012, UC-013)**
- **Focus:** Efficiency and task management for STAFF and MANAGER roles.
- **Route protection:** `apps/web/middleware.ts` reads the JWT from the `httpOnly` cookie; redirects to `/dashboard/login` if missing or if role is not `STAFF`/`MANAGER`.
- **Layout:** `apps/web/app/dashboard/layout.tsx` (server component) reads `{ tenantId, tenantSlug, role }` from the JWT via `cookies()`, and renders `<DashboardShell>`. The JWT payload is only `{ sub, tenantId, tenantSlug, role }` (see `JwtIssuerService`) — it does **not** carry `tenantName`/`userName`; S15 must source those from a separate profile/tenant-info fetch, not by destructuring the JWT.
- **Key components (`apps/web/shells/dashboard/components/`):**
  - `DashboardShell.tsx` — `'use client'` shell wrapper: sidebar (desktop, `≥1024px`) + topbar + bottom nav (mobile, `<1024px`); conditionally renders manager-only nav based on `role`.
  - `Sidebar.tsx` — logo block, nav items (Agenda, Horários, Serviços, Fidelidade), and a "Somente Gerente" section (Equipe, Configurações, Hotsite) shown only when `role === 'MANAGER'`.
  - `Topbar.tsx` — back arrow + title on drill-down pages, page title on list pages, avatar + date on desktop.
  - `BottomNav.tsx` — mobile-only tab bar mirroring the sidebar's nav items, role-aware.

### **Customer Shell — `/{slug}/my-account/**` (UC-006, UC-007, UC-016, UC-023)**
- **Focus:** Personal booking history and loyalty for the `CUSTOMER` role.
- **Route protection:** `apps/web/middleware.ts` extends the same file with a check for `/{slug}/my-account/**` — redirects to `/{slug}/login` if the JWT is missing/expired, if the role is not `CUSTOMER` (staff must not reach the customer area), or if the JWT's `tenantSlug` does not match the `[slug]` path segment.
- **Layout:** `apps/web/app/[slug]/my-account/layout.tsx` (server component) reads `{ tenantId, tenantSlug, role }` from the JWT via `cookies()`, and renders `<CustomerShell>`. As with the staff shell, the JWT carries no `userName`/`tenantName` — fetch the customer's name via `GET /api/customers/me` (the proxy route added in `M13-S42`, also used by the hotsite auth bar) and the tenant's display name via the manifest already fetched by the parent `[slug]/layout.tsx`.
- **Key component (`apps/web/features/customer/components/`):**
  - `CustomerShell.tsx` — `'use client'`: topbar (tenant brand + "+ Novo agendamento" desktop shortcut + avatar dropdown with "Sair"/"Site Ikaro"), a desktop-only horizontal tab nav (Início | Agendamentos | Fidelidade, `≥1024px`), a `main-content` slot, and a mobile-only bottom nav with the same three tabs (`<1024px`).

---

## 2. Colour System — Fixed SaaS Palette (NOT the hotsite `--ba-*` tokens)

The dashboard and `my-account` shells belong to the **Ikaro SaaS product**, not to any specific tenant's brand. Their colours are **fixed** and must not change per tenant.

| What to use | What NOT to use |
|---|---|
| Tailwind utility classes (`bg-white`, `border-gray-100`, `text-gray-900`, …) | `--ba-primary`, `--ba-secondary`, `--ba-text`, `--ba-background`, or any other `--ba-*` CSS variable |
| shadcn/ui design tokens (`--primary`, `--secondary`, `--muted`, `--border`, …) | `var(--ba-*)` in any inline `style` prop or CSS class |

**Why:** `--ba-*` variables are injected by `applyBranding()` inside `app/[slug]/layout.tsx` and only exist within the `/[slug]/` route subtree (the public hotsite). In the dashboard and `my-account` routes those variables are never set — referencing them renders the browser default (often transparent or black), silently breaking the component with no build or type error.

The full rule: **hotsite tree = `--ba-*` tokens; dashboard & account shells = Tailwind + shadcn fixed palette.** See `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §2 for the `--ba-*` variable definitions and `docs/ANTI_PATTERNS.md` for the concrete failure mode.

---

## 3. Shared Component Library — shadcn/ui

We use **shadcn/ui** as the component foundation. Components are copied into the repository (no runtime dependency), built on Radix UI primitives (accessible by default) and styled with Tailwind CSS.

- **Why shadcn/ui:** Components are owned by the project — no vendor lock-in, full customisation control, Radix UI accessibility primitives, Tailwind theming via its own fixed CSS variables (`--primary`, `--secondary`, etc.) — completely separate from the hotsite `--ba-*` branding token system in doc 15.
- **Atomic Components:** Buttons, Inputs, Dialogs, Toasts, Dropdowns, Cards — themed via CSS variables (`--primary`, `--secondary`, etc.).
- **Business Modules:** `BookingForm` and `ServiceCard` are shared between the Hotsite (public) and Dashboard (staff editing).
- **Quality Rule:** Every UI component must be accessible (WCAG 2.1 AA) and responsive.

---

## 3. Engineering Standards & Quality Gates

Since we are following **Trunk-Based Development**, the frontend must have a "Bulletproof" CI pipeline:

### **Static Analysis**
- **TypeScript:** Strict mode enabled. No `any`.
- **Linting:** ESLint with `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`.
- **Formatting:** Prettier (mandatory pre-commit hook).

### **The Testing Pyramid (Frontend)**
1. **Unit Tests (Vitest):** Logic testing for hooks, utilities, and state reducers.
2. **Component Tests (React Testing Library):** Testing user interactions (e.g., "Clicking 'Cancel' opens confirmation modal").
3. **E2E Tests (Playwright):** Critical paths only (e.g., "Staff logs in and approves a booking").
4. **Visual Regression (Optional):** Ensure branding changes don't break layouts.

---

## 4. Frontend-BFF Communication

- **State Management:** **TanStack Query (React Query)**.
  - Handles caching, background syncing, and loading states.
  - **Multi-Tenancy:** The `tenant_id` is automatically injected into every query key to prevent cross-tenant data leaks in the local cache.
- **API Client:** Specialized Axios wrapper that automatically attaches the `Authorization: Bearer <JWT>` and `X-Tenant-Slug` headers.

**Two auth-transport patterns exist — pick by context, not by habit (clarified in M13-S42):**
- **Inside an authenticated shell** (dashboard or `/{slug}/my-account`): use the Bearer-token `bffClient` (`apps/web/shared/lib/api/bff-client.ts`) through feature-owned API helpers and hooks. The old `configureBffClient({ token, tenantSlug, tenantId })` singleton is gone; `tenantId` now comes from `useTenant()` in client hooks.
- **On the public hotsite, or any client component mounted outside a shell** (e.g. `HotsiteAuthBar`): there is no in-memory token to configure, and the JWT lives in an `httpOnly` cookie that client JS can never read — and even if it could, `SameSite: 'lax'` (`apps/bff/src/features/auth/cookie-options.ts`) blocks the browser from attaching it to a cross-origin `fetch()`/XHR anyway (only top-level navigations are allowed). The only way to use the session here is a **same-origin Next.js route handler** that reads the cookie server-side and forwards it manually as a `Cookie` header to the BFF (see `apps/web/app/api/customers/me/route.ts`). Client components then call that same-origin route (`fetch('/api/customers/me')`), never the BFF directly.

Don't reach for `bffClient` outside a shell context, and don't try to add `credentials: 'include'` to a direct BFF call from the public hotsite expecting it to carry the cookie — it won't.
Likewise, do not fan out across multiple BFF calls inside a page or route file and merge the responses in `apps/web`; if the screen needs composite data, add or extend the BFF contract so the web layer consumes one response and stays composition-only.

---

## 5. Folder Structure (`apps/web/`)

The tree below reflects the current folder structure. Route files stay thin; feature code lives under `features/`, shell composition lives under `shells/`, and shared helpers live under `shared/`. Route files and pages may fetch and render, but they should not orchestrate multi-call data joins or response merging.

```
apps/web/
├── app/
│   ├── [slug]/
│   ├── dashboard/
│   ├── auth/
│   ├── select-staff-tenant/
│   ├── switch-tenant/
│   └── api/
├── features/
│   ├── auth/
│   ├── booking/
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── model/
│   │   └── utils/
│   ├── customer/
│   │   ├── api/
│   │   ├── components/
│   │   └── hooks/
│   ├── loyalty/
│   ├── platform/
│   │   └── hotsite/
│   │       ├── api/
│   │       ├── model/
│   │       └── utils/
│   ├── staff/
│   │   ├── api/
│   │   ├── components/
│   │   └── hooks/
│   └── uploads/
├── shells/
│   ├── dashboard/
│   │   ├── components/
│   │   ├── model/
│   │   └── utils/
│   └── hotsite/
│       ├── components/
│       └── utils/
├── shared/
│   ├── components/
│   │   └── ui/
│   ├── lib/
│   │   ├── api/
│   │   ├── formatting/
│   │   └── i18n/
│   └── utils/
├── providers/
├── i18n/
│   └── request.ts
├── middleware.ts
├── next.config.js
└── public/
    └── fonts/
```

---

## 6. Deployment

**Runtime:** GCP Cloud Run — Next.js runs as an SSR Node.js server, not a static export. SSR is required for dynamic `[slug]` routing and server-side session handling.

**Container:** Multi-stage Docker build in `docker/web/Dockerfile`.

```dockerfile
# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ packages/
RUN corepack enable && pnpm install --frozen-lockfile
COPY apps/web/ apps/web/
RUN pnpm --filter web build    # next build

# Stage 2: runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
```

**Environment variables at runtime:**

| Variable | Value (prod) | Notes |
|---|---|---|
| `NEXT_PUBLIC_BFF_URL` | `https://bff.<ikaro-domain>` | Injected at build time via Cloud Run `--set-env-vars` |
| `NODE_ENV` | `production` | |
| `PORT` | `3000` | Cloud Run sets this automatically |

**`next.config.js`** — rewrites local `/api` prefix to BFF (local dev only):
```javascript
/** @type {import('next').NextConfig} */
module.exports = {
  env: {
    NEXT_PUBLIC_BFF_URL: process.env.NEXT_PUBLIC_BFF_URL ?? 'http://localhost:3002',
  },
  images: {
    domains: ['storage.googleapis.com'],  // for tenant photo URLs
  },
};
```

**CI/CD:** Full pipeline in `docs/09-CI_CD_PIPELINE.md` (`ci-frontend.yml` + `deploy-frontend.yml`). Summary:
- PR gate: ESLint, `tsc --noEmit`, Vitest, Playwright, Gitleaks
- Merge to `main`: build → GAR, deploy Cloud Run staging (auto), production (1 reviewer required)
- Smoke test: `curl` against Cloud Run URL after deploy

---

## 7. Local Development

```bash
# Start infrastructure (PostgreSQL, Pub/Sub emulator, MailHog)
pnpm infra:up

# Start all services in watch mode (backend :3001, BFF :3002, web :3000)
pnpm dev
```

**Next.js dev server** (`next dev`) provides:
- Hot Module Replacement (HMR) out of the box
- Server-side rendering on every request (no build step needed locally)

**API calls in local dev:** The Next.js app calls `NEXT_PUBLIC_BFF_URL` which defaults to `http://localhost:3002`. No proxy configuration needed — direct HTTP call to the local BFF process.

**MSW (Mock Service Worker):** Optional. Use to develop UI before BFF endpoints exist:
```typescript
// app/layout.tsx (dev only)
if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_MSW === 'true') {
  const { worker } = await import('../mocks/browser');
  await worker.start();
}
```

**Hotsite local testing:** Visit `http://localhost:3000/<tenant-slug>` (e.g. `http://localhost:3000/autowash-pro`). The `[slug]` route fetches the manifest from the local BFF which calls the local backend.

---

**Status:** Phase 2 - Technical Architecture  
**Validated:** Covers all authenticated use cases (UC-003 to UC-023).
