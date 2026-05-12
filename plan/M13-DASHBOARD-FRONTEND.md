# M13 — Dashboard Frontend

**Phase:** Local Development  
**Goal:** Staff have a functional command center to manage bookings, services, schedule, and staff. Customers have a portal to view their booking history, loyalty balance, and switch tenants. All pages connect to the local BFF and are protected by the JWT auth flow from M03.  
**Depends on:** M10 (all backend features complete), M11 (notifications), M12 (auth + hotsite foundation)  
**Blocks:** M16 (E2E tests cover dashboard flows)

---

## Stories

---

### M13-S01 — TanStack Query setup + typed BFF client

**Agent:** `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` § state management + API client

**Description:**  
Set up TanStack Query (React Query) as the global data-fetching layer and create typed client functions for every BFF endpoint. This is the foundation all dashboard pages build on — pages import typed hooks, not raw `fetch` calls.

**What to create:**
- `apps/web/lib/api/bff-client.ts` — Axios instance with base URL (`NEXT_PUBLIC_BFF_URL`), JWT cookie interceptor (attach `Authorization` header), `X-Tenant-Slug` interceptor, error handling (RFC 9457 Problem Detail → typed `ApiError`)
- `apps/web/lib/api/` — typed function per endpoint group: `bookings.ts`, `services.ts`, `schedule.ts`, `loyalty.ts`, `staff.ts`, `tenants.ts`, `auth.ts`
- `apps/web/lib/hooks/` — TanStack Query wrappers:
  - `useBookings(filters)`, `useBooking(id)`, `useCreateBooking()`, `useUpdateBookingStatus()`
  - `useServices()`, `useCreateService()`, `useUpdateService()`
  - `useAvailability(date, serviceIds)`, `useScheduleClosures()`
  - `useLoyaltyBalance()`, `useLoyaltyEntries()`
  - `useStaff()`, `useInviteStaff()`, `useDeactivateStaff()`
  - `useTenantSettings()`, `useUpdateTenantSettings()`
  - `useHotsiteConfig()`, `useUpdateHotsiteConfig()`
- `apps/web/providers/query-provider.tsx` — wraps the app in `QueryClientProvider`

**Acceptance criteria:**
- [ ] Every BFF endpoint has a corresponding typed function in `lib/api/`
- [ ] All hooks use `queryKey` arrays that include `tenantId` (from JWT) to prevent cross-tenant cache pollution
- [ ] A `401` response from BFF → hook throws `AuthError` → middleware redirects to `/auth/login`
- [ ] A `403` response → hook throws `ForbiddenError` → page shows "Acesso negado" in pt-BR
- [ ] `QueryClient` is configured with `staleTime: 30000` (30s) and `retry: 1`
- [ ] TypeScript: all hook return types are fully typed (no `any`)

**Dependencies:** M00-S05, M03-S06

---

### M13-S02 — Auth pages: login, OAuth callback, tenant selection

**Agent:** `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` § auth pages, `docs/04-USE_CASES.md` § UC-021, UC-022, UC-023

**Description:**  
Implement the three authentication pages in Next.js. These are the user-facing entry points for the auth flows from M03.

**Pages to create:**

`app/auth/login/page.tsx`:
- "Entrar com Google" button — links to `GET /v1/auth/google`
- BeloAuto branding (logo + tagline in pt-BR)
- No email/password fields — Google OAuth only

`app/auth/callback/page.tsx`:
- Handles OAuth redirect back from BFF
- Reads JWT from cookie or query param
- If tenant selection needed → redirects to `/select-tenant`
- If direct login → redirects to `/dashboard`

`app/select-tenant/page.tsx` (UC-021 case B):
- Shown when customer has 2+ tenants
- Lists tenants with tenant name + active loyalty points
- "Entrar" button per tenant → calls `POST /v1/auth/token` → stores JWT → redirects to `/dashboard`

