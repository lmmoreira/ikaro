# M04 — Staff Management

**Phase:** Local Development  
**Goal:** A manager can invite new staff members, a new staff member can complete their first login to activate their account, and a manager can deactivate staff. Invitation emails are sent via MailHog (local) and validated visually.  
**Depends on:** M03 (auth guards needed), M02-S05 (`TenantProvisioned` event triggers M04-S06 to create the first MANAGER staff)  
**Blocks:** M11 (notifications need the full Notification context bootstrap started here)

---

## Stories

---

### M04-S01 — UC-025: Admin first login / accept invite ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-025, `docs/02-DOMAIN_MODEL.md` § Staff aggregate

**Description:**  
When a staff member with `is_active=false` completes Google OAuth for the first time, their account must be activated: `google_oauth_id` is set to their Google `sub`, `is_active` is set to `true`, and a JWT is issued. This story implements the activation use case in the backend and the BFF routing to trigger it.

**Backend use case `ActivateStaffUseCase`:**
- Input: `{ tenantId, staffId, googleOAuthId }`
- Loads `Staff` aggregate by `(tenantId, email)` — matches based on invited email vs Google profile email
- Calls `staff.activate(googleOAuthId)`
- Persists updated staff record
- Returns activated staff data

**BFF routing update (from M03-S07):**
- When OAuth callback finds `is_active=false` staff → call `ActivateStaffUseCase` via backend internal endpoint
- Issue JWT after activation
- Redirect to `/dashboard`

**Acceptance criteria:**
- [ ] Staff member with `is_active=false` completes OAuth → `is_active` becomes `true` in DB
- [ ] `google_oauth_id` is populated on the staff record after activation
- [ ] JWT is issued with correct `role: MANAGER` or `role: STAFF`
- [ ] Attempting to activate a staff record that belongs to a different tenant returns `403`
- [ ] Attempting to activate with an email that doesn't match any invited staff returns `404`
- [ ] Integration test: invite staff (M04-S03 prerequisite — use direct DB insert as substitute), complete OAuth callback, assert `is_active=true`

**Dependencies:** M03-S07, M03-S02

---

### M04-S02 — Staff list and detail API endpoints ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** S  
**Docs to load:** `docs/14-API_CONTRACTS.md` § staff endpoints, `docs/06-TENANT_ISOLATION_STRATEGY.md`

**Description:**  
Expose the staff list and detail endpoints so the dashboard frontend can render the staff management page. Both endpoints are tenant-scoped and require `MANAGER` role.

**Backend endpoints (internal, called by BFF):**
- `GET /internal/staff` → `findAllByTenant(tenantId)` → returns `Staff[]`
- `GET /internal/staff/:id` → `findById(id, tenantId)` → returns `Staff` or 404

**BFF endpoints (public-facing):**
- `GET /v1/staff` — requires JWT + `MANAGER` role; proxies to backend
- `GET /v1/staff/:id` — requires JWT + `MANAGER` role; proxies to backend

**Response DTO:**
```json
{
  "id": "uuid",
  "email": "staff@tenant.com",
  "name": "string",
  "role": "MANAGER | STAFF",
  "isActive": true,
  "createdAt": "ISO-8601"
}
```

**Acceptance criteria:**
- [ ] `GET /v1/staff` with MANAGER JWT returns only staff from the JWT's `tenantId`
- [ ] `GET /v1/staff` with STAFF (non-manager) JWT returns `403`
- [ ] `GET /v1/staff/:id` with an ID belonging to a different tenant returns `404` (not `403` — do not reveal existence)
- [ ] Tenant isolation test: create staff in Tenant A and Tenant B; query as Tenant A's MANAGER → only Tenant A staff returned
- [ ] Response includes pagination (`limit`, `offset`, `total`, `hasMore`)

**Dependencies:** M03-S05, M03-S02

---

### M04-S03 — UC-028: Admin invites new staff member ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-028, `docs/03-DOMAIN_EVENTS.md` § StaffInvited

**Description:**  
Implement the invite staff flow. A MANAGER sends an invitation to an email address with a role. The system creates an inactive staff row and emits a `StaffInvited` domain event. The Notification context (wired in M11) will consume this event and send the invitation email.

**Backend use case `InviteStaffUseCase`:**
1. Validate email is not already a staff member in this tenant
2. Create `Staff` aggregate via `Staff.invite(tenantId, email, role)`
3. Persist to `staff.staff` table
4. Publish `StaffInvited` event via `IEventBus`

**BFF endpoint:**
- `POST /v1/staff/invite`
- Requires: JWT + `MANAGER` role
- Body: `{ email: string, role: 'MANAGER' | 'STAFF' }`
- Returns: `201 { staffId, email, role, isActive: false }`

