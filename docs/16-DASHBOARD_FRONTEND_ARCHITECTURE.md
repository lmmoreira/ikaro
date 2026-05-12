# Dashboard Frontend Architecture (Backoffice) - BeloAuto

## Overview

The Dashboard is the authenticated area of BeloAuto where **Customers** manage their bookings/loyalty and **Staff** manage the business operations. It is a single React application that dynamically adapts its layout and capabilities based on the user's **Role** and **Tenant Context**.

---

## 1. Role-Based Rendering (RBR)

The application uses a "Shell" pattern. Once a user authenticates via Google OAuth, the `AppShell` determines which "Mode" to load:

### **Customer Mode (UC-006, UC-007, UC-016, UC-023)**
- **Focus:** Personal history and loyalty.
- **Key Modules:**
  - `BookingTimeline`: Unified view of upcoming and past washes.
  - `LoyaltyCard`: Per-service point progress.
  - `TenantSwitcher`: Interface to jump between different car wash companies.

### **Staff Mode (UC-003, UC-004, UC-005, UC-008, UC-009, UC-010, UC-012, UC-013)**
- **Focus:** Efficiency and task management.
- **Key Modules:**
  - `CommandCenter`: Real-time queue of pending bookings.
  - `ServiceEditor`: CRUD interface for tenant services.
  - `ScheduleCalendar`: Drag-and-drop availability management.

---

## 2. Shared Component Library

To maintain visual consistency and professional quality, we use an internal **Core UI Kit** shared between the Hotsite and the Dashboard:

- **Atomic Components:** Buttons, Inputs, Modals, Toasts (Themed via CSS Variables).
- **Business Modules:** `BookingForm` and `ServiceCard` are used in both the Hotsite (public) and Dashboard (staff editing).
- **Quality Rule:** Every UI component must be accessible (a11y) and responsive.

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

---

## 5. Deployment & Pipeline (TBD Integration)

1. **Monorepo Structure:** Frontend code lives in `packages/web` or `src/frontend`.
2. **Build Process:** Vite-based build, generating a static optimized bundle.
3. **CI Gates:**
   - Pipeline fails if coverage drops below 80%.
   - Pipeline fails if SonarCloud detects "Code Smells" or "Security Hotspots".
4. **Environment Injection:** Runtime configuration for API URLs and OAuth Client IDs.

---

## 6. Local Development Parity

- **Vite Dev Server:** Hot Module Replacement (HMR) for fast iterations.
- **MSW (Mock Service Worker):** Optional for developing UI features before the BFF endpoints are ready.
- **Local Proxy:** Vite proxies `/v1` requests to the local Dockerized BFF.

---

**Status:** Phase 2 - Technical Architecture  
**Validated:** Covers all authenticated use cases (UC-003 to UC-023).