**Middleware update (`middleware.ts`):**
- Protect `/dashboard/*` — redirect to `/auth/login` if no valid JWT cookie
- Let `/auth/*`, `/[slug]/*`, `/_next/*` pass through unauthenticated

**Acceptance criteria:**
- [ ] Unauthenticated request to `/dashboard` redirects to `/auth/login`
- [ ] "Entrar com Google" button navigates to BFF OAuth URL
- [ ] Tenant selection page shows all tenants with active point counts
- [ ] After tenant selection, JWT is stored as an HTTP-only cookie (not localStorage)
- [ ] Selecting a tenant on `/select-tenant` page redirects to `/dashboard`
- [ ] JWT expiry detected on page load → redirect to `/auth/login` (not infinite redirect loop)

**Dependencies:** M13-S01, M03-S06, M03-S07

---

### M13-S03 — Dashboard shell + role-based layout

**Agent:** `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` § role-based rendering

**Description:**  
Implement the dashboard shell: the outer layout with navigation sidebar, header with user info, and role-based menu items. CUSTOMER sees their portal; STAFF/MANAGER see the admin console.

**What to create:**
- `app/dashboard/layout.tsx` — authenticated layout; reads JWT from cookie; passes decoded JWT to `DashboardShell`
- `components/dashboard/DashboardShell.tsx` — sidebar + header; menu items differ by role:
  - CUSTOMER: Agendamentos, Fidelidade, Trocar Unidade
  - STAFF: Agendamentos, Calendário, Serviços
  - MANAGER: all STAFF items + Equipe, Configurações, Hotsite
- `components/dashboard/Header.tsx` — user name, tenant name, logout button
- Logout: clears JWT cookie → redirects to `/auth/login`

**Acceptance criteria:**
- [ ] CUSTOMER JWT shows customer navigation items only
- [ ] MANAGER JWT shows all navigation items including "Configurações"
- [ ] Logout clears the JWT cookie and redirects to `/auth/login`
- [ ] Active nav item is highlighted in the sidebar
- [ ] Sidebar is responsive: collapses to hamburger menu on mobile
- [ ] All navigation labels in pt-BR

**Dependencies:** M13-S02

---

### M13-S04 — Customer: booking history + upcoming bookings page

**Agent:** `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` § BookingTimeline, `docs/04-USE_CASES.md` § UC-006

**Description:**  
Implement the customer's booking page. Shows two sections: upcoming bookings (PENDING, INFO_REQUESTED, APPROVED) and past bookings (COMPLETED, CANCELLED, REJECTED).

**Component:** `components/dashboard/BookingTimeline.tsx`
- Fetches `GET /v1/bookings` via `useBookings()`
- Sections: "Próximos agendamentos" + "Histórico"
- Each booking card shows: service names, date/time (tenant timezone), status badge (color-coded), total price in R$
- For APPROVED bookings within cancellation window → shows "Cancelar" button (calls M09-S01)
- For INFO_REQUESTED bookings → shows "Responder" button + info request message + textarea to submit response (calls M08-S04)
- Status badges in pt-BR: PENDING="Aguardando", APPROVED="Confirmado", etc.
- Empty state: "Você não tem agendamentos ainda. [Agendar agora]"

**Acceptance criteria:**
- [ ] Booking list loads from API; skeleton loading state shown while fetching
- [ ] Status badges in correct pt-BR labels with correct colors (green=APPROVED, yellow=PENDING, red=REJECTED/CANCELLED)
- [ ] "Cancelar" only visible for APPROVED bookings within the cancellation window
- [ ] Cancelling a booking removes it from the "Próximos" section immediately (optimistic update)
- [ ] "Responder" button opens an inline form; submission calls correct endpoint
- [ ] Dates displayed in tenant timezone (not UTC)
- [ ] Component test: mock `useBookings()` and assert all booking cards render correctly

**Dependencies:** M13-S03, M08-S06

---

### M13-S05 — Customer: loyalty balance + history page

