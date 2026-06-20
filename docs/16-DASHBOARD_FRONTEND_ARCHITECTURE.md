# Dashboard Frontend Architecture (Backoffice) - Ikaro

## Overview

The Dashboard is the authenticated area of Ikaro where **Customers** manage their bookings/loyalty and **Staff** manage the business operations. It is a single React application that dynamically adapts its layout and capabilities based on the user's **Role** and **Tenant Context**.

---

## 1. Role-Based Rendering (RBR)

> **Two separate shells, not one `AppShell` with a mode switch.** M13 (`plan/M13-DASHBOARD-FRONTEND.md`, stories `S15`/`S16`) builds a **staff/manager dashboard shell** at `/dashboard/**` and a **separate customer "Minha Conta" shell** at `/{slug}/my-account/**`. They live under different route trees, are protected by different middleware checks, and share no top-level shell component. There is no unified `AppShell`/"mode" concept and no `CommandCenter`/`BookingTimeline`/`LoyaltyCard`/`ServiceEditor`/`TenantSwitcher` components — those names predate the M13 plan and were never built.

> **Naming note:** the customer area's pt-BR *concept* "Minha Conta" keeps that name in UI copy and in the prototype folder (`plan/journey/customer/prototypes/minha-conta/` — prototypes are conceptual mockups, kept pt-BR on purpose). The production route/file/component names are English (`my-account`, not `minha-conta`) per the code-standards English-only rule (`CLAUDE.md` §7) — established in `M13-S42`.

### **Staff/Manager Shell — `/dashboard/**` (M13-S15; UC-003, UC-004, UC-005, UC-008, UC-009, UC-010, UC-012, UC-013)**
- **Focus:** Efficiency and task management for STAFF and MANAGER roles.
- **Route protection:** `apps/web/middleware.ts` reads the JWT from the `httpOnly` cookie; redirects to `/dashboard/login` if missing or if role is not `STAFF`/`MANAGER`.
- **Layout:** `apps/web/app/dashboard/layout.tsx` (server component) reads `{ tenantId, tenantSlug, role }` from the JWT via `cookies()`, and renders `<DashboardShell>`. The JWT payload is only `{ sub, tenantId, tenantSlug, role }` (see `JwtIssuerService`) — it does **not** carry `tenantName`/`userName`; S15 must source those from a separate profile/tenant-info fetch, not by destructuring the JWT.
- **Key components (`apps/web/components/dashboard/`):**
  - `DashboardShell.tsx` — `'use client'` shell wrapper: sidebar (desktop, `≥1024px`) + topbar + bottom nav (mobile, `<1024px`); conditionally renders manager-only nav based on `role`.
  - `Sidebar.tsx` — logo block, nav items (Agenda, Horários, Serviços, Fidelidade), and a "Somente Gerente" section (Equipe, Configurações, Hotsite) shown only when `role === 'MANAGER'`.
  - `Topbar.tsx` — back arrow + title on drill-down pages, page title on list pages, avatar + date on desktop.
  - `BottomNav.tsx` — mobile-only tab bar mirroring the sidebar's nav items, role-aware.

### **Customer Shell — `/{slug}/my-account/**` (M13-S16; UC-006, UC-007, UC-016, UC-023)**
- **Focus:** Personal booking history and loyalty for the `CUSTOMER` role.
- **Route protection:** `apps/web/middleware.ts` extends the same file with a check for `/{slug}/my-account/**` — redirects to `/{slug}/login` if the JWT is missing/expired, if the role is not `CUSTOMER` (staff must not reach the customer area), or if the JWT's `tenantSlug` does not match the `[slug]` path segment.
- **Layout:** `apps/web/app/[slug]/my-account/layout.tsx` (server component) reads `{ tenantId, tenantSlug, role }` from the JWT via `cookies()`, and renders `<CustomerShell>`. As with the staff shell, the JWT carries no `userName`/`tenantName` — fetch the customer's name via `GET /api/customers/me` (the proxy route added in `M13-S42`, also used by the hotsite auth bar) and the tenant's display name via the manifest already fetched by the parent `[slug]/layout.tsx`.
- **Key component (`apps/web/components/customer/`):**
  - `CustomerShell.tsx` — `'use client'`: topbar (tenant brand + "+ Novo agendamento" desktop shortcut + avatar dropdown with "Sair"/"Site Ikaro"), a desktop-only horizontal tab nav (Início | Agendamentos | Fidelidade, `≥1024px`), a `main-content` slot, and a mobile-only bottom nav with the same three tabs (`<1024px`).

