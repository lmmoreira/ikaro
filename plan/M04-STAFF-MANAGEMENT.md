# M04 — Staff Management

**Phase:** Local Development  
**Goal:** A manager can invite new staff members, a new staff member can complete their first login to activate their account, and a manager can deactivate staff. Invitation emails are sent via MailHog (local) and validated visually.  
**Depends on:** M03 (auth guards needed), M02-S05 (CLI provisioning creates the first MANAGER staff row)  
**Blocks:** M11 (notifications need the full Notification context bootstrap started here)

---

## Stories

---

### M04-S01 — UC-025: Admin first login / accept invite

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

### M04-S02 — Staff list and detail API endpoints

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

### M04-S03 — UC-028: Admin invites new staff member

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

### M04-S04 — UC-029: Admin deactivates staff member

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

**Description:**  
Bootstrap the Notification bounded context infrastructure enough to send the staff invitation email. This is the first real email flow in the system — it validates that the IEmailSender port, the Pub/Sub subscription, and MailHog (local) are all wired correctly. Full notification system (templates, logging, all events) is M11.

**What to create:**
- `NotificationModule` in `apps/backend/src/contexts/notification/`
- `MailhogEmailAdapter` (local dev) → implements `IEmailSender`, sends via SMTP to `localhost:1025`
- `StaffInvitedHandler` — subscribes to `StaffInvited` events from Pub/Sub emulator:
  1. Idempotency check: has `eventId` been processed? (simple in-memory set for now, full table in M11)
  2. Send invitation email with hardcoded pt-BR template (full template system in M11)
  3. Email body (pt-BR): "Você foi convidado para a equipe de [tenant name]. Clique aqui para aceitar."

**Acceptance criteria:**
- [ ] After `InviteStaffUseCase` runs, a `StaffInvited` event is consumed by `StaffInvitedHandler`
- [ ] An invitation email appears in MailHog (`http://localhost:8025`) within 5 seconds
- [ ] Email subject is in pt-BR
- [ ] Email body contains the tenant name and an activation link
- [ ] If the same `StaffInvited` event is delivered twice, the email is sent only once (idempotency)
- [ ] `IEmailSender` is injected via DI — no `new MailhogEmailAdapter()` in the handler

**Dependencies:** M04-S03, M00-S06