**Agent:** `frontend-ts`  
**Complexity:** S  
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` § LoyaltyCard, `docs/04-USE_CASES.md` § UC-016

**Description:**  
Implement the customer's loyalty page with their total active points, expiry warning, and history of earnings.

**Component:** `components/dashboard/LoyaltyCard.tsx`
- Fetches `GET /v1/loyalty/balance` + `GET /v1/loyalty/entries`
- Renders: total active points badge, next expiry info
- If `nextExpiryDate` is within 7 days → shows warning banner in amber: "Atenção: X pontos expiram em DD/MM/YYYY"
- Renders paginated list of `LoyaltyEntry` cards: service name, points, earned date, expiry date, active/expired badge

**Acceptance criteria:**
- [ ] Balance and entries load from API
- [ ] Expired entries shown with `isActive=false` style (greyed out)
- [ ] Expiry warning banner shown when `nextExpiryDate` is ≤7 days from now
- [ ] Points numbers formatted with thousand separator (e.g., `1.500 pontos`)
- [ ] Dates formatted in pt-BR format (`DD/MM/YYYY`)
- [ ] Empty state: "Você ainda não acumulou pontos. Conclua um agendamento para começar!"

**Dependencies:** M13-S03, M10-S05

---

### M13-S06 — Customer: TenantSwitcher component

**Agent:** `frontend-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-023

**Description:**  
Implement the tenant switcher UI for customers who belong to multiple tenants. It allows switching to a different tenant without re-doing OAuth.

**Component:** `components/dashboard/TenantSwitcher.tsx`
- Shows current tenant name + dropdown of other available tenants (with active points per tenant)
- On tenant selection → calls `POST /v1/auth/switch-tenant` → updates JWT cookie → refreshes page
- Only shown if customer belongs to 2+ tenants (hidden otherwise)

**Acceptance criteria:**
- [ ] Dropdown shows all tenant options with name + active point count
- [ ] Selecting a tenant updates the JWT and reloads the dashboard with the new tenant context
- [ ] After switching, loyalty balance reflects the new tenant's points
- [ ] If customer has only 1 tenant, the TenantSwitcher is not rendered
- [ ] pt-BR: "Trocar unidade" as dropdown label

**Dependencies:** M13-S03, M03-S08

---

### M13-S07 — Staff: CommandCenter (booking queue)

**Agent:** `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` § CommandCenter, `docs/04-USE_CASES.md` § UC-003–005

**Description:**  
Implement the staff's primary view: the booking queue showing all PENDING bookings that need action. Each booking card shows the customer info, services, scheduled time, and quick action buttons.

**Component:** `components/dashboard/CommandCenter.tsx`
- Fetches `GET /v1/bookings?status=PENDING` via `useBookings({ status: 'PENDING' })`
- Renders a list of `BookingQueueCard` components
- Each card: customer name, services, scheduled date/time, total price, time since request
- Action buttons per card:
  - "Aprovar" → calls approve endpoint (M08-S01) → removes card from queue
  - "Rejeitar" → opens rejection reason modal → calls reject endpoint (M08-S02)
  - "Pedir info" → opens message input modal → calls request-info endpoint (M08-S03)
- Shows empty state: "Nenhuma solicitação pendente" with a checkmark icon
- Auto-refreshes every 30 seconds via TanStack Query `refetchInterval`

**Acceptance criteria:**
- [ ] Queue shows all PENDING bookings for the tenant
- [ ] Approving a booking removes it from the queue immediately (optimistic update)
- [ ] Rejection modal requires a minimum 10-character reason (client-side validation)
- [ ] Info-request modal requires a minimum 20-character message
- [ ] Dates displayed in tenant timezone
- [ ] Queue auto-refreshes every 30s without full page reload
- [ ] Component test: mock `useBookings()` and assert approve/reject/info actions trigger correct API calls

**Dependencies:** M13-S03, M08-S01, M08-S02, M08-S03

---

### M13-S08 — Staff: booking detail page

**Agent:** `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/14-API_CONTRACTS.md` § GET /bookings/:id, `docs/04-USE_CASES.md` § UC-008, UC-009

