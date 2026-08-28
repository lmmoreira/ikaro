# Discovery: Multi-Vertical Scheduling — Data Model

**Status:** Discovery — exploratory. No migration files exist yet; nothing here is committed to a milestone. Column/constraint names below are illustrative (snake_case, matching `docs/13-DATABASE_SCHEMA.md` conventions) — subject to change at implementation time.
**Companion doc:** `multivertical-booking.md` — the domain model this schema implements (§3–§8 in particular).
**Companion doc:** `multivertical-booking_USECASES.md` — candidate use cases (`CAND-XX`) referenced throughout.
**Companion prototype:** `prototype/`.

## 1. Purpose

Translates the domain model into a concrete physical schema — following this codebase's real conventions (`docs/13-DATABASE_SCHEMA.md`'s schema-per-context, UUID v7, tenant-first composite FKs/indexes, expand/contract migrations) rather than the language-agnostic properties sketched in the domain doc. Building the actual tables surfaced several gaps the prose model doesn't have — §6 is the point of this document as much as the schema itself. §9 is a step further: a design-quality assessment (normalization, indexing, concurrency, retention) against this platform's stated "high load" ambition, not just correctness.

Everything below lives in the `booking` schema unless stated otherwise, per the domain doc §8's placement of every new aggregate in the Booking Context. Every example below uses the discovery prototype's own fictional tenant, Vitta Studio, and its already-established resources/services — not invented data — so examples can be cross-checked against the prototype screens directly.

---

## 2. New tables