---

## 2. Shared Component Library — shadcn/ui

We use **shadcn/ui** as the component foundation. Components are copied into the repository (no runtime dependency), built on Radix UI primitives (accessible by default) and styled with Tailwind CSS.

- **Why shadcn/ui:** Components are owned by the project — no vendor lock-in, full customisation control, Radix UI accessibility primitives, Tailwind theming aligns with the CSS variable branding strategy from doc 15.
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
- **Inside an authenticated shell** (dashboard or `/{slug}/my-account`, once it exists): use the Bearer-token `bffClient` (`apps/web/lib/api/bff-client.ts`), configured once via `configureBffClient({ token, tenantSlug, tenantId })` after login. This is what `apps/web/lib/api/dashboard/*.ts` and the `useXxx` hooks use.
- **On the public hotsite, or any client component mounted outside a shell** (e.g. `HotsiteAuthBar`): there is no in-memory token to configure, and the JWT lives in an `httpOnly` cookie that client JS can never read — and even if it could, `SameSite: 'lax'` (`apps/bff/src/auth/cookie-options.ts`) blocks the browser from attaching it to a cross-origin `fetch()`/XHR anyway (only top-level navigations are allowed). The only way to use the session here is a **same-origin Next.js route handler** that reads the cookie server-side and forwards it manually as a `Cookie` header to the BFF (see `apps/web/app/api/customers/me/route.ts`). Client components then call that same-origin route (`fetch('/api/customers/me')`), never the BFF directly.

Don't reach for `bffClient` outside a shell context, and don't try to add `credentials: 'include'` to a direct BFF call from the public hotsite expecting it to carry the cookie — it won't.

---

## 5. Folder Structure (`apps/web/`)

> **Target structure — not yet built.** `M13` (`plan/M13-DASHBOARD-FRONTEND.md`) is in progress: as of this writing, `apps/web/components/dashboard/` is empty and none of the `apps/web/app/dashboard/**` subroutes listed below exist yet (only a `page.tsx` stub at `apps/web/app/dashboard/`). The tree below is what M13's stories build toward, not the current state of the repo — check the M13 plan's story status before assuming any of this exists.

Next.js 16 App Router. The same Next.js app serves both the public hotsite (`/[slug]`) and the authenticated dashboard (`/dashboard`). Middleware separates them at the routing layer.