**Description:**  
Implement the full booking detail page for staff. Shows all booking information and provides access to advanced actions: reschedule, admin cancel, and mark complete with actual price inputs and photo upload.

**Page:** `app/dashboard/bookings/[id]/page.tsx`
- Fetches `GET /v1/bookings/:id`
- Shows: booking status (with state machine history), customer info, services + prices, photos (before + after)
- Status-appropriate action panels:
  - PENDING / INFO_REQUESTED: Approve, Reject, Request Info buttons
  - APPROVED: Reschedule (date picker), Admin Cancel, Mark Complete
  - COMPLETED: Read-only; shows after-service photos + actual prices charged

**Mark Complete panel:**
- Input for `actualPriceCharged` per line (pre-filled with `priceAtBooking`)
- Photo upload: calls `POST /v1/bookings/attachments/signed-url` → direct browser-to-GCS upload
- Submit calls `PATCH /v1/bookings/:id/complete`

**Reschedule panel:**
- Date + slot picker (same component as hotsite booking form, Step 2)
- Calls `PATCH /v1/bookings/:id/reschedule`

**Acceptance criteria:**
- [ ] All booking fields displayed correctly including `lines[]` with prices
- [ ] Mark Complete: actual price inputs default to `priceAtBooking` but are editable
- [ ] Photo upload progress shown during GCS upload; URL submitted only after upload completes
- [ ] Rescheduling shows availability picker for the booking's services
- [ ] After completing a booking, page status badge updates to COMPLETED
- [ ] Back button returns to booking queue
- [ ] All labels in pt-BR

**Dependencies:** M13-S07, M10-S01, M10-S02, M09-S03

---

### M13-S09 — Admin: service management page

**Agent:** `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` § ServiceEditor

**Description:**  
Implement the service catalog management page for admins. Allows creating, editing, and deactivating services.

**Page:** `app/dashboard/services/page.tsx`
- Lists all services (active + inactive, filtered by `isActive` toggle)
- "Novo Serviço" button opens a slide-over form

**Component:** `components/dashboard/ServiceEditor.tsx`
- Form fields: name, description, price (R$), duration (minutes), loyalty points, requires pickup toggle
- Inline validation in pt-BR
- Create → `POST /v1/services`; Edit → `PATCH /v1/services/:id`; Deactivate → `DELETE /v1/services/:id`

**Acceptance criteria:**
- [ ] Service list renders with active/inactive badges
- [ ] Creating a service with `priceAmount=0` shows client-side error "Preço deve ser maior que zero"
- [ ] Edit form pre-fills all existing values
- [ ] Deactivating a service shows a confirmation dialog: "Deseja desativar este serviço?"
- [ ] Deactivated services shown with reduced opacity and "Inativo" badge
- [ ] Customer role cannot access this page (middleware redirects)

**Dependencies:** M13-S03, M05-S04, M05-S05

---

### M13-S10 — Admin: schedule calendar + closure management

