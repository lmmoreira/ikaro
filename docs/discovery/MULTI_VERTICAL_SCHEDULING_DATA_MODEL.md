# Discovery: Multi-Vertical Scheduling — Data Model

**Status:** Discovery — exploratory. No migration files exist yet; nothing here is committed to a milestone. Column/constraint names below are illustrative (snake_case, matching `docs/13-DATABASE_SCHEMA.md` conventions) — subject to change at implementation time.
**Companion doc:** `MULTI_VERTICAL_SCHEDULING.md` — the domain model this schema implements (§3–§8 in particular).
**Companion doc:** `MULTI_VERTICAL_SCHEDULING_USECASES.md` — candidate use cases (`CAND-XX`) referenced throughout.
**Companion prototype:** `MULTI_VERTICAL_SCHEDULING/prototype/`.

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

`service_booking_intake_schema` is a versioned service-owned definition of booking questions, consent text/version, participant rules and typed field markers such as `PICKUP_ADDRESS`. `booking_attendees` is an optional child table: `id, tenant_id, booking_id, name, customer_id NULL, is_minor`. It is used only when the service requires named attendees; the responsible booking customer remains separate. The booking stores immutable `intake_schema_version` and `intake_answers JSONB` snapshots, while operational values stay typed on booking records (for example, pickup address, participant count and consent timestamp/version).

### `booking.recurring_booking_schedules` / assignments / exceptions

Private appointment/reservation recurrence is distinct from `recurring_enrollments`. `recurring_booking_schedules` owns tenant/customer/service, recurrence JSONB, `starts_on`/`ends_on`, `ACTIVE|PAUSED|CANCELLED` status, policy snapshots, `assignment_policy FIXED_ASSIGNMENT|RESOLVE_PER_OCCURRENCE`, and `created_by_staff_id`.

`recurring_booking_schedule_resource_assignments` is the durable child assignment record: `tenant_id, recurring_schedule_id, requirement_id NULL, resource_id, resource_type, required_quantity_position NULL, assigned_at`; it uses composite FKs and an FK to `(tenant_id, resource_id, resource_type)`. It is mandatory for `FIXED_ASSIGNMENT`; `RESOLVE_PER_OCCURRENCE` retains the eligible requirement/pool only and resolves distinct resources during each materialization. Customer/staff-selected resources default to fixed; automatic/fungible services may use either policy.

`recurring_booking_schedule_exceptions` persists skip/reschedule-one exceptions with occurrence start, replacement booking reference nullable, actor, reason and timestamps. Generated ordinary bookings link through nullable `recurring_schedule_id` and have a unique `(tenant_id, recurring_schedule_id, occurrence_start)` generation key. They retain their independent lifecycle, quote/audit/no-show history. A schedule is a standing availability commitment, so availability checks evaluate its future pattern directly as they do for class templates.

### `booking.availability_alerts`

An expiring intent only: `id, tenant_id, service_id, customer_id NOT NULL, preferred_resource_id NULL, criteria_type ONE_TIME_RANGE|WEEKLY_PREFERENCE, timezone, acceptable_start_at/acceptable_end_at NULL, weekdays JSONB NULL, local_start_time/local_end_time NULL, duration_minutes NULL, participant_count NULL, status ACTIVE|NOTIFIED|CANCELLED|EXPIRED, expires_at`. A CHECK makes exactly one criteria representation valid: absolute timestamps for `ONE_TIME_RANGE`, weekday/time preferences for `WEEKLY_PREFERENCE`. Notification history is `availability_alert_notification_attempts` with `alert_id`, a normalized matching-window range, channel, attempted_at/outcome and unique `(tenant_id, alert_id, matching_window, channel)`. It creates no occupancy and never becomes a booking automatically. An authenticated customer is required, so there is no guest email identity column.

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

`occ_1` and `occ_3` both reference `res_staff_camila`, but at non-overlapping times (Monday 08:00–09:00 vs. Tuesday 14:00–14:45), so no constraint violation. If a haircut request landed right on top of her Pilates class — say Monday 08:00–08:30 — a fourth row here would collide with `occ_1` on the shared GIST exclusion constraint and get rejected at the DB level, regardless of which family (`BOOKING_LINE` vs. `CLASS_SESSION`) is asking. This is the Camila Duarte scenario from domain doc §6, made concrete and DB-enforced.

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

`class_access_contracts` are eligibility records, not online-payment records. Their successful creation/payment is outside this discovery. A customer session booking is either contract-backed with a matching active contract on the session date, or—when the service allows it—pay-per-class and paid in person at close-out. Guest bookings use the configured guest policy and are paid in person when payment is due.