```
apps/web/
├── app/
│   ├── [slug]/                     ← public hotsite — one route per tenant slug
│   │   ├── layout.tsx              ← fetches manifest, applies CSS branding variables
│   │   ├── page.tsx                ← renders modules array from manifest (HERO, SERVICE_LIST, etc.)
│   │   ├── booking/
│   │   │   └── page.tsx            ← booking form (UC-001, UC-002)
│   │   └── my-account/             ← customer area (requires valid JWT, role CUSTOMER — M13-S16)
│   │       ├── layout.tsx          ← reads JWT via cookies(), renders <CustomerShell>
│   │       ├── page.tsx            ← "Início" — booking history overview
│   │       ├── bookings/
│   │       │   └── page.tsx        ← own bookings list + detail (UC-006, UC-007)
│   │       └── loyalty/
│   │           └── page.tsx        ← loyalty metrics (UC-016)
│   ├── dashboard/                  ← staff/manager area (requires valid JWT, role STAFF|MANAGER — M13-S15)
│   │   ├── layout.tsx              ← reads JWT via cookies(), renders <DashboardShell>
│   │   ├── bookings/
│   │   │   ├── page.tsx            ← booking queue (Staff/Manager — all tenant bookings)
│   │   │   └── [id]/page.tsx       ← booking detail
│   │   ├── services/
│   │   │   └── page.tsx            ← service management (Staff/Manager only — UC-012, UC-013)
│   │   ├── schedule/
│   │   │   └── page.tsx            ← schedule closures calendar (UC-010)
│   │   ├── loyalty/
│   │   │   └── page.tsx            ← loyalty metrics (UC-016)
│   │   ├── team/
│   │   │   └── page.tsx            ← staff management (Manager only — UC-028, UC-029)
│   │   ├── settings/
│   │   │   └── page.tsx            ← tenant settings (Manager only — UC-026)
│   │   └── hotsite/
│   │       └── page.tsx            ← hotsite content management (Manager only — UC-027)
│   ├── auth/
│   │   ├── login/page.tsx          ← "Login with Google" button → /auth/google on BFF
│   │   └── callback/page.tsx       ← handles post-OAuth redirect, stores JWT
│   ├── select-tenant/
│   │   └── page.tsx                ← UC-021 tenant selection screen (customers with multiple tenants)
│   ├── layout.tsx                  ← root layout: TanStack Query provider, RequestContext
│   └── page.tsx                    ← root redirect: → /dashboard if authenticated, else → /auth/login
│
├── components/
│   ├── hotsite/                    ← public hotsite modules
│   │   ├── HeroModule.tsx
│   │   ├── ServiceListModule.tsx
│   │   ├── GalleryModule.tsx
│   │   ├── TestimonialsModule.tsx
│   │   └── BookingCtaModule.tsx
│   ├── dashboard/                  ← staff/manager shell components (M13-S15)
│   │   ├── DashboardShell.tsx      ← sidebar (desktop) + topbar + bottom nav (mobile) wrapper
│   │   ├── Sidebar.tsx             ← nav items + "Somente Gerente" section
│   │   ├── Topbar.tsx              ← page title / back arrow + avatar + date
│   │   └── BottomNav.tsx           ← mobile tab bar, role-aware
│   ├── customer/                   ← customer shell components (M13-S16)
│   │   └── CustomerShell.tsx       ← topbar + desktop tab nav + mobile bottom nav wrapper
│   └── shared/                     ← shadcn/ui base components + shared business components
│       ├── ui/                     ← Button, Input, Dialog, Toast, Card, etc. (shadcn/ui copied in)
│       ├── BookingForm.tsx         ← booking form used in both hotsite and dashboard
│       └── ServiceCard.tsx         ← service display used in both hotsite service list and admin
│
├── lib/
│   ├── api/                        ← typed BFF API client functions (one file per domain)
│   │   ├── bookings.ts             ← getBooking(), createBooking(), updateBookingStatus(), etc.
│   │   ├── services.ts
│   │   ├── loyalty.ts
│   │   ├── schedule.ts
│   │   └── tenant.ts               ← getTenantManifest() (used by hotsite layout)
│   ├── auth/
│   │   ├── session.ts              ← JWT storage (httpOnly cookie via BFF) + getSession()
│   │   └── permissions.ts          ← canAccess(role, action) helper
│   └── hooks/                      ← TanStack Query hooks wrapping lib/api functions
│       ├── useBookings.ts
│       ├── useLoyaltyBalance.ts
│       └── useServices.ts
│
├── middleware.ts                    ← Next.js edge middleware: redirects /dashboard/** → /dashboard/login if no STAFF|MANAGER JWT; redirects /{slug}/my-account/** → /{slug}/login if no CUSTOMER JWT
├── next.config.js                   ← rewrites, env vars, image domains
└── public/
    └── fonts/                       ← self-hosted fonts (no external font requests)
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