**Acceptance criteria:**
- [ ] `POST /v1/staff/invite` creates an inactive staff row in `staff.staff`
- [ ] Inviting an email already active in the same tenant returns `409` (conflict)
- [ ] `StaffInvited` event is emitted with envelope fields: `eventId`, `tenantId`, `occurredAt`, `correlationId`, and payload: `staffId`, `email`, `role`, `invitedBy`
- [ ] Requires `MANAGER` role — `STAFF` role returns `403`
- [ ] Integration test: invite → assert DB row + assert event published to Pub/Sub emulator
- [ ] Tenant isolation test: invited staff belongs only to the inviting tenant's `tenant_id`

**Dependencies:** M04-S02, M03-S05

---

### M04-S04 — UC-029: Admin deactivates staff member ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-029, `docs/03-DOMAIN_EVENTS.md` § StaffDeactivated

**Description:**  
Implement staff deactivation. A MANAGER can deactivate any staff member except themselves and except the last active MANAGER in the tenant (which would lock everyone out). The deactivated staff member's JWT remains valid until expiry but the backend rejects requests from inactive staff on every call.

**Backend use case `DeactivateStaffUseCase`:**
1. Load `Staff` by `(id, tenantId)`
2. Check not self-deactivation (compare `staffId` with JWT `sub`)
3. If `role=MANAGER`, call `countActiveManagersByTenant()` — if count = 1, reject
4. Call `staff.deactivate()`
5. Persist
6. Publish `StaffDeactivated` event

**BFF endpoint:**
- `PATCH /v1/staff/:id/deactivate`
- Requires: JWT + `MANAGER` role
- Returns: `200 { staffId, isActive: false }`

**Acceptance criteria:**
- [ ] Deactivating any staff member sets `is_active=false` in the DB
- [ ] Attempting to deactivate yourself returns `403` with message `"Cannot deactivate your own account"`
- [ ] Attempting to deactivate the last active MANAGER returns `409` with message `"Cannot remove the last active manager"`
- [ ] `StaffDeactivated` event is emitted with `staffId`, `tenantId`, `deactivatedBy`
- [ ] Deactivated staff calling a protected endpoint should return `403` (add `isActive` check to `JwtAuthGuard` by calling backend)
- [ ] Tenant isolation: cannot deactivate staff from a different tenant (returns `404`)

**Dependencies:** M04-S03, M03-S05

---

### M04-S05 — Notification context bootstrap + StaffInvited email consumer

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/05-BOUNDED_CONTEXTS.md` § Notification context, `docs/03-DOMAIN_EVENTS.md` § StaffInvited, `docs/10-OBSERVABILITY_STRATEGY.md` § email adapter

> **Note (M04-S06 implemented):** The GCP Pub/Sub adapter is already built — `GcpPubSubEventBusAdapter` in `src/shared/infrastructure/gcp-pubsub-event-bus.adapter.ts`. Do NOT rebuild or modify `EventBusModule`. Follow the established handler pattern: thin `handle()` → calls use case, subscribes in `onModuleInit()` with `consumerName = 'notification'`. See CLAUDE.md §7 "Event handlers" for the full pattern and test wiring.

**Description:**  
Bootstrap the Notification bounded context infrastructure enough to send the staff invitation email. This is the first real email flow in the system — it validates that the `IEmailSender` port, the Pub/Sub subscription, and MailHog (local) are all wired correctly. Full notification system (templates, logging, all events) is M11.

**What to create:**
- `NotificationModule` in `apps/backend/src/contexts/notification/`
- `MailhogEmailAdapter` (local dev) → implements `IEmailSender`, sends via SMTP to `localhost:1025`
- `SendStaffInvitationUseCase` — contains the email-sending logic (idempotency via DB check, email composition)
- `StaffInvitedHandler` — thin handler, subscribes to `StaffInvited` (topic `beloauto-StaffInvited`, subscription `beloauto-StaffInvited-notification`):
  1. Calls `SendStaffInvitationUseCase.execute({ staffId, tenantId, correlationId })`
  2. Rethrows errors for Pub/Sub nack + retry
  - Idempotency: DB check in the use case (no in-memory set)
  - Email body (pt-BR): "Você foi convidado para a equipe de [tenant name]. Clique aqui para aceitar."

**Important — two sources of `StaffInvited`:**
`StaffInvited` events arrive from two flows. The handler must support both:
1. **UC-028 (normal invite):** `invitedBy` = UUID of the MANAGER who sent the invite — can be shown in the email as "Convidado por [nome]"
2. **UC-024 provisioning (M04-S06):** `invitedBy` = `SYSTEM_ACTOR_ID ('00000000-0000-0000-0000-000000000000')` — the email must NOT try to look up the inviter; show "BeloAuto Platform" or omit the "invited by" line

**Acceptance criteria:**
- [ ] After `InviteStaffUseCase` runs, a `StaffInvited` event is consumed by `StaffInvitedHandler`
- [ ] An invitation email appears in MailHog (`http://localhost:8025`) within 5 seconds
- [ ] Email subject is in pt-BR
- [ ] Email body contains the tenant name and an activation link
- [ ] If the same `StaffInvited` event is delivered twice, the email is sent only once (idempotency)
- [ ] Handler handles `invitedBy = SYSTEM_ACTOR_ID` without error (provisioning case)
- [ ] `IEmailSender` is injected via DI — no `new MailhogEmailAdapter()` in the handler