**Worked example — mixed-modality contract, added 2026-08-21 to ground Preset F ("Estúdio Misto," `MULTI_VERTICAL_SCHEDULING_ONBOARDING_PRESETS.md`).** A studio owner offering Pilates + CrossFit sells `cust_roberta` a single contract covering both, unmodified — `eligibleServiceIds` is already an array:

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
| `loyalty.loyalty_entries` (different context — see §6 item 2, correction in §6 item 24) | `booking_id` **and** `booking_line_id` → both NULLABLE (both are NOT NULL today — the original entry here only widened `booking_line_id`, an oversight caught 2026-08-21: `docs/13-DATABASE_SCHEMA.md`'s real schema has `booking_id UUID NOT NULL` too, and the worked example below always needed both null together), `+ class_session_booking_id UUID NULLABLE`, `+ CHECK CHK_loyalty_entries_source_exclusive: (booking_id IS NOT NULL AND booking_line_id IS NOT NULL AND class_session_booking_id IS NULL) OR (booking_id IS NULL AND booking_line_id IS NULL AND class_session_booking_id IS NOT NULL)`, `+ UNIQUE(tenant_id, class_session_booking_id) WHERE class_session_booking_id IS NOT NULL` (the existing `UNIQUE(tenant_id, booking_line_id)` idempotency constraint needs no change — Postgres already permits multiple NULLs under a plain UNIQUE, so it keeps enforcing uniqueness only among non-null values). |
| `booking.booking_lines` | `+ UNIQUE(tenant_id, line_id)` — today only `PRIMARY KEY (line_id)` exists; required so `resource_occupancy.booking_line_id`'s composite FK `(tenant_id, booking_line_id)` is expressible against the real schema. |

**Example data — `services`:**

| id | name | booking_model | buffer_after_minutes | class_catalog_color | class_catalog_allows_drop_in | class_catalog_allows_series |
|---|---|---|---|---|---|---|
| svc_corte_escova | Corte + Escova | APPOINTMENT | 10 | null | null | null |
| svc_massagem_relaxante | Massagem Relaxante | APPOINTMENT | 15 | null | null | null |
| svc_pilates | Aula de Pilates | SESSION | null | #2563eb | true | true |
| svc_jornada_spa | Jornada Spa Vitta | APPOINTMENT | null | null | null | null |

The three `class_catalog_*` columns are meaningless (left `null`) on APPOINTMENT services — same pattern as `buffer_after_minutes` being `null` on legged services above: a column that only applies to one branch, not enforced by a `CHECK` for the same app-enforced-not-DB-enforced reason already established for this table.

`svc_pilates` has `buffer_after_minutes = null` because SESSION-model services don't use it at all — turnover lives on the template's own resources instead. `svc_jornada_spa` is also `null`, but for a different reason: it's legged, so per-leg `transition_gap_after_minutes` plus per-resource `turnover_minutes` do this job there instead (§7 of the domain doc).

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

**Example data — `loyalty.loyalty_entries`:**

| id | booking_id | booking_line_id | class_session_booking_id | service_id | points |
|---|---|---|---|---|---|
| le_1 | book_123 | line_456 | null | svc_corte_escova | 2 |
| le_2 | null | null | sb_2 | svc_pilates | 1 |

`le_1` is today's existing path (a completed haircut). `le_2` is the new path this discovery adds: Roberta's Pilates class (`sb_2`) completing — `booking_id`/`booking_line_id` both `null`, `class_session_booking_id` set instead, enforced by the mutual-exclusion CHECK.

---

## 4. Migration ordering (expand/contract)

1. **Expand:** create `resources`, service/model fields, all requirement/leg tables, contract/attendee/trial/exception tables, session tables, and `resource_occupancy` with every composite FK and index; add `UNIQUE(tenant_id, line_id)` to the existing `booking_lines` table, required by `resource_occupancy`'s composite FK to it. Do not drop the current tenant-wide booking exclusion yet.
2. **Backfill:** create one active `LOCATION` resource per tenant; add the default LOCATION requirement to each existing APPOINTMENT service; materialize resource-occupancy assignment rows for every existing BookingLine, using that location and the existing `scheduled_end_at` window. Approved rows are `lock_state='COMMITTED'`.
3. **Dual-read/write deployment:** new booking writes populate occupancy snapshots; approval/generation/override paths use the shared occupancy exclusion constraint and advisory resource locks. Availability reads occupancy, tenant/resource schedules, and future template patterns.
4. **Validate:** verify every existing approved booking has a locked LOCATION occupancy row and that no resource assignment is missing or cross-tenant before changing the old invariant.
5. **Contract:** drop `EX_booking_bookings_approved_slot` only after the new invariant is live and backfilled. Leaving it in place would wrongly block simultaneous bookings in separate resources.
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

This still leaves exactly one case with no row-level DB backstop: an appointment booked against a resource's **not-yet-materialized** future template occurrence. Pattern evaluation remains necessary, but is not safe on its own under concurrent template edits/booking approvals. Every template create/edit/deactivate, appointment approval, generator write, and session-resource override acquires transaction-scoped advisory locks for its resources in canonical `resource_id` order. That serializes the read-check/write boundary for the future-pattern case while the exclusion constraint protects materialized occurrences.

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

11. **Aggregate/outbox wiring for the new events is an open architectural decision, not a detail.** `ClassSessionBookingConfirmed`/`Waitlisted`/`Completed`, `WaitlistPromoted`, `ClassSessionCancelled` are all triggered by a specific use-case call (`ClassSessionBooking`/`ClassSession` transitioning state) — the same shape as `Booking`'s 3-aggregate transactional-outbox pattern (TD24-S02), not the 4-cron direct-publish pattern (which already correctly shows "Events Triggered: None" on CAND-13/CAND-25b — no gap there). This means `ClassSession` and `ClassSessionBooking` becoming full `AggregateRoot`s with their own outbox-draining repositories is a real, non-trivial commitment the domain doc never states outright.

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

---

## 7. Final discovery decisions carried to the domain document

- Every existing tenant receives one explicit active `LOCATION` resource during the expand/backfill migration. It is an addressable default resource; `resource_id IS NULL` on a closure/opening remains the distinct tenant-wide “everything” sentinel.
- `Resource.maxCapacity` is now an optional physical ceiling for capacity-bearing resources. Template/session capacity cannot exceed the lowest applicable ceiling.
- SESSION services use service-scoped eligible resource pools and fixed template picks. They never carry APPOINTMENT `resourceRequirements` or `legs`.
- The class family has no ad-hoc session creation and no online billing. **Corrected 2026-08-21 — this bullet used to also claim "no customer pay-per-session path," which now directly contradicts `CAND-22b` below; that was never updated when `CAND-22b` was added, a real internal contradiction caught on re-review, not just a wording gap.** Customer access is through one active, non-overlapping, service-scoped contract (`CAND-22`/`CAND-26`), **or**, when the tenant allows non-member traffic on that service, a pay-per-class booking with no contract at all (`CAND-22b`) — subject to the same `trial_slots` capacity-protection gate a guest goes through. Configured guest trials/drop-ins remain the fully-anonymous third path.
- Capacity, guest verification/approval, attendee-level attendance, cancellation ranges, and future-template concurrency are all resolved above. Candidate domain events are formalized in §8 below. There are no remaining schema-level open questions that block promotion into milestone planning.
- **Added 2026-08-21:** per-session non-member capacity (`trial_slots`/`reserved_non_member_count`, replacing the earlier global `guest_approval_mode`), a real contract-less pay-per-class path (`CAND-22b`), fixed-slot make-up (`rescheduled_from_id`, `CAND-38`), and a dedicated `classSkipWindowHours` for `CAND-27`.

---

## 8. Candidate Domain Events

> Added to close a coverage gap found during a pre-promotion audit (2026-08-07): every candidate event referenced across this discovery set (`ClassSessionCancelled`, `ClassSessionBookingConfirmed`/`Cancelled`/`Waitlisted`/`Completed`, `WaitlistPromoted`, plus CAND-33's "candidate guest-verification/guest-reservation events" and CAND-35's "candidate contract-created/cancelled events") was named in a CAND's "Events Triggered" field but never given a concrete envelope/payload, unlike every event in `docs/03-DOMAIN_EVENTS.md`. Follows that file's mandatory envelope (`eventId`, `tenantId`, `occurredAt`, `correlationId`, `eventName`, `eventVersion`, `data`) exactly — only the `data` shape is shown below, per that doc's own convention. All are Booking Context events (item 11 above already flags that `ClassSession`/`ClassSessionBooking` becoming outbox-draining `AggregateRoot`s is the real architectural commitment this implies).

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
| `class_session_payments` | `id, tenant_id, class_session_booking_id, amount, currency='BRL', method, collected_by_staff_id, collected_at, reversal_of_payment_id NULL, correction_reason NULL`; composite self/booking FKs, CHECK amount > 0, and at most one non-reversed collection per booking/method where business policy requires it. It is the only payment ledger; no mutable paid-total column belongs on the booking. |
| `booking_quote_revisions` | `id, tenant_id, booking_id NULL, class_session_booking_id NULL, revision_no, amount, currency, reason, actor_type, actor_id NULL, occurred_at`; source-exclusive CHECK and partial unique revision sequence per source. Supports appointment reschedule and class attendee removal without overloading one booking family. |
| `class_session_booking_attendees` | Add `removed_at`, `removed_by_actor_type`, `removed_by_actor_id`, `removal_reason`; active attendee count must equal parent `quantity` in the same transaction that changes either record. Index active attendees by booking for roster reads. |
| `future_commitment_exceptions` | `id, tenant_id, source_type, source_id, affected_type, affected_id, status OPEN|RESOLVED|DISMISSED, owner_staff_id NULL, resolution_type NULL, resolution_reason NULL, resolved_by_staff_id NULL, resolved_at NULL, notification_outcome NULL`; source/affected lookup indexes and an idempotency unique key for the same unresolved impact. |

**Capacity invariant, finalized:** `reserved_count` counts `CONFIRMED`, `PENDING_APPROVAL` and `PROMOTION_PENDING`; `reserved_non_member_count` counts those capacity-holding states for verified guests and authenticated customers without a qualifying contract. Every guarded update and cleanup worker uses both definitions.