**Agent:** `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-010

**Description:**  
Implement the schedule management page: a monthly calendar view showing bookings and closures, with the ability to add or remove schedule closures.

**Page:** `app/dashboard/schedule/page.tsx`
- Monthly calendar component (use `react-day-picker` or similar)
- Closed dates highlighted in red
- Dates with APPROVED bookings show a booking count badge
- Clicking a date: if open → "Fechar esta data" button (opens reason selector); if closed → "Abrir esta data" button

**Acceptance criteria:**
- [ ] Calendar loads closures from `GET /v1/schedule/closures`
- [ ] Clicking a closed date and confirming calls `DELETE /v1/schedule/closures/:id`
- [ ] Adding a closure requires selecting a reason (STAFF_DAY_OFF, MAINTENANCE, HOLIDAY) — in pt-BR labels
- [ ] Past dates cannot be closed (button disabled)
- [ ] Calendar shows pt-BR month/day names (Janeiro, Fevereiro, etc.)

**Dependencies:** M13-S03, M06-S02

---

### M13-S11 — Admin: staff management page

**Agent:** `frontend-ts`  
**Complexity:** S  
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-028, UC-029

**Description:**  
Implement the staff management page for MANAGER role. Shows the staff list with status badges and provides invite + deactivate actions.

**Page:** `app/dashboard/staff/page.tsx`
- Table: name, email, role, status (Active/Pending/Inactive), actions
- "Convidar Membro" button → inline form with email + role selector
- Deactivate button → confirmation dialog

**Acceptance criteria:**
- [ ] Staff list shows all staff with correct status badges
- [ ] Pending staff (is_active=false, google_oauth_id=null) shows "Convite Pendente" badge
- [ ] Inviting an existing email shows error: "Este e-mail já faz parte da equipe"
- [ ] Deactivating self shows error: "Não é possível desativar sua própria conta"
- [ ] Deactivating last manager shows error: "É necessário manter ao menos um gerente ativo"
- [ ] STAFF role cannot access this page (returns 403 from BFF)

**Dependencies:** M13-S03, M04-S03, M04-S04

---

### M13-S12 — Admin: tenant settings page

**Agent:** `frontend-ts`  
**Complexity:** S  
**Docs to load:** `docs/04-USE_CASES.md` § UC-026, `docs/21-TENANTS_SETTINGS_SCHEMA.md`

**Description:**  
Implement the tenant settings form page for MANAGER role. Allows editing all configurable settings: cancellation window, loyalty expiry, business hours per day of week, timezone, and booking buffer.

**Page:** `app/dashboard/settings/page.tsx`
- Loads current settings from `GET /v1/tenants/settings`
- Form sections: Agendamentos, Fidelidade, Horário de Funcionamento
- Business hours: per-day toggles (Mon–Sun) with open/close time pickers; toggling a day off sets null
- Timezone: dropdown of Brazilian timezones (`America/Sao_Paulo`, `America/Manaus`, `America/Belem`, etc.)

**Acceptance criteria:**
- [ ] Settings form pre-filled with current values on load
- [ ] Saving with invalid cancellation window (e.g., negative) shows client-side error
- [ ] Business hours day toggle: disabling a day shows greyed-out time pickers
- [ ] "Salvar" calls `PATCH /v1/tenants/settings` and shows success toast: "Configurações salvas!"
- [ ] Validation errors from backend displayed inline next to the relevant field
- [ ] STAFF role cannot access this page

**Dependencies:** M13-S03, M02-S06

---

### M13-S13 — Admin: hotsite manager page

**Agent:** `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `docs/04-USE_CASES.md` § UC-027

**Description:**  
Implement the hotsite content manager page. Admins can edit branding, toggle modules on/off and reorder them, and publish/unpublish the hotsite. A live preview link lets them see changes before publishing.

**Page:** `app/dashboard/hotsite/page.tsx`
- Two panels: left = editor, right = preview link
- Branding editor: primary color picker, logo URL input, banner image URL input
- Layout editor: list of available module types with toggle on/off
- "Salvar rascunho" → `PATCH /v1/tenants/hotsite` (does not publish)
- "Publicar" button → `POST /v1/tenants/hotsite/publish` + confirmation dialog
- "Despublicar" button → `POST /v1/tenants/hotsite/unpublish`
- Preview link opens `/{slug}` in a new tab (shows even unpublished if admin is previewing)

**Acceptance criteria:**
- [ ] Color picker shows live preview of `--primary-color` change
- [ ] "Publicar" with empty layout shows error: "Adicione ao menos um módulo antes de publicar"
- [ ] After publishing, hotsite is accessible at `/{slug}` within 5 minutes (ISR revalidation)
- [ ] "Salvar rascunho" does not change `isPublished` state
- [ ] Publish/Unpublish confirmation dialogs in pt-BR
- [ ] STAFF role cannot access this page

**Dependencies:** M13-S03, M12-S02