**Dependencies:** M04-S03, M00-S06

---

### M04-S06 — TenantProvisioned handler: create first MANAGER staff + publish StaffInvited ✅ Done

**Agent:** `backend-ts`  
**Complexity:** M  
**Docs to load:** `docs/03-DOMAIN_EVENTS.md` § TenantProvisioned + StaffInvited, `docs/02-DOMAIN_MODEL.md` § Staff aggregate, `docs/04-USE_CASES.md` § UC-024, `docs/06-TENANT_ISOLATION_STRATEGY.md`

**Context — why this story exists:**
When `POST /internal/tenants` (M02-S05) provisions a new tenant, it publishes a `TenantProvisioned` event but does NOT create the first MANAGER staff — the Staff context doesn't exist yet in M02. This story closes that gap: the Staff context subscribes to `TenantProvisioned` and creates the first MANAGER staff row, then publishes `StaffInvited` so M04-S05 / M11 send the invitation email.

**What to create:**

**1. `SYSTEM_ACTOR_ID` constant**
- Location: `apps/backend/src/shared/domain/system-actor.ts`
- ```typescript
  export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';
  ```
- Used wherever a platform-initiated action needs an actor identifier (no human actor exists)
- Export from `src/shared/domain/index.ts`

**2. `Staff.inviteFromProvisioning()` static factory**
- Add to `Staff` domain aggregate alongside existing `Staff.invite()`
- Signature: `Staff.inviteFromProvisioning(tenantId: string, email: string): Staff`
- Sets: `role = MANAGER`, `isActive = false`, `googleOAuthId = null`
- Distinct from `Staff.invite()` which requires an `invitedBy` human actor
- Does NOT emit a `StaffInvited` domain event from within the aggregate — the handler publishes the event explicitly (keeps the aggregate clean and testable)

**3. `TenantProvisionedHandler`**
- Location: `apps/backend/src/contexts/staff/infrastructure/events/tenant-provisioned.handler.ts`
- Subscribes to `TenantProvisioned` events from `IEventBus`
- **Idempotency:** before doing anything, check if `eventId` has already been processed (use the `processed_events` table from M11, or a simpler in-memory idempotency guard for now). Skip if already processed.
- **Flow:**
  ```
  1. Check idempotency (eventId already processed → skip)
  2. Check: does a MANAGER staff already exist for this tenantId? → skip if yes (belt-and-suspenders)
  3. staffId = uuidv7()
  4. staff = Staff.inviteFromProvisioning(tenantId, adminEmail)
  5. await staffRepo.save(staff)
  6. publish StaffInvited:
       { staffId, tenantId, email: adminEmail, role: 'MANAGER', invitedBy: SYSTEM_ACTOR_ID }
  7. mark eventId as processed
  ```
- Handler errors must be logged and re-thrown so the event bus retries (Pub/Sub at-least-once delivery)

**4. Wire into `StaffModule`**
- Register `TenantProvisionedHandler` as a provider
- Subscribe to `TenantProvisioned` event via `IEventBus`

**Acceptance criteria:**
- [ ] Publishing a `TenantProvisioned` event results in a `staff.staff` row with `role=MANAGER`, `is_active=false`, `email=adminEmail`
- [ ] `StaffInvited` event is published with `invitedBy = SYSTEM_ACTOR_ID`
- [ ] Handler is idempotent: delivering the same `TenantProvisioned` event twice creates exactly one staff row
- [ ] If a MANAGER staff already exists for the tenant, the handler skips silently (no duplicate)
- [ ] Staff row has correct `tenant_id` (tenant isolation invariant)
- [ ] `google_oauth_id` is `null` on the created row
- [ ] Integration test: publish `TenantProvisioned` → assert staff row created + `StaffInvited` event emitted

**Dependencies:** M04-S03 (Staff domain + repository established), M02-S05 (`TenantProvisioned` event defined)