### `booking.resources`

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL, FK → `platform.tenants(id)` |
| type | VARCHAR(20) | NOT NULL — CHECK IN (`LOCATION`, `STAFF`, `ROOM`, `EQUIPMENT`) |
| ref_id | UUID | NULLABLE — staffId when `type = STAFF`; no FK (cross-context ref to `staff.staff`) |
| name | VARCHAR(255) | NOT NULL |
| working_hours | JSONB | NULLABLE — same per-weekday `{ open, close }` shape as `tenants.settings.businessHours`, **without** a `timezone` key (inherits the tenant's) |
| turnover_minutes | INT | NOT NULL DEFAULT 0 CHECK `>= 0` |
| max_capacity | INT | NULLABLE CHECK `> 0` when set — physical ceiling for `LOCATION`/`ROOM` and genuinely capacity-bearing `EQUIPMENT`; null for `STAFF` |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at / updated_at | TIMESTAMPTZ | DEFAULT now() |
| **UNIQUE** | (tenant_id, id) | Composite FK target |
| **UNIQUE** | (tenant_id, id, type) | Lets child pool/assignment rows prove the persisted `resource_type` matches the referenced resource. |
| **UNIQUE** | (tenant_id, ref_id) WHERE type='STAFF' AND ref_id IS NOT NULL | CAND-01 A1 — one `Resource` per `Staff` row, DB-enforced without needing a cross-schema FK |
| **UNIQUE** | (tenant_id) WHERE type='LOCATION' AND is_active | Exactly one active default location resource per tenant |
| **CHECK** | `(type = 'STAFF') = (ref_id IS NOT NULL)` | A staff wrapper must reference a Staff ID; every other resource type must not |
| **INVARIANT** | every resource `working_hours` window is within the tenant's recurring business-hours window | Aggregate/use-case validation; tenant time is a hard outer boundary |
| **INDEX** | (tenant_id, type, is_active) | Resource pickers filtered by type |

**Example data:**

| id | type | ref_id | name | turnover_minutes | is_active |
|---|---|---|---|---|---|
| res_location_vitta | LOCATION | null | Vitta Studio (unidade única) | 0 | true |
| res_staff_camila | STAFF | staff_camila_id | Camila Duarte | 15 | true |
| res_staff_renata | STAFF | staff_renata_id | Renata Souza | 15 | true |
| res_room_estudio1 | ROOM | null | Estúdio 1 | 10 | true |
| res_equip_pedras | EQUIPMENT | null | Kit de Pedras Quentes | 5 | true |

One row per resource type, all under the same tenant. `ref_id` is only ever set for `STAFF` — it's how `res_staff_camila` wraps the real `Staff` row without needing a cross-schema FK.

### `booking.service_booking_intake_schema` / `booking.booking_attendees`

A versioned, service-owned definition of booking questions, consent text/version, participant rules and typed field markers such as `PICKUP_ADDRESS`. A new version supersedes, never edits, the previous one, so a past booking's snapshot always resolves against the exact form it was submitted under (`CAND-43` A1).

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| service_id | UUID | NOT NULL — FK (tenant_id, service_id) → `services` |
| version | INT | NOT NULL — monotonically increasing per service |
| questions | JSONB | NOT NULL — ordered `[{ fieldKey, label, type, required }]`; `type` covers generic input shapes (`FREE_TEXT`, `NAMED_ATTENDEES`) and business-specific typed markers the booking layer projects into an already-typed column — `PICKUP_ADDRESS` doesn't add a new column, it drives `bookings.pickup_address`, which already exists for car wash's "leva e traz" (`docs/13-DATABASE_SCHEMA.md:227`); this discovery generalizes that mechanism to any service, not just car wash |
| consent_text | TEXT | NOT NULL |
| consent_version | INT | NOT NULL |
| requires_named_attendees | BOOLEAN | NOT NULL DEFAULT false |
| participant_count_required | BOOLEAN | NOT NULL DEFAULT false |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| **UNIQUE** | (tenant_id, service_id, version) | |
| **UNIQUE** | (tenant_id, service_id) WHERE is_active | At most one active schema version per service |

`booking_attendees` is an optional child table, populated only when `requires_named_attendees = true`: `id, tenant_id, booking_id, name, customer_id NULL, is_minor` — FK `(tenant_id, booking_id)` → `bookings`. The responsible booking customer stays on `bookings` itself, distinct from attendees (domain doc §6b — "enabling a guardian to book for a minor without introducing family-account management").

**Example data — Sala de reunião's intake form** (`public-11-reserva-por-tempo.html` → `public-12-intake-e-confirmacao.html`):

`service_booking_intake_schema`:

| id | service_id | version | consent_version | requires_named_attendees | participant_count_required | is_active |
|---|---|---|---|---|---|---|
| intake_sala_reuniao_v1 | svc_sala_reuniao | 1 | 1 | true | true | true |

`questions` for this row: a `PARTICIPANT_COUNT` field (min 1, max 8 — "Sala Aurora comporta até 8 pessoas"), a `NAMED_ATTENDEES` field ("Participantes nomeados") and a `FREE_TEXT` field ("Necessidades de acesso"). This tenant requires *both* a count and named attendees on this one service — the domain doc's "only a count, or named rows" describes the range a service can configure, not that every service must pick exactly one end of it.

**Example data — the booking this schema produced:** Ana Costa books Sala Aurora, 2026-08-18 10:00–12:00 (`public-11`'s own displayed slot/price, R$ 100,00). Her `bookings` row snapshots `intake_schema_version = 1` and `intake_answers = {"accessNeeds": null}`; 6 people attend, but only 2 needed individual lobby/badge access, so only 2 attendee rows exist — both names come straight from `public-12`'s own form hint (`placeholder="Ex.: Marina Lopes, João Silva"`):

| id | booking_id | name | customer_id | is_minor |
|---|---|---|---|---|
| att_1 | book_ana_sala_aurora_0818 | Marina Lopes | null | false |
| att_2 | book_ana_sala_aurora_0818 | João Silva | null | false |

Neither attendee has a `customer_id` — they're guests of Ana Costa's booking, not separate `Customer` rows; `is_minor` exists for the domain doc §6b A2 case (a guardian booking for a minor), unused here.

### `booking.recurring_booking_schedules` / assignments / exceptions

Private appointment/reservation recurrence is distinct from `recurring_enrollments` (session family).

`recurring_booking_schedules`:

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| customer_id | UUID | NOT NULL — no FK, cross-context; guest bookings are never eligible (domain doc §6b) |
| service_id | UUID | NOT NULL — FK (tenant_id, service_id) → `services` |
| recurrence | JSONB | NOT NULL — e.g. `{ "frequency": "WEEKLY", "daysOfWeek": ["TUE"], "startTime": "10:00", "durationMinutes": 120 }` |
| starts_on / ends_on | DATE | NOT NULL / NULLABLE — open-ended when `ends_on` is null |
| status | VARCHAR(20) | NOT NULL — CHECK IN (`PENDING_APPROVAL`, `ACTIVE`, `PAUSED`, `CANCELLED`); no fixed default — set by application logic to `ACTIVE` (service `AUTO_CONFIRM`) or `PENDING_APPROVAL` (service `MANUAL_APPROVAL`) at creation. **Added `PENDING_APPROVAL` 2026-08-28, see §6 item 42.** |
| assignment_policy | VARCHAR(30) | NOT NULL — CHECK IN (`FIXED_ASSIGNMENT`, `RESOLVE_PER_OCCURRENCE`) |
| approval_hold_expires_at | TIMESTAMPTZ | NULLABLE — required iff `status = 'PENDING_APPROVAL'`; same hold-expiry mechanic as `resource_occupancy.hold_expires_at`. Added 2026-08-28, §6 item 42. |
| approved_by_staff_id / approved_at | UUID / TIMESTAMPTZ | NULLABLE — no FK, cross-context; set when `CAND-45b` resolves a `PENDING_APPROVAL` request. Added 2026-08-28. |
| cancellation_reason | VARCHAR(30) | NULLABLE — CHECK IN (`CUSTOMER_CANCELLED`, `APPROVAL_REJECTED`, `APPROVAL_EXPIRED`) when `status = 'CANCELLED'`; null otherwise. Added 2026-08-28. |
| created_by_staff_id | UUID | NULLABLE — no FK, cross-context; same `<action>_by` audit pattern used elsewhere in this doc, set when staff creates it for the customer |
| created_at / updated_at | TIMESTAMPTZ | DEFAULT now() |
| **UNIQUE** | (tenant_id, id) | Composite FK target for the two child tables below |
| **CHECK** | `(status = 'PENDING_APPROVAL') = (approval_hold_expires_at IS NOT NULL)` | Prevents a permanent pending request or an expiring non-pending one. Added 2026-08-28. |
| **INDEX** | (tenant_id, customer_id, status) | |
| **INDEX** | (tenant_id, service_id, status) | |
| **INDEX** | (tenant_id, status, approval_hold_expires_at) | Feeds the schedule-approval expiry worker, same shape as `class_session_bookings`' offer-expiry index. Added 2026-08-28. |
| **INVARIANT** | at most `MAX_ACTIVE_SCHEDULES_PER_RESOURCE = 50` active `FIXED_ASSIGNMENT` schedules reference any one resource (via `recurring_booking_schedule_resource_assignments`); at most `MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE = 50` active `RESOLVE_PER_OCCURRENCE` schedules exist per service (no fixed resource to count against in advance) | App-enforced, not a DB constraint — cross-table count. `CAND-45` A4. Added 2026-08-28, see §6 item 43. |

`recurring_booking_schedule_resource_assignments` — the durable child assignment record:

| Column | Type | Constraints |
|---|---|---|
| tenant_id | UUID | NOT NULL |
| recurring_schedule_id | UUID | NOT NULL — FK (tenant_id, recurring_schedule_id) → `recurring_booking_schedules` |
| requirement_id | UUID | NULLABLE — FK (tenant_id, requirement_id) → `service_resource_requirements`, when the service declares one |
| resource_id | UUID | NOT NULL — FK (tenant_id, resource_id, resource_type) → `resources` |
| resource_type | VARCHAR(20) | NOT NULL |
| required_quantity_position | INT | NULLABLE — set only for a fungible `requiredQuantity > 1` requirement, disambiguating which unit this row fills |
| assigned_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| **PK** | (tenant_id, recurring_schedule_id, resource_id) | |

Mandatory for `FIXED_ASSIGNMENT`; `RESOLVE_PER_OCCURRENCE` retains the eligible requirement/pool only and resolves distinct resources during each materialization instead of persisting a row here. Customer/staff-selected resources default to fixed; automatic/fungible services may use either policy.

`recurring_booking_schedule_exceptions`:

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| recurring_schedule_id | UUID | NOT NULL — FK (tenant_id, recurring_schedule_id) → `recurring_booking_schedules` |
| occurrence_start | TIMESTAMPTZ | NOT NULL — the pattern-computed occurrence this exception applies to |
| kind | VARCHAR(20) | NOT NULL — CHECK IN (`SKIPPED`, `RESCHEDULED`) |
| replacement_booking_id | UUID | NULLABLE — FK (tenant_id, replacement_booking_id) → `bookings`; set iff `kind = 'RESCHEDULED'` |
| actor_type / actor_id | VARCHAR(20) / UUID | NOT NULL / NULLABLE — customer or staff |
| reason | VARCHAR(255) | NULLABLE |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| **UNIQUE** | (tenant_id, recurring_schedule_id, occurrence_start) | One exception per skipped/rescheduled occurrence |
| **CHECK** | `(kind = 'RESCHEDULED') = (replacement_booking_id IS NOT NULL)` | |

Generated ordinary bookings link through nullable `recurring_schedule_id` on `bookings` and have a unique `(tenant_id, recurring_schedule_id, occurrence_start)` generation key there too — the same idempotency shape `class_session_bookings.series_id` already uses for the session family. They retain their independent lifecycle, quote/audit/no-show history. A schedule is a standing availability commitment, so availability checks evaluate its future pattern directly, the same way they do for class templates.

**Example data — Ana Costa's standing Sala Aurora reservation** (`customer-09-reserva-recorrente.html`: "Toda terça, 10:00–12:00"):

`recurring_booking_schedules`:

| id | customer_id | service_id | recurrence | starts_on | ends_on | status | assignment_policy |
|---|---|---|---|---|---|---|---|
| rbs_ana_sala_aurora | cust_ana | svc_sala_reuniao | `{"frequency":"WEEKLY","daysOfWeek":["TUE"],"startTime":"10:00","durationMinutes":120}` | 2026-08-05 | null | ACTIVE | FIXED_ASSIGNMENT |

`recurring_booking_schedule_resource_assignments`:

| recurring_schedule_id | resource_id | resource_type |
|---|---|---|
| rbs_ana_sala_aurora | res_room_aurora | ROOM |

Locked to Sala Aurora specifically — every occurrence the screen shows ("19 de agosto," "26 de agosto") stays in the same room, which is what `FIXED_ASSIGNMENT` means in practice: the customer picked one meeting room, not "whichever is free that Tuesday."

`recurring_booking_schedule_exceptions` — the screen's own two actions ("Pular esta ocorrência" / "Reagendar esta ocorrência") are alternatives for the *same* occurrence, not both applied at once. Ana choosing to skip Aug 19 outright ("A sala será liberada... Sua recorrência continua normalmente na semana seguinte") looks like this:

| id | occurrence_start | kind | replacement_booking_id | actor_type | reason |
|---|---|---|---|---|---|
| exc_1 | 2026-08-19T10:00 | SKIPPED | null | CUSTOMER | null |

Had she chosen "Reagendar" to the screen's first alternative ("Qua, 20 ago · 10:00–12:00 · Sala Aurora") instead, the same row would look like this:

| id | occurrence_start | kind | replacement_booking_id | actor_type | reason |
|---|---|---|---|---|---|
| exc_1_alt | 2026-08-19T10:00 | RESCHEDULED | book_ana_sala_aurora_0820 | CUSTOMER | null |

— `book_ana_sala_aurora_0820` being the new one-off booking for that replacement slot. The screen's *second* alternative ("Qui, 21 ago · 14:00–16:00 · Sala Horizonte") would assign a different room for that one occurrence only; the standing schedule's own `FIXED_ASSIGNMENT` to Sala Aurora is unaffected either way, since a reschedule replaces one occurrence's booking, not the schedule's own resource assignment.

### `booking.availability_alerts`

An expiring intent only — it creates no occupancy and never becomes a booking automatically.

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| service_id | UUID | NOT NULL — FK (tenant_id, service_id) → `services` |
| customer_id | UUID | NOT NULL — no FK, cross-context; an authenticated customer is required, so there is no guest email identity column (`CAND-46` A1) |
| preferred_resource_id | UUID | NULLABLE — FK (tenant_id, preferred_resource_id) → `resources` |
| criteria_type | VARCHAR(20) | NOT NULL — CHECK IN (`ONE_TIME_RANGE`, `WEEKLY_PREFERENCE`) |
| timezone | VARCHAR(50) | NOT NULL |
| acceptable_start_at / acceptable_end_at | TIMESTAMPTZ | NULLABLE — set iff `criteria_type = 'ONE_TIME_RANGE'` |
| weekdays | JSONB | NULLABLE — e.g. `["MON","WED"]`; set iff `criteria_type = 'WEEKLY_PREFERENCE'` |
| local_start_time / local_end_time | TIME | NULLABLE — set iff `criteria_type = 'WEEKLY_PREFERENCE'` |
| duration_minutes | INT | NULLABLE CHECK `> 0` when set |
| participant_count | INT | NULLABLE CHECK `> 0` when set |
| status | VARCHAR(20) | NOT NULL DEFAULT 'ACTIVE' — CHECK IN (`ACTIVE`, `NOTIFIED`, `CANCELLED`, `EXPIRED`) |
| expires_at | TIMESTAMPTZ | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| **CHECK** | exactly one criteria representation: `(criteria_type='ONE_TIME_RANGE' AND acceptable_start_at IS NOT NULL AND acceptable_end_at IS NOT NULL AND weekdays IS NULL AND local_start_time IS NULL AND local_end_time IS NULL) OR (criteria_type='WEEKLY_PREFERENCE' AND weekdays IS NOT NULL AND local_start_time IS NOT NULL AND local_end_time IS NOT NULL AND acceptable_start_at IS NULL AND acceptable_end_at IS NULL)` | |
| **INDEX** | (tenant_id, service_id, status) | Matched by the release-time scan that looks for alerts a newly-freed slot could satisfy |

`availability_alert_notification_attempts` — the notification history:

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| alert_id | UUID | NOT NULL — FK (tenant_id, alert_id) → `availability_alerts` |
| matching_window | TSTZRANGE | NOT NULL — the normalized concrete window that satisfied the alert |
| channel | VARCHAR(20) | NOT NULL — CHECK IN (`EMAIL`, `IN_APP`) |
| attempted_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| outcome | VARCHAR(20) | NOT NULL — e.g. `SENT`, `FAILED` |
| **UNIQUE** | (tenant_id, alert_id, matching_window, channel) | One notification per alert per matching window per channel — the dedup key `CAND-46` A2 relies on |

**Example data — two alerts, one of each `criteria_type`:**

| id | service_id | customer_id | criteria_type | acceptable_start_at | acceptable_end_at | weekdays | local_start_time | local_end_time | duration_minutes | status | expires_at |
|---|---|---|---|---|---|---|---|---|---|---|---|
| alert_ana_sala | svc_sala_reuniao | cust_ana | ONE_TIME_RANGE | 2026-08-20T10:00-03:00 | 2026-08-20T14:00-03:00 | null | null | null | 120 | ACTIVE | 2026-08-20T23:59-03:00 |
| alert_marcos_pilates | svc_pilates | cust_marcos | WEEKLY_PREFERENCE | null | null | `["MON","WED"]` | 08:00 | 09:00 | 60 | ACTIVE | 2026-09-30T23:59-03:00 |

`alert_ana_sala` is `public-12-availability-alert.html`'s own worked screen: Ana looked for a Sala de reunião slot on 2026-08-20 between 10:00 and 14:00, needing a 2-hour block ("Duração: 2 horas"), and left without reserving anything ("Nenhum horário foi reservado"). `alert_marcos_pilates` reuses `cust_marcos` — already waitlisted on `sess_pilates_0804` (`class_session_bookings` example above) — for a *different*, forward-looking intent: rather than waiting on that one specific Monday session, he wants to hear about any future Monday/Wednesday 08:00 Pilates opening, matching `tpl_pilates_estudio1`'s own recurrence pattern.

**Example data — a match found for `alert_marcos_pilates`:**

| id | alert_id | matching_window | channel | outcome |
|---|---|---|---|---|
| att_1 | alert_marcos_pilates | `[2026-08-31T08:00-03:00, 2026-08-31T09:00-03:00)` | EMAIL | SENT |

A Monday session two weeks out opens up (a cancellation, say) and matches Marcos's weekday/time preference; the system sends exactly one email for that specific window. A *different* Monday session opening the same week would be a different `matching_window` and get its own row — but the same window can never notify him twice, which is why the unique key includes `matching_window`, not just `alert_id`.

### `booking.service_resource_requirements` / `booking.service_resource_requirement_pool`

Normalizes `Service.resourceRequirements[]` (domain doc §5).

| Table | Column | Type | Constraints |
|---|---|---|---|
| `service_resource_requirements` | id | UUID | PRIMARY KEY |
| | tenant_id | UUID | NOT NULL |
| | service_id | UUID | NOT NULL — FK (tenant_id, service_id) → `services` |
| | resource_type | VARCHAR(20) | NOT NULL |
| | selection_mode | VARCHAR(30) | NOT NULL — CHECK IN (`NONE`, `CUSTOMER_CHOICE`, `AUTO_ANY`, `AUTO_FUNGIBLE_POOL`) |
| | required_quantity | INT | NOT NULL DEFAULT 1 CHECK > 0 — allocate this many distinct eligible resources atomically. |
| | **UNIQUE** | (tenant_id, service_id, resource_type) | No `requirement_index` — see §6 item 19. `resource_type` (4 fixed values) is itself a sufficient key; no worked example ever needs two requirements of the same type in one bundle. |
| | **UNIQUE** | (tenant_id, id) | Composite FK target for `service_resource_requirement_pool` — added §6 item 17, closing a tenant-isolation gap (`CLAUDE.md` §2.4) where the pool table's FK was non-composite. |
| `service_resource_requirement_pool` | tenant_id | UUID | NOT NULL |
| | requirement_id | UUID | NOT NULL — FK (tenant_id, requirement_id) → `service_resource_requirements` |
| | resource_id | UUID | NOT NULL — FK (tenant_id, resource_id) → `resources` |
| | **PK** | (tenant_id, requirement_id, resource_id) | |

Today's car wash is the degenerate case: one row, `resource_type='LOCATION'`, `selection_mode='NONE'`, empty pool.

**Example data — Massagem Relaxante** (`manager-02-service-resource-config.html`'s 3-way bundle):

`service_resource_requirements`:

| id | service_id | resource_type | selection_mode |
|---|---|---|---|
| req_1 | svc_massagem_relaxante | STAFF | CUSTOMER_CHOICE |
| req_2 | svc_massagem_relaxante | ROOM | AUTO_FUNGIBLE_POOL |
| req_3 | svc_massagem_relaxante | EQUIPMENT | AUTO_ANY |

`service_resource_requirement_pool`:

| requirement_id | resource_id | (name, for reference) |
|---|---|---|
| req_1 | res_staff_renata | Renata Souza |
| req_1 | res_staff_maria | Maria Santos |
| req_2 | res_room_terapia | Sala de Terapia |
| req_2 | res_room_sauna | Sala de Sauna |
| req_3 | res_equip_pedras | Kit de Pedras Quentes |

`req_1`'s pool restricts the STAFF slot to the two massage therapists specifically — not every `STAFF` resource at Vitta Studio (Camila, Ana, Bruno, João, Fábio are all `STAFF` too, but none are eligible here). `req_2` is a genuine fungible pool of two rooms: the slot is available if *either* is free, and the customer never learns which one was assigned.

**Example data — Sala de reunião** (a single-resource-type fungible pool, contrasting with Massagem Relaxante's 3-way bundle above): `public-11-reserva-por-tempo.html` never asks the customer to pick a room, and `customer-09-reserva-recorrente.html`'s reschedule flow offers "Sala Horizonte" as an alternative to "Sala Aurora" — both signs of `AUTO_FUNGIBLE_POOL`, not `CUSTOMER_CHOICE`:

`service_resource_requirements`:

| id | service_id | resource_type | selection_mode |
|---|---|---|---|
| req_sala_1 | svc_sala_reuniao | ROOM | AUTO_FUNGIBLE_POOL |

`service_resource_requirement_pool`:

| requirement_id | resource_id | (name, for reference) |
|---|---|---|
| req_sala_1 | res_room_aurora | Sala Aurora |
| req_sala_1 | res_room_horizonte | Sala Horizonte |

Unlike Massagem Relaxante's bundle, this is the whole requirement — one `ROOM` slot, two interchangeable candidates. Whichever room availability resolves to becomes a `booking_line_resource_assignments` row (see the worked example further below); a reschedule can land on the *other* pool member without changing anything about this requirement itself.

### `booking.service_legs` / `booking.service_leg_resource_requirements` / `booking.service_leg_resource_requirement_pool`

For `ServiceLeg[]` (domain doc §5). **Corrected from an earlier draft of this document** — see §6 item 13: a single leg can require more than one resource at once (`public-05-multi-leg-itinerary.html`'s massage leg needs both a therapist *and* a room simultaneously), so a leg can't carry one flat `resource_type`/`selection_mode` pair directly — it needs the same one-to-many shape as `service_resource_requirements`, just nested one level under a leg.

| Table | Column | Type | Constraints |
|---|---|---|---|
| `service_legs` | id | UUID | PRIMARY KEY |
| | tenant_id | UUID | NOT NULL |
| | service_id | UUID | NOT NULL — FK (tenant_id, service_id) → `services` |
| | leg_index | INT | NOT NULL — order within the itinerary |
| | name | VARCHAR(255) | NOT NULL |
| | duration_minutes | INT | NOT NULL CHECK > 0 |
| | transition_gap_after_minutes | INT | NOT NULL DEFAULT 0 |
| | **UNIQUE** | (tenant_id, service_id, leg_index) | |
| | **UNIQUE** | (tenant_id, id) | Composite FK target for `service_leg_resource_requirements` — added §6 item 17. |
| `service_leg_resource_requirements` | id | UUID | PRIMARY KEY |
| | tenant_id | UUID | NOT NULL |
| | leg_id | UUID | NOT NULL — FK (tenant_id, leg_id) → `service_legs` |
| | resource_type | VARCHAR(20) | NOT NULL |
| | selection_mode | VARCHAR(30) | NOT NULL |
| | required_quantity | INT | NOT NULL DEFAULT 1 CHECK > 0 |
| | **UNIQUE** | (tenant_id, leg_id, resource_type) | No `requirement_index` — same reasoning as `service_resource_requirements` (§6 item 19); no leg in any worked example ever needs two resources of the same type. |
| | **UNIQUE** | (tenant_id, id) | Composite FK target for `service_leg_resource_requirement_pool` — same fix, one level deeper (§6 item 17). |
| `service_leg_resource_requirement_pool` | tenant_id | UUID | NOT NULL |
| | requirement_id | UUID | NOT NULL — FK (tenant_id, requirement_id) → `service_leg_resource_requirements` |
| | resource_id | UUID | NOT NULL — FK (tenant_id, resource_id) → `resources` |
| | **PK** | (tenant_id, requirement_id, resource_id) | |

**Example data — Jornada Spa Vitta** (`svc_jornada_spa`, from `public-05-multi-leg-itinerary.html`):

`service_legs`:

| id | leg_index | name | duration_minutes | transition_gap_after_minutes |
|---|---|---|---|---|
| leg_0 | 0 | Sauna | 20 | 10 |
| leg_1 | 1 | Massagem | 50 | 5 |
| leg_2 | 2 | Sala de Relaxamento | 20 | 0 |

`service_leg_resource_requirements`:

| id | leg_id | resource_type | selection_mode |
|---|---|---|---|
| req_l0_0 | leg_0 | ROOM | AUTO_ANY |
| req_l1_0 | leg_1 | STAFF | CUSTOMER_CHOICE |
| req_l1_1 | leg_1 | ROOM | AUTO_ANY |
| req_l2_0 | leg_2 | ROOM | AUTO_ANY |

`service_leg_resource_requirement_pool`:

| requirement_id | resource_id | (name) |
|---|---|---|
| req_l0_0 | res_room_sauna | Sala de Sauna |
| req_l1_0 | res_staff_renata | Renata Souza |
| req_l1_0 | res_staff_maria | Maria Santos |
| req_l1_1 | res_room_terapia | Sala de Terapia |
| req_l2_0 | res_room_relaxamento | Sala de Relaxamento |

`leg_1` (Massagem) is the one that needed two requirement rows, not one: it locks Renata Souza (or Maria — customer's choice) **and** Sala de Terapia at the same time — the exact two resources `Massagem Relaxante`'s own bundle uses, deliberately, per `public-05`'s own comment ("same cross-service exclusivity, demonstrated from the other direction"). Total span = `Σ duration + Σ gap` = `(20+50+20) + (10+5+0)` = **105 min**, matching `public-05`'s own displayed total exactly.

### `booking.class_schedule_templates`

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| service_id | UUID | NOT NULL — FK (tenant_id, service_id) → `services` |
| recurrence | JSONB | NOT NULL — e.g. `{ "frequency": "WEEKLY", "daysOfWeek": ["MON","WED","FRI"], "startTime": "08:00" }` |
| capacity | INT | NOT NULL CHECK > 0 |
| trial_slots | INT | NOT NULL DEFAULT 0 CHECK (trial_slots >= 0 AND trial_slots <= capacity) — guest seats that auto-confirm before `CAND-34` manual approval kicks in; snapshotted to `class_sessions.trial_slots` at generation (`CAND-13`), same pattern as `capacity`. Added 2026-08-21, replacing the earlier global `services.guest_approval_mode` — see §6 item 20. |
| valid_from | DATE | NULLABLE |
| valid_until | DATE | NULLABLE |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at / updated_at | TIMESTAMPTZ | DEFAULT now() |
| **UNIQUE** | (tenant_id, id) | |
| **CHECK** | valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from | |
| **INDEX** | (tenant_id, service_id, is_active) | |
| **INVARIANT** | at most `MAX_ACTIVE_TEMPLATES_PER_RESOURCE = 50` active templates reference any one resource (via `class_schedule_template_slots`) | App-enforced, not a DB constraint — cross-table count. `CAND-11` A4. Added 2026-08-28, see §6 item 43. |

**Example data:**

| id | service_id | recurrence | capacity | trial_slots | valid_from | valid_until | is_active |
|---|---|---|---|---|---|---|---|
| tpl_pilates_estudio1 | svc_pilates | `{"frequency":"WEEKLY","daysOfWeek":["MON","WED","FRI"],"startTime":"08:00"}` | 4 | 1 | null | null | true |
| tpl_crossfit_fabio | svc_crossfit | `{"frequency":"WEEKLY","daysOfWeek":["TUE","THU"],"startTime":"18:00"}` | 20 | 3 | 2026-08-01 | 2026-09-30 | true |

`tpl_pilates_estudio1`'s low `trial_slots = 1` reflects a small, popular 08:00 class — see `class_session_bookings`' `sb_3` example below for the confirm/pending split this produces in practice. `tpl_crossfit_fabio`'s larger capacity affords more walk-in room, `trial_slots = 3`.

`tpl_crossfit_fabio` is Fábio Ramos's template already shown on `manager-03-class-templates.html` ("até 30/09/2026 (turma de 6 semanas)") — a concrete `valid_until` in use, not a hypothetical one.

### `booking.service_class_resource_pool`

The eligible-resource pool for a SESSION-model service's slots — declared **once per service**, shared by every `ClassScheduleTemplate` of that service. **Corrected from an earlier draft of this document** — see §6 item 15: the pool was originally scoped to `template_id`, which had two real problems (no `CAND` ever populated it, and it forced re-curating the same eligibility list separately for every template of the same service). Scoping to `service_id` instead reuses the same "who's eligible" question the flat/APPOINTMENT case already answers via `service_resource_requirements`/pool — just without a `selection_mode`, since nothing here resolves dynamically per booking; a template's slot is picked once, manually, by a manager (CAND-11), from this pool.

| Column | Type | Constraints |
|---|---|---|
| tenant_id | UUID | NOT NULL |
| service_id | UUID | NOT NULL — FK (tenant_id, service_id) → `services` |
| resource_type | VARCHAR(20) | NOT NULL — denormalized from `resources.type` (derivable via `resource_id`); kept directly so the row is self-describing without a join when rendering the picker. Also the natural key — see §6 item 19: no `slot_index` needed, since no worked example ever needs two eligible-pool slots of the same type for one service |
| resource_id | UUID | NOT NULL — FK (tenant_id, resource_id) → `resources` |
| **PK** | (tenant_id, service_id, resource_type, resource_id) | |
| **INDEX** | (tenant_id, service_id, resource_type) | Feeds the "who's eligible" picker on `manager-06-criar-turma.html` |

**Example data — Aula de Pilates and CrossFit:**

| service_id | resource_type | resource_id | (name) |
|---|---|---|---|
| svc_pilates | STAFF | res_staff_camila | Camila Duarte |
| svc_pilates | STAFF | res_staff_ana | Ana Beatriz |
| svc_pilates | ROOM | res_room_estudio1 | Estúdio 1 |
| svc_pilates | ROOM | res_room_estudio2 | Estúdio 2 |
| svc_crossfit | STAFF | res_staff_bruno | Bruno Alves |
| svc_crossfit | STAFF | res_staff_joao | João Mendes |
| svc_crossfit | STAFF | res_staff_fabio | Fábio Ramos |
| svc_crossfit | ROOM | res_room_crossfit | Área CrossFit |
| svc_crossfit | EQUIPMENT | res_equip_halteres_r1 | Kit Halteres (Rack 1) |
| svc_crossfit | EQUIPMENT | res_equip_halteres_r2 | Kit Halteres (Rack 2) |

Filled on `manager-02-service-resource-config.html` — the same screen and checklist mechanism `CAND-06` step 3 already uses for the flat case, extended to also cover the `SESSION` branch instead of showing only a static handoff card.

### `booking.class_schedule_template_slots`

The template's own resolved pick per slot — one specific answer, not a list. Each row's `resource_id` must be a member of `service_class_resource_pool` for that same `(service_id, resource_type)` — app-enforced, not a DB constraint (Postgres can't express a cross-table CHECK), same pattern as this codebase's other aggregate-enforced invariants.

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| template_id | UUID | NOT NULL — FK (tenant_id, template_id) → `class_schedule_templates` |
| resource_type | VARCHAR(20) | NOT NULL — denormalized from `resources.type` (derivable via `resource_id`), same reasoning as `service_class_resource_pool` above. Also the natural key — no `slot_index` needed, see §6 item 19 |
| resource_id | UUID | NOT NULL — FK (tenant_id, resource_id) → `resources`; the one resource actually assigned to this template's slot |
| **UNIQUE** | (tenant_id, template_id, resource_type) | |

**Example data — Pilates (2 slots, no equipment) vs. CrossFit (3 slots):**

| template_id | resource_type | resource_id |
|---|---|---|
| tpl_pilates_estudio1 | STAFF | res_staff_camila |
| tpl_pilates_estudio1 | ROOM | res_room_estudio1 |
| tpl_crossfit_fabio | STAFF | res_staff_fabio |
| tpl_crossfit_fabio | ROOM | res_room_crossfit |
| tpl_crossfit_fabio | EQUIPMENT | res_equip_halteres_r1 |

Camila was picked for `tpl_pilates_estudio1` even though Ana was also eligible (both are in `svc_pilates`'s shared pool above); Fábio was picked for this CrossFit template even though Bruno and João were also eligible — matching `manager-03`'s "(1 de 3 elegíveis)" text exactly, and the same pool any *other* future CrossFit template would draw from too. Note Pilates has **no** `EQUIPMENT` row at all — no equipment slot, because nothing about Pilates is independently contended beyond the room's own fixed capacity (see the STAFF+ROOM-only discussion earlier in this conversation).

### `booking.class_sessions`

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| template_id | UUID | NOT NULL — FK (tenant_id, template_id) → `class_schedule_templates`; ad-hoc sessions are deliberately out of scope |
| service_id | UUID | NOT NULL — FK (tenant_id, service_id) → `services`; denormalized from the template for service listing/filtering, aggregate-validated to match it |
| start_time / end_time | TIMESTAMPTZ | NOT NULL — CHECK end_time > start_time |
| capacity | INT | NOT NULL CHECK > 0 |
| reserved_count | INT | NOT NULL DEFAULT 0 CHECK (reserved_count >= 0 AND reserved_count <= capacity) — counts `CONFIRMED` + `PENDING_APPROVAL` + capacity-holding `PROMOTION_PENDING` attendee seats |
| trial_slots | INT | NOT NULL DEFAULT 0 CHECK (trial_slots >= 0 AND trial_slots <= capacity) — snapshotted from `class_schedule_templates.trial_slots` at generation (`CAND-13`); admin can override per-instance (`CAND-14`), same pattern as `capacity`. Added 2026-08-21. |
| reserved_non_member_count | INT | NOT NULL DEFAULT 0 CHECK (reserved_non_member_count >= 0 AND reserved_non_member_count <= reserved_count) — non-member subset of `reserved_count`, atomically maintained by the guarded update. |
| status | VARCHAR(30) | NOT NULL DEFAULT 'SCHEDULED' — CHECK IN (`SCHEDULED`, `AWAITING_ATTENDANCE`, `CANCELLED`, `CLOSED`) |
| version | INT | NOT NULL DEFAULT 1 — optimistic-lock guard, mirrors `bookings.version` |
| created_at / updated_at | TIMESTAMPTZ | DEFAULT now() |
| **UNIQUE** | (tenant_id, id) | |
| **UNIQUE** | (tenant_id, template_id, start_time) WHERE template_id IS NOT NULL | CAND-13's idempotency key |
| **INDEX** | (tenant_id, service_id, start_time) | |
| **INDEX** | (tenant_id, status, start_time) | |

**Example data:**

| id | template_id | service_id | start_time | end_time | capacity | reserved_count | trial_slots | reserved_non_member_count | status |
|---|---|---|---|---|---|---|---|---|---|
| sess_pilates_0804 | tpl_pilates_estudio1 | svc_pilates | 2026-08-04T08:00-03:00 | 2026-08-04T09:00-03:00 | 4 | 4 | 1 | 2 | SCHEDULED |

Same session shown in `staff-02-session-roster.html`. Its roster card currently displays "3 de 4 vagas preenchidas" (75% bar) — but summing the actual attendee quantities (see `class_session_bookings` example below) gives 4, i.e. genuinely full. That display text/bar is a real bug in the prototype, found while grounding this example — flagged separately from this discovery's own scope.

### `booking.class_session_resources`

Per-instance snapshot/override of the template's resolved slots (CAND-14): `tenant_id, class_session_id, resource_type, resource_id` — `PK (tenant_id, class_session_id, resource_type)`, FK `(tenant_id, class_session_id)` → `class_sessions`, FK `(tenant_id, resource_id)` → `resources`. No `slot_index` — same reasoning as the other slot/pool tables, §6 item 19.

**Example data:**

| class_session_id | resource_type | resource_id |
|---|---|---|
| sess_pilates_0804 | STAFF | res_staff_camila |
| sess_pilates_0804 | ROOM | res_room_estudio1 |

Snapshotted straight from `tpl_pilates_estudio1`'s slots at generation time. CAND-14 (e.g. "instructor injury, swap the room today only") would update just this row — `tpl_pilates_estudio1` itself, and every *other* session it generates, stay untouched.

### `booking.booking_line_resource_assignments` and `booking.resource_occupancy`

`booking_line_resource_assignments` is the immutable business/audit record for an appointment/reservation's resolved resources: `id, tenant_id, booking_line_id, resource_id, resource_type, leg_index NULL, quantity_position NULL, resource_name_at_assignment, assigned_at`. It has composite FKs to `booking_lines` and `(tenant_id, resource_id, resource_type)`, and a null-safe unique key `(tenant_id, booking_line_id, resource_id, COALESCE(leg_index, -1), COALESCE(quantity_position, -1))`. It is retained with the booking and supports BI such as resource utilization and professional history.

**Example data:**

| id | booking_line_id | resource_id | resource_type | leg_index | quantity_position | resource_name_at_assignment |
|---|---|---|---|---|---|---|
| assign_corte_bruna_camila | line_corte_bruna | res_staff_camila | STAFF | null | null | Camila Duarte |
| assign_ana_sala_aurora_0818 | line_ana_sala_aurora_0818 | res_room_aurora | ROOM | null | null | Sala Aurora |

`assign_corte_bruna_camila` is Bruna's `Corte + Escova` booking line, Tuesday 2026-08-05 14:00–14:45 — the exact window `resource_occupancy`'s `occ_3` example below locks, and the row that example's own `booking_line_resource_assignment_id` column has referenced by ID since §2's opening. `assign_ana_sala_aurora_0818` is the ROOM the fungible pool above resolved to for Ana's 2026-08-18 10:00–12:00 booking. `resource_name_at_assignment` is the immutable display snapshot in both cases: if `res_staff_camila.name` or `res_room_aurora.name` were edited later, these rows would still read "Camila Duarte"/"Sala Aurora" — the same snapshot discipline `class_session_bookings.service_name_at_booking` already applies to `Service` renames.

`resource_occupancy` is the separate short-lived locking mechanism. It references the durable assignment for appointment rows and `class_session_resources` for class rows; after its window has elapsed it can be safely garbage-collected without erasing the business assignment.

**The single physical mechanism that makes cross-family resource exclusivity (CAND-31, model 13) DB-enforceable.** See §5 for why this table has to exist and why it has to be shared by both families rather than split per-family.

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| resource_id | UUID | NOT NULL — FK (tenant_id, resource_id) → `resources` |
| source_type | VARCHAR(20) | NOT NULL — CHECK IN (`BOOKING_LINE`, `CLASS_SESSION`) |
| booking_line_resource_assignment_id | UUID | NULLABLE — FK (tenant_id, booking_line_resource_assignment_id) → `booking_line_resource_assignments`; set iff `source_type = 'BOOKING_LINE'` |
| leg_index | INT | NULLABLE — null for flat (non-legged) services |
| class_session_id | UUID | NULLABLE — FK (tenant_id, class_session_id) → `class_sessions`; set iff `source_type = 'CLASS_SESSION'` |
| resource_name_at_assignment | VARCHAR(255) | NOT NULL — immutable display snapshot for either family |
| starts_at / ends_at | TIMESTAMPTZ | NOT NULL — `ends_at` is the physical blocked end, including the effective service buffer/resource turnover |
| lock_state | VARCHAR(20) | NOT NULL — `HOLD` or `COMMITTED`; a HOLD belongs to a pending manual-approval booking and has `hold_expires_at`, while COMMITTED lasts through the physical end window |
| hold_expires_at | TIMESTAMPTZ | NULLABLE — required iff `lock_state = 'HOLD'` |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| **CHECK** | (source_type='BOOKING_LINE' AND booking_line_resource_assignment_id IS NOT NULL AND class_session_id IS NULL) OR (source_type='CLASS_SESSION' AND class_session_id IS NOT NULL AND booking_line_resource_assignment_id IS NULL) | |
| **CHECK** | `(lock_state = 'HOLD' AND hold_expires_at IS NOT NULL) OR (lock_state = 'COMMITTED' AND hold_expires_at IS NULL)` | Prevents a permanent hold or an expiring committed allocation. |
| **CHECK** | `ends_at > starts_at` | No zero/negative occupancy window |
| **EXCLUDE USING gist** | (tenant_id WITH =, resource_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (`lock_state IN ('HOLD','COMMITTED')`) | The exclusivity guarantee itself; expiry removes HOLD rows before they can participate |
| **INDEX** | (tenant_id, resource_id, starts_at) | |

**Example data:**

| id | resource_id | source_type | booking_line_resource_assignment_id | class_session_id | starts_at | ends_at | lock_state |
|---|---|---|---|---|---|---|---|
| occ_1 | res_staff_camila | CLASS_SESSION | null | sess_pilates_0804 | 2026-08-04T08:00 | 2026-08-04T09:00 | COMMITTED |
| occ_2 | res_room_estudio1 | CLASS_SESSION | null | sess_pilates_0804 | 2026-08-04T08:00 | 2026-08-04T09:00 | COMMITTED |
| occ_3 | res_staff_camila | BOOKING_LINE | assign_corte_bruna_camila | null | 2026-08-05T14:00 | 2026-08-05T14:45 | COMMITTED |
| occ_4 | res_room_aurora | BOOKING_LINE | assign_ana_sala_aurora_0818 | null | 2026-08-18T10:00 | 2026-08-18T12:00 | HOLD |

`occ_1` and `occ_3` both reference `res_staff_camila`, but at non-overlapping times (Monday 08:00–09:00 vs. Tuesday 14:00–14:45), so no constraint violation. If a haircut request landed right on top of her Pilates class — say Monday 08:00–08:30 — a fourth row here would collide with `occ_1` on the shared GIST exclusion constraint and get rejected at the DB level, regardless of which family (`BOOKING_LINE` vs. `CLASS_SESSION`) is asking. This is the Camila Duarte scenario from domain doc §6, made concrete and DB-enforced.

`occ_4` is the one row here showing `lock_state = 'HOLD'` rather than `COMMITTED` — Sala de reunião is `MANUAL_APPROVAL` (§10 below), so `public-13-pending-approval.html`'s own displayed copy ("A Sala Aurora fica indisponível para outras pessoas até **10:30**") is this row's `hold_expires_at` made visible to the customer: booked at 10:00, held until 10:30. If nobody approves it by then, an expiry worker cancels the hold and releases `res_room_aurora` for that window — exactly what the screen's third numbered step promises ("Se não houver resposta até 10:30, liberamos o horário").

### `booking.class_session_bookings`

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| class_session_id | UUID | NOT NULL — FK (tenant_id, class_session_id) → `class_sessions` |
| service_id | UUID | NOT NULL — FK (tenant_id, service_id) → `services`; denormalized from `class_sessions.service_id`, same query-convenience rationale already established there (§6 item 16) — feeds `CAND-39`'s "list matrículas for this class type" without joining through `class_sessions`. Added 2026-08-21. |
| type | VARCHAR(20) | NOT NULL — CHECK IN (`GUEST`, `CUSTOMER`) — mirrors `bookings.type` (see §6 item 3) |
| customer_id | UUID | NULLABLE — no FK, cross-context |
| contact_email / contact_name / contact_phone | VARCHAR | NOT NULL — mirrors `bookings`' contact fields (see §6 item 3) |
| normalized_contact_email / email_verified_at | VARCHAR / TIMESTAMPTZ | Required normalized email; verification is required before a guest request can reserve capacity |
| quantity | INT | NOT NULL DEFAULT 1 CHECK > 0 — equals its attendee-row count, aggregate-enforced |
| status | VARCHAR(35) | NOT NULL — CHECK IN (`PENDING_EMAIL_VERIFICATION`, `PENDING_APPROVAL`, `CONFIRMED`, `WAITLISTED`, `PROMOTION_PENDING`, `CANCELLED`, `CLOSED`); `PROMOTION_PENDING` holds capacity |
| series_id | UUID | NULLABLE — FK (tenant_id, series_id) → `recurring_enrollments` |
| contract_id | UUID | NULLABLE — FK (tenant_id, contract_id) → `class_access_contracts`; set for contract-backed CUSTOMER rows (`CAND-22`/`CAND-26`), null for GUEST rows **and** for pay-per-class CUSTOMER rows (`CAND-22b`, added 2026-08-21 — no longer "mandatory for CUSTOMER rows," see the invariant note below) |
| payment_source | VARCHAR(20) | NOT NULL — CHECK IN (`CONTRACT`, `GUEST_TRIAL`, `IN_PERSON`) |
| waitlist_access_intent | VARCHAR(20) | NULLABLE — CHECK IN (`CONTRACT`, `IN_PERSON`); required for `WAITLISTED`/`PROMOTION_PENDING` CUSTOMER rows, records the one-seat path selected in CAND-24 and is revalidated at offer acceptance |
| created_by_staff_id | UUID | NULLABLE — no FK, cross-context ref to `staff.staff`; set when a manager creates this booking on a customer's behalf (`CAND-40`), same `<action>_by` audit-trail pattern as `bookings.approved_by`/`cancelled_by`. Null for self-service bookings. Added 2026-08-21, see §6 item 25. |
| service_name_at_booking | VARCHAR(255) | NOT NULL — snapshot (see §6 item 1) |
| unit_price_at_booking_amount / total_price_at_booking_amount | NUMERIC(10,2) | NOT NULL — `total = unit × quantity`, both snapshotted |
| points_value_per_unit_at_booking | INT | NOT NULL DEFAULT 0 — snapshot; eligible customer earns `points × quantity` only on attendance |
| rescheduled_from_id | UUID | NULLABLE — FK (tenant_id, rescheduled_from_id) → `class_session_bookings` (self-referencing); set when this booking is a "reposição" replacement (`CAND-38`) for a skipped `RecurringEnrollment` occurrence. Added 2026-08-21, see §6 item 21. |
| closed_at / cancelled_at | TIMESTAMPTZ | NULLABLE |
| created_at / updated_at | TIMESTAMPTZ | DEFAULT now() |
| **UNIQUE** | (tenant_id, id) | |
| **INDEX** | (tenant_id, class_session_id, status) | |
| **INDEX** | (tenant_id, customer_id) | |
| **INDEX** | (tenant_id, service_id, status) | `CAND-39` — matrículas list scoped to one class type, added 2026-08-21 |
| **UNIQUE** | `(tenant_id, series_id, class_session_id)` WHERE `series_id IS NOT NULL` | Idempotent recurring-enrollment materialization |
| **UNIQUE** | `(tenant_id, class_session_id, customer_id)` WHERE `customer_id IS NOT NULL AND status IN ('PENDING_APPROVAL','CONFIRMED','WAITLISTED','PROMOTION_PENDING')` | No duplicate active customer reservation |
| **UNIQUE** | `(tenant_id, rescheduled_from_id)` WHERE `rescheduled_from_id IS NOT NULL` | One replacement per skipped occurrence — no double make-up |

**Actor/payment shape invariant — relaxed 2026-08-21 for `CAND-22b` (see §6 item 23).** A `CUSTOMER` reservation has one attendee and is either (a) contract-backed: non-null `contract_id`, `payment_source = CONTRACT` (`CAND-22`/`CAND-26`), or (b) pay-per-class: `contract_id IS NULL`, `payment_source = IN_PERSON` (`CAND-22b` — an authenticated customer with no membership, subject to the same `trial_slots` capacity-protection check a `GUEST` reservation is, but *not* the `guest_trial_policy` free-trial entitlement, and *does* earn loyalty points unlike a guest). A `WAITLISTED`/`PROMOTION_PENDING` CUSTOMER row has `quantity = 1` and a `waitlist_access_intent` of `CONTRACT` or `IN_PERSON`; `contract_id` is present only for the first. A `GUEST` reservation has no `customer_id`/`contract_id`; a solo guest may use `GUEST_TRIAL`, while every guest group is `IN_PERSON`. Encode the row-local parts as a table `CHECK`; validate the active-contract/service/date match (when a contract is claimed) in the aggregate transaction.

**Deliberately no `waitlist_position` column** — queue order is derived from `created_at`. `WAITLISTED` is an authenticated-customer state only: an anonymous guest whose verification completes after a session fills is offered login/account creation rather than a waitlist row. `reserved_count` is updated with a guarded SQL UPDATE in the same transaction as every capacity-holding transition; it never relies on TypeORM's version column alone.

**Example data — the roster on `sess_pilates_0804`, matching `staff-02-session-roster.html`, every column filled in:**

| id | class_session_id | service_id | type | customer_id | contact_name | quantity | status | series_id | service_name_at_booking | total_price_at_booking_amount | points_value_per_unit_at_booking |
|---|---|---|---|---|---|---|---|---|---|---|---|
| sb_1 | sess_pilates_0804 | svc_pilates | CUSTOMER | cust_fernanda | Fernanda Lima | 1 | CONFIRMED | null | Aula de Pilates | 60.00 | 1 |
| sb_2 | sess_pilates_0804 | svc_pilates | CUSTOMER | cust_roberta | Roberta Dias | 1 | CONFIRMED | enroll_roberta | Aula de Pilates | 60.00 | 1 |
| sb_3 | sess_pilates_0804 | svc_pilates | GUEST | null | Ana & Bia (grupo) | 2 | PENDING_APPROVAL | null | Aula de Pilates | 120.00 | 0 |
| sb_4 | sess_pilates_0804 | svc_pilates | CUSTOMER | cust_marcos | Marcos Tanaka | 1 | WAITLISTED | null | Aula de Pilates | 60.00 | 1 |

`sb_3` is the multi-unit guest case: one reservation, two named attendee rows, and a staff decision made once for the group. It holds capacity while pending approval, so `1 + 1 + 2 = 4 = capacity` and authenticated customer `sb_4` is correctly waitlisted. Its `PENDING_APPROVAL` status is `trial_slots` in action, not just capacity: before `sb_3`, `sess_pilates_0804.reserved_non_member_count = 0`; `sb_3`'s 2 guest units would push it to 2, past `tpl_pilates_estudio1`'s `trial_slots = 1`, so it lands in `PENDING_APPROVAL` regardless of whether the session still had room. Attendance belongs to attendee rows; the parent transitions to `CLOSED` only after staff closes the session out.

### `booking.recurring_enrollments`

`id, tenant_id, customer_id, contract_id, template_id, service_id, start_date, end_date (nullable), status (ACTIVE|PAUSED|CANCELLED), created_by_staff_id (nullable)` — `UNIQUE(tenant_id, id)`, composite FK `(tenant_id, contract_id)` → `class_access_contracts`, FK `(tenant_id, template_id)` → `class_schedule_templates`, FK `(tenant_id, service_id)` → `services`, `INDEX(tenant_id, customer_id, status)`, `INDEX(tenant_id, template_id, status)`, `INDEX(tenant_id, service_id, status)`. Customer-only: a guest cannot own a standing enrollment. The explicit `contract_id` makes expiry/cancellation dependency auditable; creation validates `end_date <= contract.ends_on`. Contract expiry or cancellation ends the enrollment and its future reservations. A later contract never revives it implicitly. **Added 2026-08-21:** `service_id` — denormalized from `template_id`, same rationale as `class_session_bookings.service_id` above, feeds `CAND-39`'s "Séries ativas" tab without joining through `class_schedule_templates` (a service can have more than one template, model #6). `created_by_staff_id` — same `<action>_by` audit pattern as `class_session_bookings.created_by_staff_id`, set when a manager creates the standing enrollment on a customer's behalf (`CAND-40`).

**Example data:**

| id | customer_id | template_id | service_id | start_date | end_date | status | created_by_staff_id |
|---|---|---|---|---|---|---|---|
| enroll_roberta | cust_roberta | tpl_pilates_estudio1 | svc_pilates | 2026-07-01 | null | ACTIVE | null |

`sb_2` above carries `series_id = enroll_roberta` — Roberta's Monday slot is generated automatically every week this enrollment stays `ACTIVE` (CAND-26), rather than her booking one-off each time the way Fernanda (`sb_1`, `series_id = null`) does.

### Contract, attendee, trial, and template-exception tables

| Table | Shape and invariant |
|---|---|
| `booking.class_access_contracts` | Minimal eligibility record only: `id, tenant_id, customer_id, starts_on, ends_on, status (ACTIVE|CANCELLED|EXPIRED), cancelled_at` — `PRIMARY KEY (id)`, `UNIQUE(tenant_id, id)`, `INDEX(tenant_id, customer_id, status)`. It deliberately has no plan, price, invoice or renewal fields; those belong to the deferred contracts discovery. |
| `booking.class_access_contract_services` | `tenant_id, contract_id, customer_id, service_id, starts_on, ends_on, status` with composite FK to the contract/services, `UNIQUE(tenant_id, contract_id, service_id)`, and `EXCLUDE USING gist (tenant_id WITH =, customer_id WITH =, service_id WITH =, daterange(starts_on, ends_on, '[]') WITH &&) WHERE status='ACTIVE'`. It allows one contract to cover several services and allows overlapping contracts only when their service eligibility does not overlap. |
| `booking.class_session_booking_attendees` | `id, tenant_id, class_session_booking_id, name, customer_id NULL, attendance NULL|PRESENT|NO_SHOW`; FK `(tenant_id, class_session_booking_id)` → `class_session_bookings`. **`+ INDEX(tenant_id, class_session_booking_id)` — added 2026-08-21, found missing on DBA-level review.** Postgres does not auto-index FK columns; without this, every roster/close-out read (fetch all attendees for a session's bookings) and every cascade check on the parent scans the whole table. `quantity` equals attendee count in the aggregate. A contract customer has exactly one attendee row; guest groups have one row per named person. |
| `booking.guest_class_booking_email_verifications` | `id, tenant_id, class_session_booking_id, token_hash, expires_at, verified_at`. `UNIQUE(tenant_id, token_hash)`, `INDEX(tenant_id, class_session_booking_id)`, and a partial unique active draft key `(tenant_id, class_session_id, normalized_contact_email) WHERE status='PENDING_EMAIL_VERIFICATION'` on the parent booking prevent duplicate verification drafts for the same guest/session. Only a hash of the one-time token is stored. A guest booking moves from `PENDING_EMAIL_VERIFICATION` only after verification; that pre-verification state does not reserve capacity. |
| `booking.guest_class_trial_redemptions` | `tenant_id, normalized_email, class_session_booking_id, approved_at` — `PRIMARY KEY (tenant_id, normalized_email)`. Inserted atomically only for a solo (`quantity = 1`) guest booking at confirmation, so a tenant-wide first-free trial is consumed exactly once. A guest group is always `IN_PERSON` payable. |
| `booking.class_schedule_template_exceptions` | `id, tenant_id, template_id, starts_on, ends_on, kind='CANCELLED', created_by` — `INDEX(tenant_id, template_id)`. A bounded cancellation persists here, so generation cannot recreate cancelled future occurrences. A one-off session cancellation remains a session action; from-date-forward updates `valid_until`/deactivates the template and cancels materialized future sessions. |

**The four `+`-marked fixes above share one root cause, worth stating explicitly rather than leaving as four unrelated fixes:** this whole table switched to a compact one-line-per-table format instead of the fully-worked-out shape §2's earlier tables get (dedicated table, explicit `INDEX` rows, worked example) — and every skipped index lived in exactly the tables that got the compact treatment. The compactness wasn't a neutral formatting choice; it's what let these slip through. See §6 item 26.

**Example data — `class_session_booking_attendees`, the two named people inside `sb_3`'s guest group** (`class_session_bookings` example above):

| id | class_session_booking_id | name | customer_id | attendance |
|---|---|---|---|---|
| att_sb3_1 | sb_3 | Ana | null | null |
| att_sb3_2 | sb_3 | Bia | null | null |

`sb_3.quantity = 2` equals this row count, aggregate-enforced. `attendance` stays `null` until `staff-02b-fechar-turma.html` closes the session — a mixed outcome (one `PRESENT`, one `NO_SHOW`) is exactly why attendance lives here and not on the parent `class_session_bookings` row.

**Example data — `guest_class_booking_email_verifications`, the same `sb_3` guest group:**

| id | class_session_booking_id | token_hash | expires_at | verified_at |
|---|---|---|---|---|
| ver_sb3 | sb_3 | sha256:8f2a… | 2026-08-03T12:30-03:00 | 2026-08-03T12:11-03:00 |

`sb_3` is already `PENDING_APPROVAL`, not `PENDING_EMAIL_VERIFICATION` — that earlier status only exists before `verified_at` is set, which this row shows happened about 19 minutes before the token's own expiry. Only the hash is ever stored; the raw one-time token that was actually emailed to the guest never touches the database.

**Example data — `guest_class_trial_redemptions`, a solo guest trial on a different session** (`tpl_crossfit_fabio`, not `sess_pilates_0804` — that one's already full):

| normalized_email | class_session_booking_id | approved_at |
|---|---|---|
| diego.martins@email.com | sb_diego_crossfit | 2026-08-06T18:04-03:00 |

Diego Martins books a solo (`quantity = 1`) CrossFit trial and it confirms — `GUEST_TRIAL`, consuming this tenant's one-per-email free trial for `diego.martins@email.com` for good. A second solo trial attempt from the same email, for any service, at any future date, is rejected by this table's own `PRIMARY KEY (tenant_id, normalized_email)` before it ever reaches capacity logic.

**Example data — `class_schedule_template_exceptions`, a bounded CrossFit cancellation:**

| id | template_id | starts_on | ends_on | kind | created_by |
|---|---|---|---|---|---|
| tpl_exc_1 | tpl_crossfit_fabio | 2026-09-15 | 2026-09-19 | CANCELLED | staff_fabio_id |

Fábio takes a week off; every CrossFit occurrence `tpl_crossfit_fabio` would otherwise generate in that window is skipped at generation time — the generator never creates them, so there's nothing for a manager to cancel one-by-one afterward. Outside that window, generation resumes exactly as before; `tpl_crossfit_fabio.valid_until` (2026-09-30) is unaffected. Occurrences that were *already* materialized before this exception was created are a different problem — see `future_commitment_exceptions` in §10.

`class_access_contracts` are eligibility records, not online-payment records. Their successful creation/payment is outside this discovery. A customer session booking is either contract-backed with a matching active contract on the session date, or—when the service allows it—pay-per-class with an external/manual settlement intent and an optional operational record at close-out. Guest bookings use the configured guest policy; any charge is handled externally and may be recorded manually.

**Worked example — mixed-modality contract, added 2026-08-21 to ground Preset F ("Estúdio Misto," `multivertical-booking_ONBOARDING_PRESETS.md`).** A studio owner offering Pilates + CrossFit sells `cust_roberta` a single contract covering both, unmodified — `eligibleServiceIds` is already an array:

| `class_access_contracts` | `class_access_contract_services` |
|---|---|
| `id=contract_combo_roberta`, `customer_id=cust_roberta`, `starts_on=2026-08-01`, `ends_on=2026-08-31`, `status=ACTIVE` | `(contract_combo_roberta, svc_pilates)`, `(contract_combo_roberta, svc_crossfit)` |

Pricing/tiering for a bundle like this is out of scope, same as every other payment concern in this discovery — not addressed here beyond confirming the eligibility side already works.

---

## 3. Modified tables

| Table | Change |
|---|---|
| `booking.services` | `+ booking_model VARCHAR(20) NOT NULL DEFAULT 'APPOINTMENT'` (CHECK IN `APPOINTMENT`\|`SESSION`), `+ buffer_after_minutes INT NULLABLE`, and SESSION-only guest policy (`guest_access_enabled`, `guest_trial_policy NONE\|FIRST_FREE_PER_EMAIL`). Authenticated access supports both contract-backed and, when the service allows drop-in, pay-per-class paths. **`guest_approval_mode MANUAL\|AUTO` removed (2026-08-21)** — replaced by per-template/per-session `trial_slots` (§2 above), see §6 item 20. **`+ class_catalog_color VARCHAR(7) NULLABLE` (hex, e.g. `#2563eb`), `+ class_catalog_allows_drop_in BOOLEAN NOT NULL DEFAULT true`, `+ class_catalog_allows_series BOOLEAN NOT NULL DEFAULT true` — added 2026-08-21, SESSION-only**. APPOINTMENT services additionally own `duration_policy FIXED|CUSTOMER_SELECTED`, minimum/maximum/increment duration, `pricing_policy FIXED|PER_TIME_INCREMENT`, optional minimum charge, participant/named-attendee requirement, intake-schema version, approval mode/hold duration, cancellation/reschedule windows, minimum notice, maximum advance, recurrence eligibility and availability-alert eligibility. Tenant values are defaults; every booking snapshots its effective policy. |
| `platform.tenants.settings.booking` | `+ classCancellationWindowHours INT` — non-negative tenant setting, distinct from private-appointment `cancellationWindowHours`; enforced for customer cancellation of a confirmed one-off class reservation. `+ classSkipWindowHours INT` (2026-08-21) — same shape, enforced by `CAND-27` when skipping a single recurring-enrollment occurrence; deliberately separate from `classCancellationWindowHours` (see §6 item 22). `+ classAllowsReschedule BOOLEAN NOT NULL DEFAULT false`, `+ classRescheduleWindowDays INT NULLABLE`, `+ classMaxReschedulesPerCycle INT NULLABLE` (2026-08-21) — "reposição" config governing `CAND-38`; `classMaxReschedulesPerCycle` unlimited when null (see §6 item 21). |
| `booking.schedule_closures` | `+ resource_id UUID NULLABLE` (FK when set). No constraint trap — today's overlap rule is already app-enforced, not a DB unique, so it extends cleanly to resource scope. |
| `booking.schedule_openings` | `+ resource_id UUID NULLABLE` (FK when set). **Constraint trap:** today's `UNIQUE(tenant_id, date)` silently stops enforcing "one opening per date" once `resource_id` is nullable — Postgres treats `NULL ≠ NULL`, so two tenant-wide openings for the same date would no longer collide. Replace with `UNIQUE(tenant_id, date) WHERE resource_id IS NULL` **and** `UNIQUE(tenant_id, resource_id, date) WHERE resource_id IS NOT NULL`. |
| `booking.bookings` | `+ intake_schema_version INT NULLABLE`, `+ intake_answers JSONB NULLABLE` — immutable snapshot pair, both null or both set together (`CHECK (intake_schema_version IS NULL) = (intake_answers IS NULL)`); `+ participant_count INT NULLABLE CHECK > 0 when set`, `+ consent_accepted_at TIMESTAMPTZ NULLABLE`, `+ consent_version INT NULLABLE`; add terminal `NO_SHOW` to the appointment lifecycle with an append-only transition/audit record. **Not new:** `pickup_address JSONB` and `services.requires_pickup_address` already exist in the live schema (`docs/13-DATABASE_SCHEMA.md:227`/`:207`) — a `PICKUP_ADDRESS`-typed intake question (§2 above) projects its answer into that existing column rather than adding a duplicate one. |
| `loyalty.loyalty_entries` (different context — see §6 item 2, correction in §6 item 24) | `booking_id` **and** `booking_line_id` → both NULLABLE (both are NOT NULL today — the original entry here only widened `booking_line_id`, an oversight caught 2026-08-21: `docs/13-DATABASE_SCHEMA.md`'s real schema has `booking_id UUID NOT NULL` too, and the worked example below always needed both null together), `+ class_session_booking_id UUID NULLABLE`, `+ CHECK CHK_loyalty_entries_source_exclusive: (booking_id IS NOT NULL AND booking_line_id IS NOT NULL AND class_session_booking_id IS NULL) OR (booking_id IS NULL AND booking_line_id IS NULL AND class_session_booking_id IS NOT NULL)`, `+ UNIQUE(tenant_id, class_session_booking_id) WHERE class_session_booking_id IS NOT NULL` (the existing `UNIQUE(tenant_id, booking_line_id)` idempotency constraint needs no change — Postgres already permits multiple NULLs under a plain UNIQUE, so it keeps enforcing uniqueness only among non-null values). |
| `booking.booking_lines` | `+ UNIQUE(tenant_id, line_id)` — today only `PRIMARY KEY (line_id)` exists; required so `resource_occupancy.booking_line_id`'s composite FK `(tenant_id, booking_line_id)` is expressible against the real schema. |

**Example data — `services`:**

| id | name | booking_model | buffer_after_minutes | class_catalog_color | class_catalog_allows_drop_in | class_catalog_allows_series |
|---|---|---|---|---|---|---|
| svc_corte_escova | Corte + Escova | APPOINTMENT | 10 | null | null | null |
| svc_massagem_relaxante | Massagem Relaxante | APPOINTMENT | 15 | null | null | null |
| svc_pilates | Aula de Pilates | SESSION | null | #2563eb | true | true |
| svc_jornada_spa | Jornada Spa Vitta | APPOINTMENT | null | null | null | null |
| svc_sala_reuniao | Sala de reunião | APPOINTMENT | null | null | null | null |

The three `class_catalog_*` columns are meaningless (left `null`) on APPOINTMENT services — same pattern as `buffer_after_minutes` being `null` on legged services above: a column that only applies to one branch, not enforced by a `CHECK` for the same app-enforced-not-DB-enforced reason already established for this table.

`svc_pilates` has `buffer_after_minutes = null` because SESSION-model services don't use it at all — turnover lives on the template's own resources instead. `svc_jornada_spa` is also `null`, but for a different reason: it's legged, so per-leg `transition_gap_after_minutes` plus per-resource `turnover_minutes` do this job there instead (§7 of the domain doc). `svc_sala_reuniao` is `null` for yet a third reason: it's a variable-duration `CUSTOMER_SELECTED` service — buffer/turnover isn't meaningless there, it's just declared through different columns, shown next.

**Example data — `services`, the variable-duration/pricing columns §3's text above describes but the table above doesn't have room for** (`public-11-reserva-por-tempo.html`'s own displayed limits and price):

| id | duration_policy | duration_min_minutes | duration_max_minutes | duration_increment_minutes | pricing_policy | pricing_increment_minutes | price_per_increment_amount | minimum_charge_amount |
|---|---|---|---|---|---|---|---|---|
| svc_sala_reuniao | CUSTOMER_SELECTED | 60 | 480 | 30 | PER_TIME_INCREMENT | 60 | 50.00 | null |

**Fixed 2026-08-22 — `pricing_increment_minutes` is a genuinely separate column from `duration_increment_minutes`, not a reuse of it.** An earlier version of this row priced Ana's booking off the 30-minute *booking-selection* increment ("blocos de 30 minutos," the granularity she can pick a start/duration in) and got the arithmetic wrong trying to make it match the screen's real total. The screen's own two numbers are at two different granularities: booking selection is in 30-minute blocks ("1 a 8 horas, em blocos de 30 minutos"), but pricing is explicitly hourly ("R$ 50 por hora"). These don't have to be the same number, and here they aren't. `pricing_policy = PER_TIME_INCREMENT` bills `price_per_increment_amount` per `pricing_increment_minutes`, rounding a partial increment **up** — the only rounding rule that can never let a customer pay for less time than they actually held the resource. Ana's 2 hours (120 min) = `120 ÷ 60 = 2` pricing increments × R$ 50,00 = **R$ 100,00**, exactly matching `public-11`'s displayed total. A hypothetical 2h30 booking would round up to 3 pricing increments (R$ 150,00), not prorate to 2.5.

`minimum_charge_amount`, when set, is a floor applied *after* this calculation, for a service where even the shortest bookable interval must clear some baseline (e.g. a cleaning fee) — unused here since `null`.

**Example data — `schedule_closures`:**

| id | date | reason | resource_id |
|---|---|---|---|
| clo_1 | 2026-08-10 | STAFF_DAY_OFF | res_staff_camila |
| clo_2 | 2026-08-15 | HOLIDAY | null |

`clo_1` blocks only Camila's own calendar; `clo_2` has `resource_id = null` — the whole business closes for the holiday, every resource blocked regardless of type.

**Example data — `schedule_openings`, showing the partial-index fix doing its job:**

| id | date | resource_id | outcome |
|---|---|---|---|
| open_1 | 2026-08-16 | null | inserted — tenant opens an extra Sunday |
| open_2 | 2026-08-16 | null | **rejected** by `UNIQUE(tenant_id, date) WHERE resource_id IS NULL` — a second tenant-wide opening for the same date |
| open_3 | 2026-08-16 | res_staff_ana | inserted — Ana specifically also opens that Sunday; doesn't collide with `open_1` since `resource_id` differs |

**Example data — `bookings`, the new intake/consent columns** (Ana Costa's Sala de reunião booking, from §2's `service_booking_intake_schema` example above):

| id | service_id | customer_id | intake_schema_version | participant_count | consent_accepted_at | consent_version |
|---|---|---|---|---|---|---|
| book_ana_sala_aurora_0818 | svc_sala_reuniao | cust_ana | 1 | 6 | 2026-08-18T09:50-03:00 | 1 |

`intake_answers` (not shown — a JSONB blob) holds `{"accessNeeds": null}`, the one field on `public-12`'s form with no dedicated typed column of its own. `pickup_address` stays `null` here — Sala de reunião isn't a mobile/pickup service; a car-wash "leva e traz" booking would populate that already-existing column instead, through this exact same intake mechanism.

**Example data — `loyalty.loyalty_entries`:**

| id | booking_id | booking_line_id | class_session_booking_id | service_id | points |
|---|---|---|---|---|---|
| le_1 | book_123 | line_456 | null | svc_corte_escova | 2 |
| le_2 | null | null | sb_2 | svc_pilates | 1 |

`le_1` is today's existing path (a completed haircut). `le_2` is the new path this discovery adds: Roberta's Pilates class (`sb_2`) completing — `booking_id`/`booking_line_id` both `null`, `class_session_booking_id` set instead, enforced by the mutual-exclusion CHECK.

---

## 4. Migration ordering (expand/contract)

1. **Expand:** create `resources`, service/model fields, all requirement/leg tables, contract/attendee/trial/exception tables, session tables, and `resource_occupancy` with every composite FK and index; add `UNIQUE(tenant_id, line_id)` to the existing `booking_lines` table, required by `resource_occupancy`'s composite FK to it. Do not drop the current tenant-wide booking exclusion yet.
2. **Backfill:** create one active `LOCATION` resource per tenant; add the default LOCATION requirement to each existing APPOINTMENT service; materialize resource-occupancy assignment rows for every existing **`APPROVED` BookingLine whose booking has a future `scheduled_end_at`**, using that location and the existing window. **Scope corrected 2026-08-22** — the original wording ("every existing BookingLine") didn't say approved-only or future-only; `resource_occupancy` exists purely to protect *future* availability (§9's own retention policy trickle-deletes anything past its window), so backfilling a `PENDING`/`REJECTED`/`CANCELLED`/`COMPLETED` or already-past BookingLine would create rows with no business purpose that the very next GC sweep would just delete — churn with no benefit, and `PENDING`/`REJECTED`/`CANCELLED` rows have no correct `lock_state` to backfill anyway (only `HOLD`/`COMMITTED` exist). Backfilled rows are `lock_state='COMMITTED'`.
3. **Dual-read/write deployment:** new booking writes populate occupancy snapshots; approval/generation/override paths use the shared occupancy exclusion constraint and advisory resource locks. Availability reads occupancy, tenant/resource schedules, and future template **and recurring-schedule** patterns (§6 item 32).
4. **Validate:** verify every existing approved booking has a locked LOCATION occupancy row and that no resource assignment is missing or cross-tenant before changing the old invariant.
5. **Contract:** drop `EX_booking_bookings_approved_slot` only after the new invariant is live and backfilled. Leaving it in place would wrongly block simultaneous bookings in separate resources. **Rollout ordering added 2026-08-22, closing a gap found on review: the old, whole-tenant `EX_booking_bookings_approved_slot` is still enforced through the end of step 4** — it blocks *any* two `APPROVED` bookings that overlap in time, tenant-wide, regardless of resource. A tenant that's already been given more than one concurrently-bookable resource (i.e. any `Service.resourceRequirements` configuration beyond the single-`LOCATION`/`NONE` degenerate default) during this window would see the new, resource-scoped availability check correctly show two different resources as simultaneously free, then have the second approval rejected by the still-live old constraint — a raw DB-constraint error surfacing to a legitimate customer/staff action, not a graceful "someone else booked it first." **Simplified 2026-08-23 (`multivertical-booking.md` §9 item 30):** do not expose multi-resource `Service` configuration (`CAND-06`/`07`/`08` producing anything beyond the LOCATION-only default) in the UI/API until this step completes for every tenant, then flip it on for everyone at once. No per-tenant staged/canary gate — this platform is pre-production and has no per-tenant feature-flag mechanism (flags are env-var/deployment-wide only, `CLAUDE.md` §1), so a staged rollout would be new, unscoped infrastructure work this discovery doesn't need to justify. **Re-verification requirement, added 2026-08-28:** "pre-production" is a snapshot of 2026-08-28 (confirmed then: prod has no database and no public edge yet, both still gated behind `M17-S37`/TD30 go-live), not a standing guarantee — immediately before executing this step, re-confirm zero production tenants exist (`M17-S37` still not done). If go-live has landed by the time this migration runs, this single-cutover plan is invalid and must be redesigned as a staged/per-tenant rollout before proceeding.
6. Expand `schedule_closures` / `schedule_openings` with composite `resource_id` FKs and replace the opening unique constraint with the two partial unique indexes.
7. Expand `loyalty.loyalty_entries` with the session-booking reference only after the session-booking completion event path is live. No cross-context DB FK is introduced. **Widen both `booking_id` and `booking_line_id` to NULLABLE together** — corrected 2026-08-21, the original version of this step only mentioned `booking_line_id`, but `docs/13-DATABASE_SCHEMA.md`'s real schema has `booking_id UUID NOT NULL` too; widening only one leaves the other still blocking every class-session-completion insert. Add `CHK_loyalty_entries_source_exclusive` in the same migration (§2 above).
8. **`tenants.settings.booking.autoApproveEnabled` (§5's "Approval workflow" note) needs no migration at all** — it already exists in the live JSONB settings blob (`docs/21-TENANTS_SETTINGS_SCHEMA.md`, currently unread by any use case); this discovery only adds the application logic that reads it. Listed here explicitly so it isn't mistaken for a missing migration step.

---

## 5. Why `resource_occupancy` has to be one shared table

`booking.bookings` today carries the only DB-level guarantee behind CLAUDE.md's "cross-row invariant → enforce at the DB layer" rule:

```sql
CONSTRAINT "EX_booking_bookings_approved_slot"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    tstzrange("scheduled_at", "scheduled_end_at", '[)') WITH &&
  )
  WHERE ("status" = 'APPROVED')
```

(Verified against the actual migration, `CreateBookingBookings1748000000014` — `apps/backend/src/contexts/booking/infrastructure/migrations/1748000000014-CreateBookingBookings.ts`, lines 61–66. `docs/13-DATABASE_SCHEMA.md` correctly documents both `scheduled_end_at` and `version` on `booking.bookings` — see §6 item 12 for a correction to an earlier, wrong claim in this document that it didn't.)

This works today because there's exactly one thing to protect: the whole tenant, one row per booking. The domain doc's §5/§8 describe the resource split as if it's a query-side change only ("only the effective calendar-blocked window changes"). It isn't: once a booking can lock a *bundle* of resources (model 7) or a different resource per *leg* (model 8), there's no longer one row per booking to key an exclusion constraint on — the granularity has to move to one row per resource-assignment. And a materialized `ClassSession` needs the *identical* protection on the *same* resources. Postgres exclusion constraints cannot span two tables — so if `Booking` resource-locks and `ClassSession` resource-locks lived in separate tables, cross-family exclusivity (CAND-31, model 13's whole premise) could never be DB-enforced no matter how well either table were built individually.

`resource_occupancy` is the fix: both families insert into it and one shared GIST exclusion constraint protects both. Its appointment row refers to the immutable `booking_line_resource_assignments` business record; the two tables intentionally have different retention roles, not competing ownership. A manual-approval appointment inserts `lock_state='HOLD'` with its snapshotted expiry; approval atomically converts it to `COMMITTED`, while expiry cancels and releases it. Class sessions insert `COMMITTED` at generation. Cancelling a session or moving its resources replaces/releases the affected rows in the same transaction.

This still leaves exactly one case with no row-level DB backstop: an appointment booked against a resource's **not-yet-materialized** future template — or, added 2026-08-22, **recurring-schedule** — occurrence. Pattern evaluation remains necessary, but is not safe on its own under concurrent template/schedule edits and booking approvals. Every template create/edit/deactivate, **recurring-schedule create/edit/pause/end**, appointment approval, generator write, and session-resource override acquires transaction-scoped advisory locks for its resources in canonical `resource_id` order. That serializes the read-check/write boundary for the future-pattern case while the exclusion constraint protects materialized occurrences. See §6 item 32 — this parity was missing until a review pass caught that `recurring_booking_schedules` (§2 above) is structurally the same "future pattern, not yet materialized" case `ClassScheduleTemplate` already solves here, but had never been wired into this mechanism.

---

## 6. Historical audit trail

The notes below record issues found in earlier drafts. They are retained for design provenance only; the current, authoritative discovery decisions are §2–§5 and §7. In particular, any old reference below to `booked_count`, ad-hoc sessions, booking-level no-show, or unresolved Staff deactivation has been superseded by the later decisions.

1. **`ClassSessionBooking` has no snapshot fields, breaking a core Booking-context principle and blocking the event it's supposed to trigger.** `BookingLine` snapshots `price`/`duration`/`points` at booking time specifically so a later `Service` edit never retroactively changes a past booking (domain doc §1; `02-DOMAIN_MODEL.md`). The domain doc's `ClassSessionBooking` properties (§6) have no equivalent. This isn't just an inconsistency with the rest of the model — it concretely breaks §6's own claim that `ClassSessionBookingCompleted` "mirrors `BookingCompleted`'s consumers": Loyalty's insert needs a `points` value to write into `LoyaltyEntry.points`, and nothing currently supplies one. Fixed above via `service_name_at_booking` / `price_at_booking_amount` / `points_value_at_booking` on `class_session_bookings`.

2. **`loyalty.loyalty_entries` cannot accept a `ClassSessionBookingCompleted` insert without a schema change.** `booking_id`/`booking_line_id` are both `NOT NULL` today. Supporting the class-family path requires widening `booking_line_id` to nullable, adding `class_session_booking_id`, and a mutual-exclusion CHECK — a real cross-context migration the domain doc's one sentence about "mirroring consumers" doesn't scope at all.

3. **`ClassSessionBooking`'s contact/actor shape (`customerId | guest-contact-fields`) was too vague to build.** Now mirrors `Booking` exactly: `type`, nullable `customer_id`, required `contact_email`/`contact_name`/`contact_phone`. Also needed because `Booking`'s events carry contact fields directly (bounded-contexts Rule 4, self-contained events) — `ClassSessionBookingCompleted`'s "thanks for coming" notification can't be self-contained otherwise.

4. **Two independent Staff-deactivation paths aren't wired together.** `UC-029` deactivates a `Staff` row in the Staff Context; `CAND-03` deactivates a `Resource` in the Booking Context. Nothing says whether deactivating the underlying `Staff` cascades to (or blocks on) the wrapping `STAFF`-type `Resource`. `StaffDeactivated` currently has zero consumers — this would be its first, and it isn't mentioned in §6/§8 of the domain doc.

5. **`ScheduleOpening`'s `UNIQUE(tenant_id, date)` breaks the moment `resource_id` becomes nullable** — see §3 above for the fix. `ScheduleClosure`'s equivalent rule was already app-enforced (not a DB unique), so it's unaffected — only `ScheduleOpening` had this trap.

6. **Domain doc §3 and §9 item 1 pull in different directions on what backfilling `LOCATION` means.** §3 frames backfilling as "replaces today's implicit whole-tenant-is-the-resource behavior with an explicit row," but §3 also separately defines `resourceId = null` on closures/openings as "tenant-wide... blocks every resource regardless of type." These are two different concepts once other resource types exist: a closure scoped to the `LOCATION` resource specifically vs. one that blocks *everything*. Backfilling `LOCATION` doesn't retire the `NULL` sentinel — genuine "close the whole business" semantics still need it. Recommend resolving explicitly: `LOCATION` becomes just one more addressable resource (useful for giving car wash's degenerate `resourceRequirements` something concrete to reference); `resourceId IS NULL` remains its own, separate "everything" sentinel on closures/openings.

7. **`ClassSession.templateId` is nullable for an "ad-hoc" case no candidate use case actually creates.** CAND-13 only generates from a template; CAND-14 only overrides an existing session. Nothing creates a template-less session. Either add the missing use case or drop the nullability until something needs it — currently unused schema surface.

8. **`waitlistPosition` as a stored, shifted-on-every-promotion column is more machinery than the requirement needs.** CAND-25 requires updating every other waitlisted row's position on each promotion/cancellation — the "keeps needing new bookkeeping" pattern CLAUDE.md's engineering rules flag as a signal to reconsider the approach rather than keep patching it. A customer's position is fully recoverable at read time via `ROW_NUMBER() OVER (PARTITION BY class_session_id ORDER BY created_at) WHERE status='WAITLISTED'`. Recommend dropping the persisted field entirely — reflected above (no `waitlist_position` column on `class_session_bookings`).

9. **CAND-22's "atomically checks `bookedCount < capacity`" has no concrete mechanism stated.** Given this codebase's documented TypeORM-optimistic-locking trap (a hand-built `manager.save()` doesn't protect this), the concrete fix is a guarded UPDATE: `UPDATE class_sessions SET booked_count = booked_count + :qty WHERE id = :id AND booked_count + :qty <= capacity`, checking `affected === 1`, falling through to waitlist on 0 rows affected. `class_sessions.version` (added above) covers non-capacity concurrent edits (CAND-14) the same way `bookings.version` does today.

10. **`legs` vs. `bookingModel = SESSION` compatibility is never explicitly forbidden.** Domain doc §5 scopes legs to "flat (non-legged) services only," and CAND-08's precondition just says "Service exists" — not `bookingModel = APPOINTMENT`. Recommend an explicit invariant: `SESSION` services carry neither `resourceRequirements` nor `legs` (aggregate-enforced, same pattern as today's "booking must have ≥ 1 line" — not a DB constraint, since it can't be expressed across the now-normalized child tables).

11. **Resolved (2026-08-24): aggregate/outbox wiring.** `ClassSessionBookingConfirmed`/`Waitlisted`/`Completed`/`NoShow`, `WaitlistPromoted` and `ClassSessionCancelled` are triggered by aggregate state changes and are drained through the transactional outbox. `ClassSession` and `ClassSessionBooking` are full `AggregateRoot`s with outbox-aware repositories, matching the existing Booking pattern. Worker-triggered generation/expiry remains idempotent and does not publish a domain event merely because a row was generated or expired.

12. **Correction (2026-08-05): the "doc-hygiene note" this item used to make was itself wrong.** This item previously claimed `docs/13-DATABASE_SCHEMA.md`'s `booking.bookings` table was stale against the real migration, missing `scheduled_end_at` and `version`. Re-verified directly against the file: `docs/13-DATABASE_SCHEMA.md:169` documents `scheduled_end_at` and `docs/13-DATABASE_SCHEMA.md:196` documents `version` — both present and correctly described. No stale-doc issue exists here. Left in place, corrected rather than deleted, as a reminder to this document's own author discipline: a claim made "while grounding against real code" still needs the actual grep/read to back it, not just a plausible-sounding assertion — the same caution item 15 already applies to its own "Resolved" claims.

13. **A leg can require more than one resource at once — the domain doc's `ServiceLeg.resourceRequirement` (singular) doesn't allow for this, but the concrete prototype does.** `public-05-multi-leg-itinerary.html`'s middle leg ("Massagem") locks both a therapist (Renata Souza, customer-chosen) *and* a room (Sala de Terapia) simultaneously — the same two resources `Massagem Relaxante`'s own bundle uses, deliberately, to demonstrate CAND-31 cross-service exclusivity "from the other direction" (per that file's own comment). The domain doc §5's abstract JSON example only ever shows one `resourceRequirement` per leg. Fixed above: `service_legs` no longer carries `resource_type`/`selection_mode` directly — those moved to a new `service_leg_resource_requirements` child table (one-to-many per leg), with its own `service_leg_resource_requirement_pool`, mirroring the flat-service bundle shape one level deeper. Worth carrying this fix back into the domain doc's own `ServiceLeg` properties (§5), not just this schema.

14. **Prototype display bug, found while grounding the `class_session_bookings` example above — fixed (2026-08-05).** `staff-02-session-roster.html`, `staff-04-turmas-proximas.html` (two cards — the "Hoje" listing and the "Turmas passadas" entry), and `staff-02b-fechar-turma.html` all showed "3 de 4"/"3/4 vagas preenchidas" (75% bar) for the same underlying session, but its three confirmed rows (Fernanda ×1, Roberta ×1, Ana & Bia ×2) sum to 4 — genuinely full, which is also the correct reason Marcos Tanaka is waitlisted rather than confirmed. Not a data-model issue, but the bug spanned three files sharing the same wrong number, not one. All three now show 4/4 (100%); `staff-04`'s two cards additionally now use its own already-defined but previously-unused `.capacity-bar-fill.full`/red styling, matching the "Lotada" convention already established in `public-02-class-session-picker.html`.

15. **The original fix for §9 item 7, which this doc had marked "Resolved," was itself wrong — corrected mid-conversation (2026-08-05).** The first draft of this doc scoped the eligible pool to `template_id` (`class_schedule_template_slot_pool`). Two problems surfaced on review: (a) no `CAND` ever populated it — `CAND-11`'s main flow only ever picks a resource, never declares a pool, so the table had a schema with no write path anywhere; (b) scoping per-template meant re-curating the same "who can teach Pilates" list separately for every template of the same service, with real drift risk (a newly-qualified instructor would need adding to each template's own pool individually, rather than once). Corrected: the pool moved to `service_class_resource_pool`, scoped by `service_id` — declared once, shared by every template of that service, filled by the same `manager-02` checklist mechanism `CAND-06` step 3 already uses for the flat case. `class_schedule_template_slots` keeps storing only the one resolved pick per template, now validated against the service-level pool instead of a redundant one of its own. This is also a reminder that marking something "Resolved" in this doc means the schema was designed, not that it was verified against every use case that would actually populate it — worth double-checking that in future entries too.

16. **Three columns look like unexplained duplicates because their denormalization was never stated as such.** Asked directly why `class_sessions.service_id` exists when `template_id` already implies it via a join to `class_schedule_templates.service_id` — and the same question applies to `service_class_resource_pool.resource_type` and `class_schedule_template_slots.resource_type`, both derivable via their own `resource_id` → `resources.type`. All three are legitimate denormalization (same category as `bookings.total_price_amount` — computable from a join, stored directly for fast reads), not accidental duplicates, but §2 never said so, which is exactly why they read as unexplained. Fixed by annotating each column inline with what it's denormalized from and why. One of the three has a weaker justification than it looked: `class_sessions.service_id`'s original "needed for the ad-hoc case, where template_id is null" rationale is currently theoretical, since nothing populates `template_id = NULL` yet (item 7) — today the column is pure query-convenience denormalization (CAND-13b/CAND-21 filtering by service without a join), not a load-bearing necessity. Revisit that specific rationale once item 7 is actually resolved either way.

17. **Three tables broke the tenant-first composite-FK invariant (`CLAUDE.md` §2.4) — fixed (2026-08-05).** `service_resource_requirements`, `service_legs`, and `service_leg_resource_requirements` each have a child table that referenced them by plain `id` (`service_resource_requirement_pool.requirement_id`, `service_leg_resource_requirements.leg_id`, `service_leg_resource_requirement_pool.requirement_id`) while every sibling FK in the same tables — e.g. `resource_id → resources` — correctly used the composite `(tenant_id, resource_id)` shape. Without a `UNIQUE(tenant_id, id)` on the parent, a true composite FK wasn't even expressible, so this path couldn't block a cross-tenant reference at the DB level the way the rest of the schema does. Fixed in §2 above: all three parents now declare `UNIQUE(tenant_id, id)`, and all three child FKs are now composite. Found during a business/architecture review cross-checking this document against `CLAUDE.md`'s multi-tenancy invariants directly, rather than by working through a specific worked example — the other ~10 new tables already got this right.

18. **No constraint in this document carries an explicit name, unlike the real schema's own convention.** The live migration names every constraint (`EX_booking_bookings_approved_slot`, `CHK_booking_bookings_discount_consistency`, `UQ_booking_services_tenant_id`, `FK_booking_lines_tenant_booking`, `IDX_booking_bookings_tenant_status`) with a `<PREFIX>_<schema>_<table>_<descriptor>` shape. Every constraint above is described positionally instead (`**UNIQUE** | (tenant_id, id) |`). Not fixed by exhaustively naming all ~13 new tables' constraints here — at discovery stage that's mechanical busywork without much payoff — but flagged explicitly so implementation doesn't silently improvise a different convention: follow the existing `<PREFIX>_booking_<table>_<descriptor>` shape (e.g. `EX_booking_resource_occupancy_locked_window`, `UQ_booking_resources_staff_ref`) when these become real migrations.

19. **`slot_index`/`requirement_index` were premature abstractions — removed (2026-08-05).** Their original justification for `class_schedule_template_slots`/`service_class_resource_pool` cited "a bigger studio needing two interchangeable room slots on one template" as the reason a fixed `resource_type` key wouldn't suffice — but that scenario was misremembered from a *different*, already-resolved case: model #6 (two Pilates rooms running in parallel) is explicitly handled as two separate `ClassScheduleTemplate` rows (§6, domain doc), never as one template with two `ROOM` slots. Checked every actual worked example across both the flat-bundle and leg families too (Massagem Relaxante's STAFF+ROOM+EQUIPMENT, the dentist's STAFF+EQUIPMENT, every leg in Jornada Spa) — none of them ever need two resources of the same type in one bundle/leg/slot-set. `resource_type` (4 fixed values: `LOCATION`/`STAFF`/`ROOM`/`EQUIPMENT`) is therefore a sufficient natural key on its own. Removed the ordering column from all four affected tables — `service_resource_requirements`, `service_leg_resource_requirements`, `service_class_resource_pool`, `class_schedule_template_slots` — and from `class_session_resources`, which mirrors the last one. Display order (e.g. always showing "Instrutor" before "Sala") doesn't need a stored column either — Postgres gives no ordering guarantee without an explicit `ORDER BY` regardless of whether a stored index exists, so a fixed `ORDER BY CASE resource_type WHEN ...` (or an equivalent small priority list in application code) achieves the same deterministic order more simply, without a column that could drift out of sync with the manager's intended order. One real future case would justify reintroducing an index — a couples-massage-style bundle needing two `STAFF` at once — but nothing here needs it today, and adding it back later is a simple additive migration, not a reason to carry the column now.

20. **`guest_approval_mode` (global per-service AUTO/MANUAL) removed, replaced by `trial_slots` on `class_schedule_templates`/`class_sessions` — 2026-08-21.** A single service-wide flag can't express "this peak-hour class is members-only, this slow-afternoon session takes a couple of walk-ins". `trial_slots` snapshots from template to session at generation (`CAND-13`), instance-overridable (`CAND-14`). `reserved_non_member_count` tracks the verified guest plus contract-less customer subset of `reserved_count`, atomically maintained by the guarded update; it decides the `CAND-33` auto/manual branch, is not a second capacity ceiling, and can exceed `trial_slots` after manual approval so long as `reserved_count <= capacity`. `guest_trial_policy` (one free trial per email) is a distinct pricing/promo rule.
21. **`class_session_bookings.rescheduled_from_id` added for fixed-slot make-up ("reposição") — 2026-08-21.** A `RecurringEnrollment` occurrence skipped via `CAND-27` may be rescheduled to a same-service replacement session, when the tenant enables it (`classAllowsReschedule`/`classRescheduleWindowDays`/`classMaxReschedulesPerCycle` on `platform.tenants.settings.booking`, §3) — common practice at Brazilian studios/academias, not speculative scope. The replacement is always a fresh one-off booking (`series_id = null`) — a make-up is not a new standing commitment — self-referencing the skipped occurrence via `rescheduled_from_id`; `UNIQUE(tenant_id, rescheduled_from_id) WHERE rescheduled_from_id IS NOT NULL` blocks double-rescheduling the same skipped occurrence. Deliberately scoped to enrollment occurrences only: a plain one-off booking (`CAND-23b`) was never a fixed slot, so it has nothing to make up. See `CAND-38`. No new event type — reuses the existing `ClassSessionBookingCancelled` (original occurrence, `reason: ENROLLMENT_OCCURRENCE_SKIPPED`, already in §8's event data shape) and `ClassSessionBookingConfirmed`/`Waitlisted` (replacement).
22. **`classSkipWindowHours` added — `CAND-27` had no minimum-notice check at all, unlike `CAND-23b` — 2026-08-21.** New tenant setting on `platform.tenants.settings.booking`, same non-negative-int shape as `classCancellationWindowHours`, deliberately a separate field rather than reusing it: a studio's notice requirement for "skip this week, keep my slot" commonly differs from "cancel this booking entirely." Enforced by a new `CAND-27` alternative flow, mirroring `CAND-23b`'s existing window check exactly.
23. **`class_session_bookings`'s CUSTOMER/CONTRACT invariant relaxed for `CAND-22b` — a real product gap, not a schema tidy-up — 2026-08-21.** A logged-in customer who pays per class is a real third path: `type = CUSTOMER`, `contract_id IS NULL`, `payment_source = IN_PERSON`, gated by the same `trial_slots`/`reserved_non_member_count` capacity-protection check as a guest, but skipping email verification and remaining loyalty-eligible. `guest_trial_policy` stays guest-only.

**`reserved_non_member_count`/`trial_slots` represent non-member traffic.** Both an anonymous `GUEST` reservation and a contract-less authenticated `CUSTOMER` reservation count toward the same counter and are gated by the same threshold; the mechanism protects member capacity from anyone without a qualifying commitment.

**Clarifying note for onboarding (not a schema change):** a studio owner configuring a `SESSION` service reasons about two independent numbers per session — `capacity` (how many people, period) and `trial_slots` (how many of those may be non-members before staff approval kicks in). Both are real, both matter, and conflating them is the most likely onboarding-time confusion this model creates — worth a plain-language explainer in the eventual UI (`ONBOARDING_PRESETS.md`'s preset copy is the natural place), not just this schema doc.

**"Drop-in recorrente" (`customer-04c-dropin-sem-prazo.html`) has no backing entity, by design — worth stating explicitly so a future implementer doesn't go looking for one.** A drop-in customer who happens to attend the same class habitually (e.g. "CrossFit toda terça e quinta") has no `RecurringEnrollment` — that aggregate is reserved for `CAND-26`'s genuine standing commitment. The "próximas 2 semanas" window shown on that screen is a client-side/BFF read-model grouping of that customer's own recent-and-upcoming independent `CAND-22`/`CAND-22b` bookings for the same service, not a stored pattern. If a future story wants server-side "your usual class" prediction, that's new scope, not something this discovery already modeled.

24. **DBA-level audit against the real, live schema (`docs/13-DATABASE_SCHEMA.md`) — 2026-08-21, one real bug found.** Cross-checked every "today's schema is X" claim in this document against the actual, current canonical schema rather than trusting earlier drafts. Everything else held up exactly as described (`booking_lines`' bare `PRIMARY KEY (line_id)`, `schedule_openings`' `UNIQUE(tenant_id, date)` constraint trap, `bookings`' `EX_booking_bookings_approved_slot` definition — all verified character-for-character correct). One real bug: §3's `loyalty.loyalty_entries` row only said `booking_line_id → NULLABLE`, but the real table also has `booking_id UUID NOT NULL`, and the worked example directly below it always needed both null together for a class-session-completion entry — a migration written from the original §3 row alone would have left `booking_id` blocking every such insert. Fixed: both columns now widened together, and the mutual-exclusion CHECK is spelled out in full (`CHK_loyalty_entries_source_exclusive`) instead of just named.
25. **Fields the newly-added `CAND-22b`/`CAND-38`/`CAND-39`/`CAND-40`/manager-02's catalog panel actually need, that had no column anywhere — 2026-08-21.** Found by tracing each new/promoted prototype's own data needs back to this schema, not just checking the use-case text: `services.class_catalog_color`/`class_catalog_allows_drop_in`/`class_catalog_allows_series` (manager-02's "Catálogo de aulas" panel, `docs/discovery/.../prototype/dev-notes.md` item 33 — `description` needed no new column, it already exists on the real table); `class_session_bookings.created_by_staff_id` and `recurring_enrollments.created_by_staff_id` (`CAND-40`'s audit trail, same `<action>_by` pattern `bookings.approved_by` already established); `class_session_bookings.service_id` and `recurring_enrollments.service_id` (`CAND-39`'s "list matrículas for this class type," denormalized for the same query-convenience reason `class_sessions.service_id` already is, item 16 above). None of these needed new tables — every one slots into a table this discovery already created or was already modifying. §7's own "final decisions" summary was left saying "no customer pay-per-session path" when `CAND-22b` is exactly that — a direct, un-caught contradiction with the document's own stated conclusions, fixed in §7 below.
26. **Engineering-design pass, 2026-08-21 — the compact table format used for contract/attendee/trial/exception tables skipped indexing rigor the earlier `class_sessions`/`class_session_bookings`-style tables got, and it showed.** Three FK-adjacent lookups had no supporting index: `class_access_contracts` (a customer's contract *history* — the `EXCLUDE` constraint is partial, `WHERE status='ACTIVE'` only, so it cannot serve this), `class_session_booking_attendees` (roster/close-out reads — Postgres never auto-indexes FK columns), and `guest_class_booking_email_verifications` (the verification-link click looks up by `token_hash`, not by booking, and had no index for either). All three fixed above. Broader design assessment (normalization, hot-path concurrency, retention) carried out separately in §9, below §8's events.
27. **Retention strategy resolved, 2026-08-21 — split by table, not a blanket policy.** `resource_occupancy` reuses the exact `OutboxRelayService.gc()` trickle-delete pattern already live for `shared.outbox`/`shared.inbox` (`docs/13-DATABASE_SCHEMA.md`) — it's pure locking mechanism with no business value once its window has elapsed, the closer analog to outbox/inbox than it first looked. `class_session_bookings`/`class_session_booking_attendees` get the opposite answer — no deletion job, ever; they're the business record this platform's own stated BI-layer ambition (`CLAUDE.md` § Project Facts) depends on, and the only appropriate tool if size ever becomes a real problem is time-based partitioning, which keeps every row queryable. Full reasoning in §9.
28. **PM/engineering review pass, 2026-08-22 — `CAND-32` was found to directly contradict `CAND-47`/`CAND-56`'s "never silently invalidate a future commitment" philosophy for the identical trigger (a template change affecting an already-materialized future session).** `CAND-32` step 4 auto-cancels affected sessions with no manager decision point; `CAND-47`/`56` require an explicit manager worklist resolution for the same scenario, and `CAND-03` already followed that pattern correctly — `CAND-32` was the one outlier. Resolved by narrowing `CAND-47`'s precondition to explicitly exclude a `CAND-32`-initiated range cancellation: the manager's own act of choosing to cancel a date range already *is* the explicit, audited resolution (`ClassSessionCancelled` + notification), just a bulk one rather than one worklist item per session. `CAND-47`/`56` remain the answer for a change nobody explicitly reviewed per-session (resource deactivation, hours reduction, a side effect of an unrelated edit).
29. **Coverage gap re-opened and re-closed, 2026-08-22 — §8's own audit (originally dated 2026-08-07) went stale the moment `CAND-38`, `45`–`47`, and `51`–`56` were added on 2026-08-21.** Every one of those candidates names a new event in its "Events Triggered" field; none had a concrete envelope until this pass added `RecurringBookingScheduleCreated`/`Paused`/`Ended`, `AvailabilityAlertCreated`/`Updated`/`Cancelled`/`Expired`/`Matched`, `FutureCommitmentExceptionRaised`/`Resolved`/`Dismissed`, `TenantSchedulingBootstrapped`, `ResourceReactivated`, and `InPersonPaymentRecorded`/`Reversed` to §8. A discovery-stage audit dated at a point in time doesn't stay true once new candidates are added afterward — worth remembering for any future addition to this document too.
30. **Duplicate use case found and resolved, 2026-08-22 — `CAND-55` was the same feature as `CAND-38` ("reposição"/make-up for a skipped recurring occurrence), drafted twice with a direct contradiction between them** (`CAND-55` claimed a new `MakeUpReservationCreated` event was needed; `CAND-38` correctly says no new event type is needed, reusing existing booking-lifecycle events). `CAND-38` is schema-grounded and screen-grounded; `CAND-55` was the vaguer, later restatement. `CAND-55` is now a "superseded by `CAND-38`" stub, same pattern as `CAND-15b` → `CAND-37`. Separately, `CAND-54` (in-person payment) was clarified as an elaboration of `CAND-37` step 2, not a competing spec — the two were never contradictory, just under-cross-referenced.
31. **Missing manager-facing config use cases found and added, 2026-08-22.** `CAND-43` (customer submits intake answers) had no manager-facing candidate that ever authors a `service_booking_intake_schema` in the first place — the same shape of gap `CAND-10b` already exists to close for guest-access policy. More broadly, `services`' own approval-mode/hold-duration, cancellation/reschedule-window, minimum-notice/maximum-advance, and variable-duration/pricing-policy columns (§3) had no configuring use case at all, unlike `CAND-06`/`08`/`09`/`10` for resource requirements, legs, buffer, and booking model. Added `CAND-09b` (booking-intake schema) and `CAND-09c` (appointment service policy) in the use-cases doc.
32. **Structural gap found and closed, 2026-08-22 — `recurring_booking_schedules` (§2 above) was never wired into the same cross-family-exclusivity mechanism `ClassScheduleTemplate` already has.** This is the identical shape of problem the domain doc's §6 "Cross-family resource exclusivity" section already solved once for templates: a standing future pattern that isn't yet materialized into individual rows still has to be evaluated directly by availability computation, or a not-yet-generated conflict slips through. `CAND-29` (availability computation), `CAND-31` (overlap rejection), `CAND-11` A2, and this document's own §5 advisory-lock list all only ever mentioned `ClassScheduleTemplate` — never `RecurringBookingSchedule` — despite the domain doc's §6b explicitly saying a private recurring schedule "blocks its future pattern beyond the materialisation horizon" the same way. Concretely, without this fix, nothing stopped a different customer from booking Sala Aurora on a future Tuesday 10:00–12:00 that Ana Costa's standing reservation already claims, as long as it's beyond the occupancy backstop and not yet materialized. Fixed in the use-cases doc (`CAND-29` new step 5, `CAND-31`'s precondition, `CAND-11` A2) and here in §5.
33. **Product decision made, 2026-08-22 — a recurring-schedule-generated occurrence auto-confirms regardless of the service's own approval policy.** Grounded in a real inconsistency found while building the Sala Aurora worked example: the one-off booking flow (`public-11`→`12`→`13`) is `MANUAL_APPROVAL` with a 30-minute hold, but `customer-09-reserva-recorrente.html`'s recurring-booking screen shows every generated occurrence as already "Confirmada," with no pending/hold state at all. Resolved in `CAND-45`: the standing schedule itself was already vetted for conflicts once, at creation; re-running a manual-approval hold-and-review cycle on every single generated occurrence would contradict the entire point of a "standing commitment," and doesn't match what the prototype actually shows. `MANUAL_APPROVAL` still governs genuinely one-off bookings of the same service.
34. **Self-authored arithmetic bug found and fixed, 2026-08-22 — the variable-duration pricing example conflated the booking-selection increment with the pricing increment.** An earlier version of the `services` variable-duration example (added the same review pass that introduced `svc_sala_reuniao`) priced Ana's 2-hour Sala Aurora booking off `duration_increment_minutes = 30` (the 30-minute booking-selection granularity, "blocos de 30 minutos") while the prototype's actual price is hourly ("R$ 50 por hora") — two different granularities the schema only had one column for. Fixed by adding a distinct `pricing_increment_minutes` column and an explicit round-up rule for a partial increment (never round down — a customer never pays for less time than they held the resource).
35. **Migration-ordering gaps found and closed, 2026-08-22.** (a) The backfill step's original "every existing BookingLine" wording didn't scope to `APPROVED`-only/future-only, risking backfilled `resource_occupancy` rows for historical bookings that would just be garbage-collected on the very next retention sweep, and had no valid `lock_state` to assign to a `PENDING`/`REJECTED`/`CANCELLED` row in the first place. (b) A more serious gap: the old, whole-tenant `EX_booking_bookings_approved_slot` constraint stays live through the entire dual-write window (steps 1–4) — during that window, a tenant already using more than one concurrently-bookable resource would see the new resource-scoped availability check correctly report two different resources as simultaneously free, then have the second approval rejected by the still-active old constraint at the DB layer, surfacing as a raw error to a legitimate concurrent booking. Fixed by feature-gating any multi-resource `Service.resourceRequirements` configuration behind step 5 (Contract) actually completing.
36. **Two mechanisms for the same fact, reconciled 2026-08-22.** A `PICKUP_ADDRESS`-typed intake-schema question (§2 above) and the legacy `services.requires_pickup_address` boolean (already live for car wash, `docs/13-DATABASE_SCHEMA.md:207`) both express "this service needs a pickup address," and nothing said which one is authoritative. Resolved: `requires_pickup_address` stays the single source of truth that `bookings.pickup_address` population is validated against; declaring a `PICKUP_ADDRESS` question in a service's intake schema (via the new `CAND-09b`) sets that boolean in the same transaction rather than existing as a second, independently-driftable switch.
37. **Resolved (2026-08-24): example dates are illustrative fixtures, not calendar authority.** New examples must use correct Gregorian weekdays; existing examples are retained as historical provenance but must not be copied into executable fixtures without correction.
38. **Superseded 2026-08-24 — Staff resource validation.** Historical concern: `resources` rows with `type = STAFF` deliberately have no cross-context DB FK. The BFF may populate the picker, but Booking performs the final same-tenant/existing/active/schedulable Staff validation through a narrow lookup adapter inside the use-case transaction boundary; Staff remains unaware of Booking and publishes `StaffDeactivated` for future-resource deactivation.
39. **Superseded 2026-08-24 — recurrence hot-path sizing.** Historical concern: the risk remains a performance acceptance criterion, not an unresolved design choice. Tenant/service recurrence limits are explicit, the candidate query must use tenant-first indexes, and load tests must measure the indexed candidate set before any limit is increased or recurrence compilation/cache is introduced.
40. **Resolved (2026-08-23):** `future_commitment_exceptions` uses `UNIQUE (tenant_id, source_type, source_id, affected_type, affected_id) WHERE status = 'OPEN'`; repeated triggers update the existing open row rather than duplicating manager work.
41. **Superseding decision (2026-08-24):** historical items 38 and 39 are no longer open. Booking uses a narrow Staff lookup adapter for final same-tenant/existing/active/schedulable validation, while Staff remains unaware of Booking and publishes `StaffDeactivated` through the event bus. Recurrence limits are explicit platform/service safeguards, and availability must measure the indexed candidate set before limits are increased or a compiled/cache representation is introduced. This item is authoritative; the earlier concerns are retained only as historical provenance. **Caveat added 2026-08-28 — see item 43 below:** "explicit" was itself never backed by an actual number anywhere in this document until item 43; treat this item as the policy direction only, item 43 as the concrete values.

42. **Resolved 2026-08-28 — `CAND-45`'s recurring-schedule approval bypass (`multivertical-booking.md` §9 items 29/32) closed via schedule-level approval.** `recurring_booking_schedules.status` gains `PENDING_APPROVAL`; a `MANUAL_APPROVAL`-service schedule request holds in that status (with `approval_hold_expires_at`, mirroring `resource_occupancy.hold_expires_at`) and generates no occurrences until `CAND-45b` resolves it. `AUTO_CONFIRM` services are unchanged. This closes the create-then-cancel loophole at its root — repeating it just re-triggers the same one-time review gate — without reintroducing per-occurrence review, which would have defeated the entire point of a standing commitment. See §2's `recurring_booking_schedules` table above for the exact column/constraint changes and `multivertical-booking_USECASES.md`'s `CAND-45`/`CAND-45b` for the flow.

43. **Resolved 2026-08-28 — concrete recurrence-hot-path caps, closing the gap item 41 left open.** `MAX_ACTIVE_TEMPLATES_PER_RESOURCE = 50` (`class_schedule_templates`, via `class_schedule_template_slots`) and, for the private-recurrence side added 2026-08-22 (item 32 above), `MAX_ACTIVE_SCHEDULES_PER_RESOURCE = 50` for `FIXED_ASSIGNMENT` schedules (via `recurring_booking_schedule_resource_assignments`) and `MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE = 50` for `RESOLVE_PER_OCCURRENCE` schedules (no fixed resource to count against in advance). All three are generous, conservative placeholders — chosen to be far above any realistic tenant's actual usage while still bounding the worst case — app-enforced at creation (`CAND-11` new alt flow, `CAND-45` new alt flow), and explicitly revisable after load testing per item 41's own already-stated principle, not fixed forever. See §2's `class_schedule_templates`/`recurring_booking_schedules` INVARIANT rows above.

---

## 7. Final discovery decisions carried to the domain document

- Every existing tenant receives one explicit active `LOCATION` resource during the expand/backfill migration. It is an addressable default resource; `resource_id IS NULL` on a closure/opening remains the distinct tenant-wide “everything” sentinel.
- `Resource.maxCapacity` is now an optional physical ceiling for capacity-bearing resources. Template/session capacity cannot exceed the lowest applicable ceiling.
- SESSION services use service-scoped eligible resource pools and fixed template picks. They never carry APPOINTMENT `resourceRequirements` or `legs`.
- The class family has no ad-hoc session creation and no online billing. **Corrected 2026-08-21 — this bullet used to also claim "no customer pay-per-session path," which now directly contradicts `CAND-22b` below; that was never updated when `CAND-22b` was added, a real internal contradiction caught on re-review, not just a wording gap.** Customer access is through one active, non-overlapping, service-scoped contract (`CAND-22`/`CAND-26`), **or**, when the tenant allows non-member traffic on that service, a pay-per-class booking with no contract at all (`CAND-22b`) — subject to the same `trial_slots` capacity-protection gate a guest goes through. Configured guest trials/drop-ins remain the fully-anonymous third path.
- Capacity, guest verification/approval, attendee-level attendance, cancellation ranges, and future-template concurrency are all resolved above. Candidate domain events are formalized in §8 below. There are no remaining **schema-level** open questions that block promotion into milestone planning. **Caveat added 2026-08-22:** this claim was never false about the *schema* — it was, however, read as covering more than it does. A PM/engineering review pass the same day found real **use-case-level** gaps this sentence doesn't speak to at all: a use-case contradiction (`CAND-32` vs. `CAND-47`/`56`, §6 item 28), a stale event-coverage audit (§6 item 29), a duplicate use case (§6 item 30), and missing manager-facing config use cases (§6 item 31) — all now fixed, but the fact that they existed means "ready to promote" needs a use-case-level pass too, not just a schema-level one, before the next milestone actually starts.
- **Added 2026-08-21:** per-session non-member capacity (`trial_slots`/`reserved_non_member_count`, replacing the earlier global `guest_approval_mode`), a real contract-less pay-per-class path (`CAND-22b`), fixed-slot make-up (`rescheduled_from_id`, `CAND-38`), and a dedicated `classSkipWindowHours` for `CAND-27`.
- **Added 2026-08-22:** `recurring_booking_schedules` wired into the same cross-family-exclusivity mechanism `ClassScheduleTemplate` already has (§6 item 32); recurring-schedule occurrences auto-confirm regardless of the service's approval policy (§6 item 33); a corrected variable-duration pricing model with a distinct pricing increment (§6 item 34); two migration-ordering fixes — backfill scope and old-constraint rollout sequencing (§6 item 35); and `requires_pickup_address` confirmed as the single source of truth behind the new intake-schema mechanism (§6 item 36).
- **Added 2026-08-28, grill-review pass:** the `CAND-45` approval-bypass tradeoff (item 33) is narrowed — schedule *creation* now requires one-time approval under `MANUAL_APPROVAL`, closing the create-then-cancel loophole item 29/32 found, while generated occurrences still auto-confirm exactly as item 33 already established (§6 item 42); concrete recurrence-hot-path caps replace the previously unstated "explicit limits" claim (§6 item 43); the LGPD/PII retention deferral (§11 of the domain doc) is corrected to stop asserting an existing policy that does not exist; and the milestone-sequencing map gains an explicit batch-safety note for Cluster 1/Cluster 2 (`multivertical-booking.md` §9 item 31).

---

## 8. Candidate Domain Events

> Added to close a coverage gap found during a pre-promotion audit (2026-08-07): every candidate event referenced across this discovery set (`ClassSessionCancelled`, `ClassSessionBookingConfirmed`/`Cancelled`/`Waitlisted`/`Completed`, `WaitlistPromoted`, plus CAND-33's "candidate guest-verification/guest-reservation events" and CAND-35's "candidate contract-created/cancelled events") was named in a CAND's "Events Triggered" field but never given a concrete envelope/payload, unlike every event in `docs/03-DOMAIN_EVENTS.md`. Follows that file's mandatory envelope (`eventId`, `tenantId`, `occurredAt`, `correlationId`, `eventName`, `eventVersion`, `data`) exactly — only the `data` shape is shown below, per that doc's own convention. All are Booking Context events (item 11 above already flags that `ClassSession`/`ClassSessionBooking` becoming outbox-draining `AggregateRoot`s is the real architectural commitment this implies).
>
> **Extended 2026-08-22 — this same gap had silently reopened.** CAND-38, 45–47, and 51–56 were all added on 2026-08-21, two weeks after this section's own audit date, and every one of them names a new candidate event in its "Events Triggered" field — none of which had a concrete envelope until now. The events below close that out. (`CAND-55`'s claimed `MakeUpReservationCreated` event is *not* included — see `CAND-55`'s own entry: it's superseded by `CAND-38`, which correctly needs no new event type.)

#### **ClassSessionCancelled**
- **Trigger:** `CAND-15` (single session cancelled with existing bookings) or `CAND-32` (date-range/from-date template cancellation, once per affected session)
- **State change:** `ClassSession.status → CANCELLED`; every active `ClassSessionBooking` on it → `CANCELLED`
- **Data:**
  ```
  {
    classSessionId:  string
    serviceId:       string
    templateId:      string
    startTime:       ISO8601
    cancelledBookingIds: string[]   // every ClassSessionBooking transitioned by this cancellation
    reason:          "MANUAL" | "TEMPLATE_RANGE" | "TEMPLATE_ENDED"   // CAND-15 vs. CAND-32's two scopes
  }
  ```

#### **ClassSessionBookingConfirmed**
- **Trigger:** `CAND-22`/`CAND-23` (capacity confirms a reservation directly), `CAND-33` step 3 (guest, `AUTO` policy), or `CAND-34` step 3 (guest, `MANUAL` policy approval)
- **State change:** `ClassSessionBooking.status → CONFIRMED`
- **Data:**
  ```
  {
    classSessionBookingId: string
    classSessionId:        string
    serviceId:              string
    type:                   "GUEST" | "CUSTOMER"
    customerId:             string | null
    contactEmail:           string
    contactName:            string
    quantity:                number
    paymentSource:          "CONTRACT" | "GUEST_TRIAL" | "IN_PERSON"
    startTime:               ISO8601
  }
  ```

#### **ClassSessionBookingCancelled**
- **Trigger:** `CAND-23b` (customer self-cancel), `CAND-27`/`CAND-28` (recurring-enrollment occurrence/whole-series cancel), `CAND-34` step 4 (staff rejects a guest reservation), or `CAND-36` (system auto-expires an unresolved guest reservation)
- **State change:** `ClassSessionBooking.status → CANCELLED`; `ClassSession.reservedCount` decremented by `quantity`
- **Data:**
  ```
  {
    classSessionBookingId: string
    classSessionId:        string
    serviceId:              string
    quantity:                number
    reason:      "CUSTOMER_CANCELLED" | "ENROLLMENT_OCCURRENCE_SKIPPED" | "ENROLLMENT_CANCELLED"
                 | "STAFF_REJECTED" | "AUTO_EXPIRED_AT_SESSION_START"
  }
  ```

#### **ClassSessionBookingWaitlisted**
- **Trigger:** `CAND-24` (session full at booking time) or `CAND-22` A1 (session fills in the race window between load and submit)
- **State change:** `ClassSessionBooking.status → WAITLISTED`
- **Data:**
  ```
  {
    classSessionBookingId: string
    classSessionId:        string
    serviceId:              string
    quantity:                number
    contactEmail:            string
  }
  ```

#### **WaitlistPromoted**
- **Trigger:** `CAND-25` (a confirmed booking's cancellation frees enough capacity for the earliest fitting waitlisted entry)
- **State change:** `ClassSessionBooking.status: WAITLISTED → PROMOTION_PENDING`; later acceptance produces `ClassSessionBookingConfirmed`.
- **Data:**
  ```
  {
    classSessionBookingId: string
    classSessionId:        string
    serviceId:              string
    quantity:                number
    contactEmail:            string
    contactName:             string
  }
  ```

#### **ClassSessionBookingCompleted**
- **Trigger:** `CAND-37` (staff closes a session; publishes once per eligible attended `CUSTOMER` reservation — mirrors `BookingCompleted`'s role for Loyalty Context, per item 1/2 above)
- **State change:** `ClassSessionBooking.status → CLOSED`; consumed by Loyalty Context to insert a `LoyaltyEntry` (§3's `loyalty_entries` change above)
- **Data:**
  ```
  {
    classSessionBookingId: string
    classSessionId:        string
    serviceId:               string
    customerId:              string
    pointsValue:             number   // = points_value_per_unit_at_booking × quantity, attended units only
  }
  ```

#### **GuestClassReservationRequested**
- **Trigger:** `CAND-33` step 1 (guest submits contact + attendee details, before email verification) — consumed by Notification Context to send the one-time verification link
- **State change:** none (the `PENDING_EMAIL_VERIFICATION` draft is created in the same transaction, not itself event-sourced — it holds no capacity, so no cross-context consumer needs to react to its existence, only to send the email)
- **Data:**
  ```
  {
    classSessionBookingId: string
    classSessionId:        string
    contactEmail:            string
    verificationTokenId:     string   // opaque reference; the raw token is never in the event payload, only its hash is persisted (guest_class_booking_email_verifications)
  }
  ```

#### **ClassAccessContractCreated**
- **Trigger:** `CAND-35` step 2 (manager creates a contract)
- **State change:** `ClassAccessContract` row created, `status = ACTIVE`
- **Data:**
  ```
  {
    contractId:   string
    customerId:   string
    serviceIds:   string[]
    startsOn:     Date
    endsOn:       Date
  }
  ```

#### **ClassAccessContractCancelled**
- **Trigger:** `CAND-35` step 4 (manager cancels early) or `CAND-35` A1 (contract reaches its natural end date)
- **State change:** `ClassAccessContract.status → CANCELLED | EXPIRED`; dependent `RecurringEnrollment`s end; their future `ClassSessionBooking`s cancel (each publishing its own `ClassSessionBookingCancelled`)
- **Data:**
  ```
  {
    contractId:   string
    customerId:   string
    reason:       "MANAGER_CANCELLED" | "EXPIRED"
    endedEnrollmentIds: string[]
  }
  ```

#### **RecurringBookingScheduleCreated**
- **Trigger:** `CAND-45` (customer or staff confirms a recurring pattern on an `AUTO_CONFIRM` service), or `CAND-45b` step approving a `PENDING_APPROVAL` request on a `MANUAL_APPROVAL` service. **Updated 2026-08-28 (§6 item 42):** no longer fires at raw row creation for a `MANUAL_APPROVAL` service — see `RecurringBookingScheduleApprovalRequested` below for that case.
- **State change:** `RecurringBookingSchedule` row reaches `status = ACTIVE`; generation begins
- **Data:**
  ```
  {
    recurringScheduleId: string
    customerId:          string
    serviceId:           string
    resourceIds:         string[]
    assignmentPolicy:    "FIXED_ASSIGNMENT" | "RESOLVE_PER_OCCURRENCE"
    recurrence:          object   // same shape as recurring_booking_schedules.recurrence
    startsOn:            Date
  }
  ```

#### **RecurringBookingScheduleApprovalRequested**
- **Trigger:** `CAND-45` (customer confirms a recurring pattern on a `MANUAL_APPROVAL` service) — added 2026-08-28, §6 item 42
- **State change:** `RecurringBookingSchedule` row created, `status = PENDING_APPROVAL`, `approval_hold_expires_at` set. No occurrences generated. Consumed by Notification Context to alert staff, same role `BookingRequested` plays for a manual-approval appointment.
- **Data:**
  ```
  {
    recurringScheduleId: string
    customerId:          string
    serviceId:           string
    resourceIds:         string[]
    assignmentPolicy:    "FIXED_ASSIGNMENT" | "RESOLVE_PER_OCCURRENCE"
    recurrence:          object
    startsOn:            Date
    approvalHoldExpiresAt: ISO8601
  }
  ```

#### **RecurringBookingScheduleRejected**
- **Trigger:** `CAND-45b` (staff rejects) or its hold-expiry worker (unresolved past `approval_hold_expires_at`) — added 2026-08-28, §6 item 42
- **State change:** `RecurringBookingSchedule.status → CANCELLED`, `cancellation_reason = APPROVAL_REJECTED | APPROVAL_EXPIRED`
- **Data:**
  ```
  {
    recurringScheduleId: string
    customerId:          string
    serviceId:           string
    reason:              "APPROVAL_REJECTED" | "APPROVAL_EXPIRED"
  }
  ```

#### **RecurringBookingSchedulePaused**
- **Trigger:** `CAND-45` A2 (customer pauses the schedule)
- **State change:** `RecurringBookingSchedule.status → PAUSED`; no further occurrences generated until resumed
- **Data:**
  ```
  {
    recurringScheduleId: string
    customerId:          string
    serviceId:           string
  }
  ```

#### **RecurringBookingScheduleEnded**
- **Trigger:** `CAND-45` A2 (customer ends the schedule entirely)
- **State change:** `RecurringBookingSchedule.status → CANCELLED`; future materialized occurrences cancelled, releasing their resource occupancy
- **Data:**
  ```
  {
    recurringScheduleId: string
    customerId:          string
    serviceId:           string
    cancelledBookingIds: string[]   // future occurrences cancelled as a result
  }
  ```

#### **AvailabilityAlertCreated**
- **Trigger:** `CAND-46`
- **State change:** `availability_alerts` row created, `status = ACTIVE`
- **Data:**
  ```
  {
    alertId:      string
    customerId:   string
    serviceId:    string
    criteriaType: "ONE_TIME_RANGE" | "WEEKLY_PREFERENCE"
    expiresAt:    ISO8601
  }
  ```

#### **AvailabilityAlertUpdated**
- **Trigger:** `CAND-53` (customer edits criteria or expiry)
- **State change:** `availability_alerts` row's criteria/expiry columns updated in place
- **Data:**
  ```
  {
    alertId:    string
    customerId: string
    serviceId:  string
  }
  ```

#### **AvailabilityAlertCancelled**
- **Trigger:** `CAND-46` A2 (customer withdraws before a match) or `CAND-53` (explicit cancel)
- **State change:** `availability_alerts.status → CANCELLED`
- **Data:**
  ```
  {
    alertId:    string
    customerId: string
    serviceId:  string
  }
  ```

#### **AvailabilityAlertExpired**
- **Trigger:** System, `expires_at` has passed with no match
- **State change:** `availability_alerts.status → EXPIRED`
- **Data:**
  ```
  {
    alertId:    string
    customerId: string
    serviceId:  string
  }
  ```

#### **AvailabilityAlertMatched**
- **Trigger:** `CAND-46` step 3 (a released slot matches an `ACTIVE` alert's criteria) — consumed by Notification Context to send the deduplicated email/in-app message; corresponds to CAND-46/53's own "...notified" event
- **State change:** `availability_alerts.status → NOTIFIED`; one `availability_alert_notification_attempts` row inserted for the matching window (§2 above)
- **Data:**
  ```
  {
    alertId:            string
    customerId:         string
    serviceId:          string
    matchingWindowStart: ISO8601
    matchingWindowEnd:   ISO8601
    resourceId:          string | null   // set when the alert had a preferredResourceId
  }
  ```

#### **FutureCommitmentExceptionRaised**
- **Trigger:** `CAND-47` (a resource/hours/template/schedule change affects a future commitment nobody explicitly reviewed per-session — excludes a `CAND-32` range cancellation, see that candidate's note)
- **State change:** `future_commitment_exceptions` row created, `status = OPEN`
- **Data:**
  ```
  {
    exceptionId:  string
    sourceType:   string
    sourceId:     string
    affectedType: string
    affectedId:   string
    ownerStaffId: string | null
  }
  ```

#### **FutureCommitmentExceptionResolved**
- **Trigger:** `CAND-56` (manager keeps, reassigns, reschedules, or cancels)
- **State change:** `future_commitment_exceptions.status → RESOLVED`
- **Data:**
  ```
  {
    exceptionId:      string
    resolutionType:   string
    resolvedByStaffId: string
    affectedType:      string
    affectedId:        string
  }
  ```

#### **FutureCommitmentExceptionDismissed**
- **Trigger:** `CAND-56` A2 (manager dismisses a genuinely resolved/non-impacting item)
- **State change:** `future_commitment_exceptions.status → DISMISSED`
- **Data:**
  ```
  {
    exceptionId:       string
    resolvedByStaffId: string
    resolutionReason:  string
  }
  ```

#### **TenantSchedulingBootstrapped**
- **Trigger:** `CAND-51` (preset bootstrap commits)
- **State change:** Tenant's initial `Resource`/`Service` graph (and, for SESSION presets, first `ClassScheduleTemplate`s) created in one transaction
- **Data:**
  ```
  {
    tenantId:    string
    presetId:    string
    serviceIds:  string[]
    resourceIds: string[]
  }
  ```

#### **ResourceReactivated**
- **Trigger:** `CAND-52`
- **State change:** `Resource.isActive → true`
- **Data:**
  ```
  {
    resourceId:         string
    resourceType:       string
    reactivatedByStaffId: string
  }
  ```

#### **InPersonPaymentRecorded**
- **Trigger:** `CAND-37` step 2 / `CAND-54` (staff records a manually reported charge outcome at close-out; Ikaro does not process the payment)
- **State change:** `class_session_payments` manual operational record created
- **Data:**
  ```
  {
    paymentId:            string
    classSessionBookingId: string
    amount:                number
    currency:              "BRL"
    method:                string
    collectedByStaffId:    string
  }
  ```

#### **InPersonPaymentReversed**
- **Trigger:** `CAND-54` (a correction/reversal, never an overwrite of the original record)
- **State change:** New `class_session_payments` row inserted with `reversal_of_payment_id` set; the original row is untouched
- **Data:**
  ```
  {
    paymentId:            string
    reversalOfPaymentId:  string
    classSessionBookingId: string
    amount:                number
    correctionReason:      string
  }
  ```

#### **BookingNoShow**
- **Trigger:** `CAND-48` after an appointment's scheduled end time
- **State change:** appointment transitions to terminal `NO_SHOW`
- **Data:** `bookingId`, `tenantId`, `actorId`, `reason`, `occurredAt`
- **Consumers:** Notification Context sends a retryable customer email; Loyalty does not award completion points.

#### **ClassSessionBookingNoShow**
- **Trigger:** `CAND-37` when staff closes a session and marks an attendee absent
- **State change:** attendee attendance becomes `NO_SHOW`; the parent session booking remains auditable
- **Data:** `classSessionBookingId`, `attendeeId`, `classSessionId`, `customerId`, `occurredAt`
- **Consumers:** Notification Context sends a retryable customer email; Loyalty does not award completion points.

---

## 9. Engineering design assessment — is this a solid schema?

A DBA/engineering-design pass, distinct from §6's correctness fixes above: those found things that were *wrong*; this section evaluates what's here on its own terms — normalization, indexing, concurrency, and whether it holds up under the load this platform is meant to eventually carry (`CLAUDE.md`: "this is going to be an app that will receive high load"). Verdict up front: **yes, solid** — the core relational decisions are sound and several show real sophistication, not just competence. What follows is the specific case for that, plus the places worth a second look.

### What's genuinely well-designed

**`resource_occupancy` as one shared exclusion table (§5) is the standout decision in this entire schema.** Recognizing that a Postgres `EXCLUDE` constraint cannot span two tables, and that cross-family exclusivity (model #13's entire premise — Camila as both a hairdressing resource and a Pilates instructor) is *structurally* impossible to enforce at the DB layer without one shared table, is not an obvious call. The naive design — keep `Booking` resource-locks and `ClassSession` resource-locks in separate tables, reconcile in application code — would have shipped a race condition disguised as a feature, catchable only by an integration test that happens to hit the exact interleaving. This design makes the bug structurally impossible instead of merely tested-against.

**Denormalization here is disciplined, not accidental.** Every redundant column — `class_sessions.service_id`, `class_session_bookings.service_id`, `recurring_enrollments.service_id`, every `resource_type` on a pool/slot table — carries an explicit "denormalized from X, because Y" note (item 16). That's the difference between a schema that looks messy and one that's been through a real design review: a reader can tell which repeated columns are load-bearing query paths versus which would be unexplained duplication anywhere else.

**The `slot_index`/`requirement_index` removal (item 19) is a good example of resisting speculative generality.** An ordering column was proposed, then actually checked against every worked example, found unnecessary, and removed — rather than kept "just in case." That's the right default, and rarer in practice than it should be.

**The guarded-UPDATE capacity check, with an explicit note not to rely on TypeORM's `@VersionColumn` alone**, shows the design was checked against a documented trap specific to this codebase (`CLAUDE.md`'s TypeORM optimistic-locking pitfall), not just generic best practice.

**Tenant-first composite FKs are enforced as a real invariant, not a suggestion** — item 17 found and fixed three violations by checking directly against `CLAUDE.md §2.4` rather than trusting that "it probably followed the pattern."

### Deliberate tradeoffs worth stating explicitly, not just leaving implicit

**Three near-identical "pool" table shapes** (`service_resource_requirement_pool`, `service_leg_resource_requirement_pool`, `service_class_resource_pool`) look like an obvious unification candidate — one polymorphic `resource_pool_members(parent_type, parent_id, resource_id)` table instead of three. **That would be the wrong call.** Postgres has no clean way to express a polymorphic FK (`parent_id` referencing "whichever table `parent_type` names") — the referential integrity this schema currently gets for free at the DB level would become an application-enforced invariant instead, for a codebase whose own stated multi-tenancy rules (`CLAUDE.md §2.4`) treat DB-level enforcement as the standard, not an enhancement. The repetition here is the cost of keeping real FK integrity; it's correctly paid, not an oversight.

**Single-row contention on `class_sessions.reserved_count`/`reserved_non_member_count` under the guarded UPDATE is an accepted, correct limit, not a gap.** A viral class selling out in the same second means every concurrent booking attempt serializes on that one row's lock — which is exactly what "never oversell capacity" requires. The alternative (sharded counters, eventually-consistent capacity) would trade correctness for throughput this domain doesn't need: a single class session's realistic concurrent-request ceiling is nowhere near where row-level contention becomes the bottleneck. Worth naming so a future implementer doesn't "fix" this into something more complex and less correct.

### Where "high load, multi-year" needs a real answer this document doesn't give

**Retention — resolved 2026-08-21, two different answers for two different kinds of table, not one blanket policy.**

`resource_occupancy` should be trickle-deleted on a scheduled job, reusing the exact pattern `shared.outbox`/`shared.inbox` already use in production (`OutboxRelayService.gc()`, `docs/13-DATABASE_SCHEMA.md` § `shared.outbox`) — not partitioned, not kept indefinitely. It's the closer analog to outbox/inbox than it first looks: its entire reason to exist is letting the `GIST` exclusion constraint answer "is this resource free during this window," a question nobody ever asks about a window that has already elapsed. The actual business record — who booked what, for how much, whether they attended — already lives in `bookings`/`class_session_bookings`/`class_session_booking_attendees`; `resource_occupancy` is pure locking mechanism, not a record of anything, so deleting old rows here loses no business value, exactly like deleting a published outbox row loses none. Unlike outbox/inbox's 14-day window (driven by a hard correctness floor — Pub/Sub's redelivery ceiling — that doesn't apply here), a longer default like 90 days past `ends_at` is more appropriate: nothing forces it shorter, and there's real support/debugging value in "why was this booking rejected three weeks ago."

`class_session_bookings` and `class_session_booking_attendees` get the opposite answer: **no deletion job, ever, on a schedule.** These are the business record, and this platform's own stated direction is to become a BI layer over exactly this data (`CLAUDE.md` § Project Facts) — a studio owner wanting "bookings this year vs. last" two years from now needs these rows intact. If table size ever becomes a real operational problem — not at MVP, not soon — the right tool is time-based partitioning (by month, on `start_time`/`created_at`), which keeps every row queryable while shrinking what indexes/vacuum touch per operation, and allows moving old partitions to cheaper storage later without destroying anything. That's a "when the problem is real" decision to make at implementation time, not something to build speculatively into this discovery now.

**Adjacent, not solved here:** PII (contact name/email/phone) persists permanently in `class_session_bookings`, same as it already does in the existing `bookings` table. An LGPD/GDPR deletion request against that data needs an anonymize-in-place mechanism, which is a different concern from retention GC — whatever answer the existing `bookings` table already has (or doesn't) for this applies unchanged here; not new scope this discovery needs to invent.

**`class_schedule_templates.recurrence` (JSONB) is evaluated in application code on every availability check that touches an active template (`CAND-29` step 4, `CAND-31`)** — not just at generation time. This is bounded in practice (a single resource realistically has few active templates, narrowed first via the indexed `class_schedule_template_slots` lookup before any JSONB gets evaluated), so it isn't a hot-path risk today. But it's worth flagging as the one place in this schema where "how many templates can one resource realistically have" is a load-bearing assumption the document never states as one — if that assumption is ever wrong for some outlier tenant, there's no index or cache to fall back on, only re-evaluating more JSONB per query.

## 10. Promotion-complete lifecycle tables and invariants

The following are complete persistence contracts to carry into implementation; they are not optional notes.

| Table / change | Required columns, constraints and purpose |
|---|---|
| `services` approval policy | `default_approval_mode AUTO_CONFIRM|MANUAL_APPROVAL NULL`, `manual_hold_minutes NULL`; null inherits tenant defaults. Every appointment booking snapshots the effective mode/hold duration, so later configuration edits never rewrite a submitted booking. |
| `class_session_bookings` waitlist/offer fields | `waitlist_access_intent CONTRACT|IN_PERSON NULL`, `offer_offered_at`, `offer_expires_at`, `offer_responded_at`, `offer_response ACCEPTED|DECLINED|EXPIRED NULL`, `cancellation_reason NULL`; CHECK requires one-seat CUSTOMER rows and a non-null access intent for `WAITLISTED`/`PROMOTION_PENDING`, and ensures offer fields occur only for `PROMOTION_PENDING`/resolved offer states. Index `(tenant_id, status, offer_expires_at)` supports the expiry worker. |
| `class_session_booking_transitions` | `id, tenant_id, class_session_booking_id, from_status, to_status, reason, actor_type, actor_id NULL, occurred_at, correlation_id`; composite FK to booking, append-only, index `(tenant_id, class_session_booking_id, occurred_at)`. It is the audit source for approval, cancellation, offer and close-out decisions. |
| `class_session_payments` | Manual operational record only: `id, tenant_id, class_session_booking_id, amount NULLABLE, currency='BRL', method NULLABLE, outcome PAID|UNPAID|WAIVED, collected_by_staff_id, collected_at, reversal_of_payment_id NULL, correction_reason NULL`; composite self/booking FKs, amount required and `> 0` only for `PAID`, and at most one active manual record per booking where business policy requires it. It is not a gateway ledger; no charge, settlement, refund or reconciliation is performed by Ikaro. |
| `booking_quote_revisions` | `id, tenant_id, booking_id NULL, class_session_booking_id NULL, revision_no, amount, currency, reason, actor_type, actor_id NULL, occurred_at`; source-exclusive CHECK and partial unique revision sequence per source. Supports appointment reschedule and class attendee removal without overloading one booking family. |
| `class_session_booking_attendees` | Add `removed_at`, `removed_by_actor_type`, `removed_by_actor_id`, `removal_reason`; active attendee count must equal parent `quantity` in the same transaction that changes either record. Index active attendees by booking for roster reads. |
| `future_commitment_exceptions` | `id, tenant_id, source_type, source_id, affected_type, affected_id, status OPEN|RESOLVED|DISMISSED, owner_staff_id NULL, resolution_type NULL, resolution_reason NULL, resolved_by_staff_id NULL, resolved_at NULL, notification_outcome NULL`; `INDEX(tenant_id, affected_type, affected_id)` and `INDEX(tenant_id, owner_staff_id, status)` for lookup; idempotency: **`UNIQUE (tenant_id, source_type, source_id, affected_type, affected_id) WHERE status = 'OPEN'`** (§6 item 40) — a repeat trigger for the same unresolved impact updates the existing open row instead of duplicating it. |

**Capacity invariant, finalized:** `reserved_count` counts `CONFIRMED`, `PENDING_APPROVAL` and `PROMOTION_PENDING`; `reserved_non_member_count` counts those capacity-holding states for verified guests and authenticated customers without a qualifying contract. Every guarded update and cleanup worker uses both definitions.

**Retention, addendum (2026-08-22, Mode B restructuring pass):** §9 item 27's retention split predates this section and never explicitly revisited it — the four append-only tables introduced above (`class_session_booking_transitions`, `class_session_payments`, `booking_quote_revisions`, `future_commitment_exceptions`) fall under the same category as `class_session_bookings`/`class_session_booking_attendees`: business/audit record, no deletion job, ever. If size ever becomes a real problem, time-based partitioning is the answer, same reasoning as §9's own — restated here explicitly so this section doesn't read as an unstated exception to that split.

### Example data for §10

**`services` approval policy** — Sala de reunião, grounded in `public-13-pending-approval.html`'s own displayed hold ("indisponível... até **10:30**" on a 10:00 booking):

| service_id | default_approval_mode | manual_hold_minutes |
|---|---|---|
| svc_sala_reuniao | MANUAL_APPROVAL | 30 |

Ana's booking (`book_ana_sala_aurora_0818`, §3 above) snapshots this effective mode/duration at submission time — the same row already carrying `occ_4`'s `HOLD` / `hold_expires_at = 10:30` in `resource_occupancy`. A service left `null` here just inherits whatever the tenant default is; nothing about this table forces every appointment service to declare its own value.

**`class_session_bookings` waitlist/offer fields, `class_session_booking_transitions`, and `class_session_payments`** — continuing Marcos Tanaka's story from `sb_4` (waitlisted on `sess_pilates_0804`, `class_session_bookings` example in §2): Fernanda cancels her confirmed spot (`sb_1`) the day before the class, freeing a seat.

`class_session_bookings.sb_4`, before and after the offer:

| state | status | waitlist_access_intent | offer_offered_at | offer_expires_at | offer_responded_at | offer_response |
|---|---|---|---|---|---|---|
| offered | PROMOTION_PENDING | IN_PERSON | 2026-08-03T09:00-03:00 | 2026-08-03T11:00-03:00 | null | null |
| accepted | CONFIRMED | IN_PERSON | 2026-08-03T09:00-03:00 | 2026-08-03T11:00-03:00 | 2026-08-03T09:45-03:00 | ACCEPTED |

Marcos has no active contract, so his `waitlist_access_intent` is `IN_PERSON`, not `CONTRACT` — the same pay-per-class path `CAND-22b` gives a fresh booking, now reached via promotion instead. `class_session_booking_transitions` records both hops on `sb_4`:

| id | from_status | to_status | reason | actor_type | actor_id | occurred_at |
|---|---|---|---|---|---|---|
| trans_1 | WAITLISTED | PROMOTION_PENDING | CAPACITY_FREED | SYSTEM | null | 2026-08-03T09:00-03:00 |
| trans_2 | PROMOTION_PENDING | CONFIRMED | OFFER_ACCEPTED | CUSTOMER | cust_marcos | 2026-08-03T09:45-03:00 |

Marcos pays in person right after the class, matching `sb_4`'s own `total_price_at_booking_amount = 60.00`:

| id | class_session_booking_id | amount | currency | method | collected_by_staff_id | collected_at |
|---|---|---|---|---|---|---|
| pay_1 | sb_4 | 60.00 | BRL | PIX | staff_camila_id | 2026-08-04T09:05-03:00 |

**`booking_quote_revisions` and `class_session_booking_attendees` removal fields** — a new example, since neither existing group example (Pilates' `sb_1`–`sb_4`, already at capacity; the guest group `sb_3`, not eligible for `CAND-49`) fits: Patrícia Nunes, a contract-backed CrossFit customer, books `quantity = 2` (herself plus a friend) on a roomy CrossFit session (`sess_crossfit_0811`, capacity 20 — no conflict with the Pilates capacity math established elsewhere), then her friend drops out before the cutoff.

`class_session_bookings.sb_patricia` (CrossFit, `Aula de CrossFit`, contract-backed):

| state | quantity | total_price_at_booking_amount |
|---|---|---|
| initial | 2 | 160.00 |
| after removal | 1 | 80.00 |

`class_session_booking_attendees`, showing the removal fields §10 adds:

| id | class_session_booking_id | name | removed_at | removed_by_actor_type | removed_by_actor_id | removal_reason |
|---|---|---|---|---|---|---|
| att_patricia_1 | sb_patricia | Patrícia Nunes | null | null | null | null |
| att_patricia_2 | sb_patricia | Letícia Alves | 2026-08-11T14:00-03:00 | CUSTOMER | cust_patricia | Amiga não poderá comparecer |

`booking_quote_revisions` records the price change this produces:

| id | class_session_booking_id | revision_no | amount | currency | reason | actor_type | occurred_at |
|---|---|---|---|---|---|---|---|
| rev_1 | sb_patricia | 1 | 160.00 | BRL | INITIAL | CUSTOMER | 2026-08-10T09:00-03:00 |
| rev_2 | sb_patricia | 2 | 80.00 | BRL | ATTENDEE_REMOVED | CUSTOMER | 2026-08-11T14:00-03:00 |

Removing `att_patricia_2` and inserting `rev_2` happen in the same transaction as the active-attendee-count-must-equal-`quantity` invariant this table's own row states — `quantity` drops to 1 exactly when the active attendee count does, never as two separately-committed steps.

**`future_commitment_exceptions`** — Fábio's week-off cancellation (`class_schedule_template_exceptions`'s `tpl_exc_1`, §2 above) only stops *future* generation; a CrossFit session already materialized inside that window (`sess_crossfit_0917`, Thursday 2026-09-17, already carrying real bookings) needs its own resolution:

| state | status | owner_staff_id | resolution_type | resolved_by_staff_id | resolved_at | notification_outcome |
|---|---|---|---|---|---|---|
| raised | OPEN | staff_fabio_id | null | null | null | null |
| resolved | RESOLVED | staff_fabio_id | SESSION_CANCELLED | staff_fabio_id | 2026-08-25T10:00-03:00 | NOTIFIED |

(`id = fce_1`, `source_type = TEMPLATE_EXCEPTION`, `source_id = tpl_exc_1`, `affected_type = CLASS_SESSION`, `affected_id = sess_crossfit_0917` throughout.) CAND-47 raises it the moment the template exception is saved — the system never silently cancels `sess_crossfit_0917` itself. CAND-56 is what actually resolves it: here, the manager chooses to cancel the one affected session and notify its bookings' customers, each producing its own `ClassSessionCancelled` (§8) independent of this row.
