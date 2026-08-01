# Discovery: Multi-Vertical Scheduling — Data Model

**Status:** Discovery — exploratory. No migration files exist yet; nothing here is committed to a milestone. Column/constraint names below are illustrative (snake_case, matching `docs/13-DATABASE_SCHEMA.md` conventions) — subject to change at implementation time.
**Companion doc:** `MULTI_VERTICAL_SCHEDULING.md` — the domain model this schema implements (§3–§8 in particular).
**Companion doc:** `MULTI_VERTICAL_SCHEDULING_USECASES.md` — candidate use cases (`CAND-XX`) referenced throughout.
**Companion prototype:** `MULTI_VERTICAL_SCHEDULING/prototype/`.

## 1. Purpose

Translates the domain model into a concrete physical schema — following this codebase's real conventions (`docs/13-DATABASE_SCHEMA.md`'s schema-per-context, UUID v7, tenant-first composite FKs/indexes, expand/contract migrations) rather than the language-agnostic properties sketched in the domain doc. Building the actual tables surfaced several gaps the prose model doesn't have — §6 is the point of this document as much as the schema itself.

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
| turnover_minutes | INT | NOT NULL DEFAULT 0 |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at / updated_at | TIMESTAMPTZ | DEFAULT now() |
| **UNIQUE** | (tenant_id, id) | Composite FK target |
| **UNIQUE** | (tenant_id, ref_id) WHERE type='STAFF' AND ref_id IS NOT NULL | CAND-01 A1 — one `Resource` per `Staff` row, DB-enforced without needing a cross-schema FK |
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

### `booking.service_resource_requirements` / `booking.service_resource_requirement_pool`

Normalizes `Service.resourceRequirements[]` (domain doc §5).

| Table | Column | Type | Constraints |
|---|---|---|---|
| `service_resource_requirements` | id | UUID | PRIMARY KEY |
| | tenant_id | UUID | NOT NULL |
| | service_id | UUID | NOT NULL — FK (tenant_id, service_id) → `services` |
| | requirement_index | INT | NOT NULL — order within the bundle |
| | resource_type | VARCHAR(20) | NOT NULL |
| | selection_mode | VARCHAR(30) | NOT NULL — CHECK IN (`NONE`, `CUSTOMER_CHOICE`, `AUTO_ANY`, `AUTO_FUNGIBLE_POOL`) |
| | **UNIQUE** | (tenant_id, service_id, requirement_index) | |
| `service_resource_requirement_pool` | tenant_id | UUID | NOT NULL |
| | requirement_id | UUID | NOT NULL — FK → `service_resource_requirements` |
| | resource_id | UUID | NOT NULL — FK (tenant_id, resource_id) → `resources` |
| | **PK** | (tenant_id, requirement_id, resource_id) | |

Today's car wash is the degenerate case: one row, `resource_type='LOCATION'`, `selection_mode='NONE'`, empty pool.

**Example data — Massagem Relaxante** (`manager-02-service-resource-config.html`'s 3-way bundle):

`service_resource_requirements`:

| id | service_id | requirement_index | resource_type | selection_mode |
|---|---|---|---|---|
| req_1 | svc_massagem_relaxante | 0 | STAFF | CUSTOMER_CHOICE |
| req_2 | svc_massagem_relaxante | 1 | ROOM | AUTO_FUNGIBLE_POOL |
| req_3 | svc_massagem_relaxante | 2 | EQUIPMENT | AUTO_ANY |

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
| `service_leg_resource_requirements` | id | UUID | PRIMARY KEY |
| | tenant_id | UUID | NOT NULL |
| | leg_id | UUID | NOT NULL — FK → `service_legs` |
| | requirement_index | INT | NOT NULL — order within this leg's own bundle |
| | resource_type | VARCHAR(20) | NOT NULL |
| | selection_mode | VARCHAR(30) | NOT NULL |
| | **UNIQUE** | (tenant_id, leg_id, requirement_index) | |
| `service_leg_resource_requirement_pool` | tenant_id | UUID | NOT NULL |
| | requirement_id | UUID | NOT NULL — FK → `service_leg_resource_requirements` |
| | resource_id | UUID | NOT NULL — FK → `resources` |
| | **PK** | (tenant_id, requirement_id, resource_id) | |

**Example data — Jornada Spa Vitta** (`svc_jornada_spa`, from `public-05-multi-leg-itinerary.html`):

`service_legs`:

| id | leg_index | name | duration_minutes | transition_gap_after_minutes |
|---|---|---|---|---|
| leg_0 | 0 | Sauna | 20 | 10 |
| leg_1 | 1 | Massagem | 50 | 5 |
| leg_2 | 2 | Sala de Relaxamento | 20 | 0 |

`service_leg_resource_requirements`:

| id | leg_id | requirement_index | resource_type | selection_mode |
|---|---|---|---|---|
| req_l0_0 | leg_0 | 0 | ROOM | AUTO_ANY |
| req_l1_0 | leg_1 | 0 | STAFF | CUSTOMER_CHOICE |
| req_l1_1 | leg_1 | 1 | ROOM | AUTO_ANY |
| req_l2_0 | leg_2 | 0 | ROOM | AUTO_ANY |

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
| valid_from | DATE | NULLABLE |
| valid_until | DATE | NULLABLE |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| created_at / updated_at | TIMESTAMPTZ | DEFAULT now() |
| **UNIQUE** | (tenant_id, id) | |
| **CHECK** | valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from | |
| **INDEX** | (tenant_id, service_id, is_active) | |

**Example data:**

| id | service_id | recurrence | capacity | valid_from | valid_until | is_active |
|---|---|---|---|---|---|---|
| tpl_pilates_estudio1 | svc_pilates | `{"frequency":"WEEKLY","daysOfWeek":["MON","WED","FRI"],"startTime":"08:00"}` | 4 | null | null | true |
| tpl_crossfit_fabio | svc_crossfit | `{"frequency":"WEEKLY","daysOfWeek":["TUE","THU"],"startTime":"18:00"}` | 20 | 2026-08-01 | 2026-09-30 | true |

`tpl_crossfit_fabio` is Fábio Ramos's template already shown on `manager-03-class-templates.html` ("até 30/09/2026 (turma de 6 semanas)") — a concrete `valid_until` in use, not a hypothetical one.

### `booking.service_class_resource_pool`

The eligible-resource pool for a SESSION-model service's slots — declared **once per service**, shared by every `ClassScheduleTemplate` of that service. **Corrected from an earlier draft of this document** — see §6 item 15: the pool was originally scoped to `template_id`, which had two real problems (no `CAND` ever populated it, and it forced re-curating the same eligibility list separately for every template of the same service). Scoping to `service_id` instead reuses the same "who's eligible" question the flat/APPOINTMENT case already answers via `service_resource_requirements`/pool — just without a `selection_mode`, since nothing here resolves dynamically per booking; a template's slot is picked once, manually, by a manager (CAND-11), from this pool.

| Column | Type | Constraints |
|---|---|---|
| tenant_id | UUID | NOT NULL |
| service_id | UUID | NOT NULL — FK (tenant_id, service_id) → `services` |
| slot_index | INT | NOT NULL — 0 = instructor, 1 = room, 2 = optional equipment, etc.; the slot *shape* (how many, what types) is a property of the service, shared by every template of it |
| resource_type | VARCHAR(20) | NOT NULL |
| resource_id | UUID | NOT NULL — FK (tenant_id, resource_id) → `resources` |
| **PK** | (tenant_id, service_id, slot_index, resource_id) | |
| **INDEX** | (tenant_id, service_id, slot_index) | Feeds the "who's eligible" picker on `manager-06-criar-turma.html` |

**Example data — Aula de Pilates and CrossFit:**

| service_id | slot_index | resource_type | resource_id | (name) |
|---|---|---|---|---|
| svc_pilates | 0 | STAFF | res_staff_camila | Camila Duarte |
| svc_pilates | 0 | STAFF | res_staff_ana | Ana Beatriz |
| svc_pilates | 1 | ROOM | res_room_estudio1 | Estúdio 1 |
| svc_pilates | 1 | ROOM | res_room_estudio2 | Estúdio 2 |
| svc_crossfit | 0 | STAFF | res_staff_bruno | Bruno Alves |
| svc_crossfit | 0 | STAFF | res_staff_joao | João Mendes |
| svc_crossfit | 0 | STAFF | res_staff_fabio | Fábio Ramos |
| svc_crossfit | 1 | ROOM | res_room_crossfit | Área CrossFit |
| svc_crossfit | 2 | EQUIPMENT | res_equip_halteres_r1 | Kit Halteres (Rack 1) |
| svc_crossfit | 2 | EQUIPMENT | res_equip_halteres_r2 | Kit Halteres (Rack 2) |

Filled on `manager-02-service-resource-config.html` — the same screen and checklist mechanism `CAND-06` step 3 already uses for the flat case, extended to also cover the `SESSION` branch instead of showing only a static handoff card.

### `booking.class_schedule_template_slots`

The template's own resolved pick per slot — one specific answer, not a list. Each row's `resource_id` must be a member of `service_class_resource_pool` for that same `(service_id, slot_index)` — app-enforced, not a DB constraint (Postgres can't express a cross-table CHECK), same pattern as this codebase's other aggregate-enforced invariants.

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| template_id | UUID | NOT NULL — FK → `class_schedule_templates` |
| slot_index | INT | NOT NULL — 0 = instructor, 1 = room, 2 = optional equipment, etc. |
| resource_type | VARCHAR(20) | NOT NULL |
| resource_id | UUID | NOT NULL — the one resource actually assigned to this template's slot |
| **UNIQUE** | (tenant_id, template_id, slot_index) | |

**Example data — Pilates (2 slots, no equipment) vs. CrossFit (3 slots):**

| template_id | slot_index | resource_type | resource_id |
|---|---|---|---|
| tpl_pilates_estudio1 | 0 | STAFF | res_staff_camila |
| tpl_pilates_estudio1 | 1 | ROOM | res_room_estudio1 |
| tpl_crossfit_fabio | 0 | STAFF | res_staff_fabio |
| tpl_crossfit_fabio | 1 | ROOM | res_room_crossfit |
| tpl_crossfit_fabio | 2 | EQUIPMENT | res_equip_halteres_r1 |

Camila was picked for `tpl_pilates_estudio1` even though Ana was also eligible (both are in `svc_pilates`'s shared pool above); Fábio was picked for this CrossFit template even though Bruno and João were also eligible — matching `manager-03`'s "(1 de 3 elegíveis)" text exactly, and the same pool any *other* future CrossFit template would draw from too. Note Pilates has **no** `slot_index = 2` row at all — no equipment slot, because nothing about Pilates is independently contended beyond the room's own fixed capacity (see the STAFF+ROOM-only discussion earlier in this conversation).

### `booking.class_sessions`

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| template_id | UUID | NULLABLE — FK → `class_schedule_templates`; null = ad-hoc (see §6 item 7 — currently unused surface) |
| service_id | UUID | NOT NULL |
| start_time / end_time | TIMESTAMPTZ | NOT NULL |
| capacity | INT | NOT NULL CHECK > 0 |
| booked_count | INT | NOT NULL DEFAULT 0 CHECK (booked_count >= 0 AND booked_count <= capacity) |
| status | VARCHAR(20) | NOT NULL DEFAULT 'SCHEDULED' — CHECK IN (`SCHEDULED`, `CANCELLED`) |
| version | INT | NOT NULL DEFAULT 1 — optimistic-lock guard, mirrors `bookings.version` |
| created_at / updated_at | TIMESTAMPTZ | DEFAULT now() |
| **UNIQUE** | (tenant_id, id) | |
| **UNIQUE** | (tenant_id, template_id, start_time) WHERE template_id IS NOT NULL | CAND-13's idempotency key |
| **INDEX** | (tenant_id, service_id, start_time) | |
| **INDEX** | (tenant_id, status, start_time) | |

**Example data:**

| id | template_id | service_id | start_time | end_time | capacity | booked_count | status |
|---|---|---|---|---|---|---|---|
| sess_pilates_0804 | tpl_pilates_estudio1 | svc_pilates | 2026-08-04T08:00-03:00 | 2026-08-04T09:00-03:00 | 4 | 4 | SCHEDULED |

Same session shown in `staff-02-session-roster.html`. Its roster card currently displays "3 de 4 vagas preenchidas" (75% bar) — but summing the actual attendee quantities (see `session_bookings` example below) gives 4, i.e. genuinely full. That display text/bar is a real bug in the prototype, found while grounding this example — flagged separately from this discovery's own scope.

### `booking.class_session_resources`

Per-instance snapshot/override of the template's resolved slots (CAND-14): `tenant_id, class_session_id, slot_index, resource_id` — `PK (tenant_id, class_session_id, slot_index)`.

**Example data:**

| class_session_id | slot_index | resource_id |
|---|---|---|
| sess_pilates_0804 | 0 | res_staff_camila |
| sess_pilates_0804 | 1 | res_room_estudio1 |

Snapshotted straight from `tpl_pilates_estudio1`'s slots at generation time. CAND-14 (e.g. "instructor injury, swap the room today only") would update just this row — `tpl_pilates_estudio1` itself, and every *other* session it generates, stay untouched.

### `booking.resource_occupancy` — new, not named anywhere in the domain doc

**The single physical mechanism that makes cross-family resource exclusivity (CAND-31, model 13) DB-enforceable.** See §5 for why this table has to exist and why it has to be shared by both families rather than split per-family.

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| resource_id | UUID | NOT NULL — FK (tenant_id, resource_id) → `resources` |
| source_type | VARCHAR(20) | NOT NULL — CHECK IN (`BOOKING_LINE`, `CLASS_SESSION`) |
| booking_line_id | UUID | NULLABLE — set iff `source_type = 'BOOKING_LINE'` |
| leg_index | INT | NULLABLE — null for flat (non-legged) services |
| class_session_id | UUID | NULLABLE — set iff `source_type = 'CLASS_SESSION'` |
| resource_name_at_booking | VARCHAR(255) | NOT NULL — snapshot, mirrors `booking_lines.service_name_at_booking` |
| starts_at / ends_at | TIMESTAMPTZ | NOT NULL |
| is_locked | BOOLEAN | NOT NULL DEFAULT false — see §5 for when this flips |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| **CHECK** | (source_type='BOOKING_LINE' AND booking_line_id IS NOT NULL AND class_session_id IS NULL) OR (source_type='CLASS_SESSION' AND class_session_id IS NOT NULL AND booking_line_id IS NULL) | |
| **EXCLUDE USING gist** | (tenant_id WITH =, resource_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (is_locked) | The exclusivity guarantee itself |
| **INDEX** | (tenant_id, resource_id, starts_at) | |

**Example data:**

| id | resource_id | source_type | booking_line_id | class_session_id | starts_at | ends_at | is_locked |
|---|---|---|---|---|---|---|---|
| occ_1 | res_staff_camila | CLASS_SESSION | null | sess_pilates_0804 | 2026-08-04T08:00 | 2026-08-04T09:00 | true |
| occ_2 | res_room_estudio1 | CLASS_SESSION | null | sess_pilates_0804 | 2026-08-04T08:00 | 2026-08-04T09:00 | true |
| occ_3 | res_staff_camila | BOOKING_LINE | line_corte_bruna | null | 2026-08-05T14:00 | 2026-08-05T14:45 | true |

`occ_1` and `occ_3` both reference `res_staff_camila`, but at non-overlapping times (Monday 08:00–09:00 vs. Tuesday 14:00–14:45), so no constraint violation. If a haircut request landed right on top of her Pilates class — say Monday 08:00–08:30 — a fourth row here would collide with `occ_1` on the shared GIST exclusion constraint and get rejected at the DB level, regardless of which family (`BOOKING_LINE` vs. `CLASS_SESSION`) is asking. This is the Camila Duarte scenario from domain doc §6, made concrete and DB-enforced.

### `booking.session_bookings`

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PRIMARY KEY |
| tenant_id | UUID | NOT NULL |
| class_session_id | UUID | NOT NULL — FK (tenant_id, class_session_id) → `class_sessions` |
| type | VARCHAR(20) | NOT NULL — CHECK IN (`GUEST`, `CUSTOMER`) — mirrors `bookings.type` (see §6 item 3) |
| customer_id | UUID | NULLABLE — no FK, cross-context |
| contact_email / contact_name / contact_phone | VARCHAR | NOT NULL — mirrors `bookings`' contact fields (see §6 item 3) |
| quantity | INT | NOT NULL DEFAULT 1 CHECK > 0 |
| status | VARCHAR(20) | NOT NULL DEFAULT 'CONFIRMED' — CHECK IN (`CONFIRMED`, `WAITLISTED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`) |
| series_id | UUID | NULLABLE — FK (tenant_id, series_id) → `recurring_enrollments` |
| service_name_at_booking | VARCHAR(255) | NOT NULL — snapshot (see §6 item 1) |
| price_at_booking_amount | NUMERIC(10,2) | NOT NULL — snapshot (see §6 item 1) |
| points_value_at_booking | INT | NOT NULL DEFAULT 0 — snapshot (see §6 item 1) |
| completed_at / cancelled_at | TIMESTAMPTZ | NULLABLE |
| created_at / updated_at | TIMESTAMPTZ | DEFAULT now() |
| **UNIQUE** | (tenant_id, id) | |
| **INDEX** | (tenant_id, class_session_id, status) | |
| **INDEX** | (tenant_id, customer_id) | |

**Deliberately no `waitlist_position` column** — see §6 item 8.

**Example data — the roster on `sess_pilates_0804`, matching `staff-02-session-roster.html`:**

| id | contact_name | quantity | status | series_id |
|---|---|---|---|---|
| sb_1 | Fernanda Lima | 1 | CONFIRMED | null |
| sb_2 | Roberta Dias | 1 | CONFIRMED | enroll_roberta |
| sb_3 | Ana & Bia (grupo) | 2 | CONFIRMED | null |
| sb_4 | Marcos Tanaka | 1 | WAITLISTED | null |

`sb_3` is CAND-23's multi-unit case — one row, `quantity=2`, not two separate bookings. `1 + 1 + 2 = 4 = capacity`: the session is genuinely full, which is exactly why `sb_4` is correctly `WAITLISTED` rather than `CONFIRMED` — even though the roster screen's own summary text currently says otherwise (see the `class_sessions` example above).

### `booking.recurring_enrollments`

`id, tenant_id, customer_id, template_id, start_date, end_date (nullable), status (ACTIVE|PAUSED|CANCELLED)` — `UNIQUE(tenant_id, id)`, `INDEX(tenant_id, customer_id, status)`, `INDEX(tenant_id, template_id, status)`.

**Example data:**

| id | customer_id | template_id | start_date | end_date | status |
|---|---|---|---|---|---|
| enroll_roberta | cust_roberta | tpl_pilates_estudio1 | 2026-07-01 | null | ACTIVE |

`sb_2` above carries `series_id = enroll_roberta` — Roberta's Monday slot is generated automatically every week this enrollment stays `ACTIVE` (CAND-26), rather than her booking one-off each time the way Fernanda (`sb_1`, `series_id = null`) does.

---

## 3. Modified tables

| Table | Change |
|---|---|
| `booking.services` | `+ booking_model VARCHAR(20) NOT NULL DEFAULT 'APPOINTMENT'` (CHECK IN `APPOINTMENT`\|`SESSION`), `+ buffer_after_minutes INT NULLABLE` |
| `booking.schedule_closures` | `+ resource_id UUID NULLABLE` (FK when set). No constraint trap — today's overlap rule is already app-enforced, not a DB unique, so it extends cleanly to resource scope. |
| `booking.schedule_openings` | `+ resource_id UUID NULLABLE` (FK when set). **Constraint trap:** today's `UNIQUE(tenant_id, date)` silently stops enforcing "one opening per date" once `resource_id` is nullable — Postgres treats `NULL ≠ NULL`, so two tenant-wide openings for the same date would no longer collide. Replace with `UNIQUE(tenant_id, date) WHERE resource_id IS NULL` **and** `UNIQUE(tenant_id, resource_id, date) WHERE resource_id IS NOT NULL`. |
| `loyalty.loyalty_entries` (different context — see §6 item 2) | `booking_line_id` → NULLABLE (was NOT NULL), `+ session_booking_id UUID NULLABLE`, mutual-exclusion CHECK, `+ UNIQUE(tenant_id, session_booking_id) WHERE session_booking_id IS NOT NULL` |

**Example data — `services`:**

| id | name | booking_model | buffer_after_minutes |
|---|---|---|---|
| svc_corte_escova | Corte + Escova | APPOINTMENT | 10 |
| svc_massagem_relaxante | Massagem Relaxante | APPOINTMENT | 15 |
| svc_pilates | Aula de Pilates | SESSION | null |
| svc_jornada_spa | Jornada Spa Vitta | APPOINTMENT | null |

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

| id | booking_id | booking_line_id | session_booking_id | service_id | points |
|---|---|---|---|---|---|
| le_1 | book_123 | line_456 | null | svc_corte_escova | 2 |
| le_2 | null | null | sb_2 | svc_pilates | 1 |

`le_1` is today's existing path (a completed haircut). `le_2` is the new path this discovery adds: Roberta's Pilates class (`sb_2`) completing — `booking_id`/`booking_line_id` both `null`, `session_booking_id` set instead, enforced by the mutual-exclusion CHECK.

---

## 4. Migration ordering (expand/contract)

1. `resources`
2. `services` `+booking_model +buffer_after_minutes` (independent expand)
3. `service_resource_requirements` + pool (depends on `resources`, `services`)
4. `service_legs` + `service_leg_resource_requirements` + pool (depends on `resources`, `services`)
5. `service_class_resource_pool` (depends on `resources`, `services`)
6. `class_schedule_templates` (depends on `services`)
7. `class_schedule_template_slots` (depends on templates, `resources`)
8. `class_sessions` (depends on templates, `services`)
9. `class_session_resources` (depends on sessions, `resources`)
10. `resource_occupancy` (depends on `resources`, `booking_lines`, `class_sessions` — must run after both exist)
11. `session_bookings` (depends on `class_sessions`)
12. `recurring_enrollments` (depends on `class_schedule_templates`)
13. `schedule_closures` / `schedule_openings` `+resource_id` (expand; includes the openings partial-index fix)
14. `loyalty.loyalty_entries` `+session_booking_id` (separate context — no DB FK across schemas either way, but logically sequenced after `session_bookings` exists)

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

(Verified against the actual migration, `CreateBookingBookings1748000000014` — `docs/13-DATABASE_SCHEMA.md` doesn't even list `scheduled_end_at`/`version`, a stale-doc issue independent of this discovery, worth fixing separately.)

This works today because there's exactly one thing to protect: the whole tenant, one row per booking. The domain doc's §5/§8 describe the resource split as if it's a query-side change only ("only the effective calendar-blocked window changes"). It isn't: once a booking can lock a *bundle* of resources (model 7) or a different resource per *leg* (model 8), there's no longer one row per booking to key an exclusion constraint on — the granularity has to move to one row per resource-assignment. And a materialized `ClassSession` needs the *identical* protection on the *same* resources. Postgres exclusion constraints cannot span two tables — so if `Booking` resource-locks and `ClassSession` resource-locks lived in separate tables, cross-family exclusivity (CAND-31, model 13's whole premise) could never be DB-enforced no matter how well either table were built individually.

`resource_occupancy` is the fix: both families insert into it, one shared GIST exclusion constraint protects both. `is_locked` flips `true` in the same transaction as `Booking.approveBooking()` (mirroring today's `WHERE status='APPROVED'`); for `ClassSession` rows it's `true` at insert time, since generation has no approval step.

This still leaves exactly one case with no DB backstop: an appointment booked against a resource's **not-yet-materialized** future template occurrence — there's no row to constrain yet. That is precisely the case the domain doc §6 pattern-check mechanism was built for. The correct framing is that the pattern-check is a *necessary supplement* to a DB constraint for that one case, not a replacement for a DB constraint everywhere else — the domain doc currently only ever describes app-level checks (CAND-29/31) and never proposes the DB-level backstop that's fully possible for every *other* case.

---

## 6. Gaps / inconsistencies found while building this

1. **`SessionBooking` has no snapshot fields, breaking a core Booking-context principle and blocking the event it's supposed to trigger.** `BookingLine` snapshots `price`/`duration`/`points` at booking time specifically so a later `Service` edit never retroactively changes a past booking (domain doc §1; `02-DOMAIN_MODEL.md`). The domain doc's `SessionBooking` properties (§6) have no equivalent. This isn't just an inconsistency with the rest of the model — it concretely breaks §6's own claim that `SessionBookingCompleted` "mirrors `BookingCompleted`'s consumers": Loyalty's insert needs a `points` value to write into `LoyaltyEntry.points`, and nothing currently supplies one. Fixed above via `service_name_at_booking` / `price_at_booking_amount` / `points_value_at_booking` on `session_bookings`.

2. **`loyalty.loyalty_entries` cannot accept a `SessionBookingCompleted` insert without a schema change.** `booking_id`/`booking_line_id` are both `NOT NULL` today. Supporting the class-family path requires widening `booking_line_id` to nullable, adding `session_booking_id`, and a mutual-exclusion CHECK — a real cross-context migration the domain doc's one sentence about "mirroring consumers" doesn't scope at all.

3. **`SessionBooking`'s contact/actor shape (`customerId | guest-contact-fields`) was too vague to build.** Now mirrors `Booking` exactly: `type`, nullable `customer_id`, required `contact_email`/`contact_name`/`contact_phone`. Also needed because `Booking`'s events carry contact fields directly (bounded-contexts Rule 4, self-contained events) — `SessionBookingCompleted`'s "thanks for coming" notification can't be self-contained otherwise.

4. **Two independent Staff-deactivation paths aren't wired together.** `UC-029` deactivates a `Staff` row in the Staff Context; `CAND-03` deactivates a `Resource` in the Booking Context. Nothing says whether deactivating the underlying `Staff` cascades to (or blocks on) the wrapping `STAFF`-type `Resource`. `StaffDeactivated` currently has zero consumers — this would be its first, and it isn't mentioned in §6/§8 of the domain doc.

5. **`ScheduleOpening`'s `UNIQUE(tenant_id, date)` breaks the moment `resource_id` becomes nullable** — see §3 above for the fix. `ScheduleClosure`'s equivalent rule was already app-enforced (not a DB unique), so it's unaffected — only `ScheduleOpening` had this trap.

6. **Domain doc §3 and §9 item 1 pull in different directions on what backfilling `LOCATION` means.** §3 frames backfilling as "replaces today's implicit whole-tenant-is-the-resource behavior with an explicit row," but §3 also separately defines `resourceId = null` on closures/openings as "tenant-wide... blocks every resource regardless of type." These are two different concepts once other resource types exist: a closure scoped to the `LOCATION` resource specifically vs. one that blocks *everything*. Backfilling `LOCATION` doesn't retire the `NULL` sentinel — genuine "close the whole business" semantics still need it. Recommend resolving explicitly: `LOCATION` becomes just one more addressable resource (useful for giving car wash's degenerate `resourceRequirements` something concrete to reference); `resourceId IS NULL` remains its own, separate "everything" sentinel on closures/openings.

7. **`ClassSession.templateId` is nullable for an "ad-hoc" case no candidate use case actually creates.** CAND-13 only generates from a template; CAND-14 only overrides an existing session. Nothing creates a template-less session. Either add the missing use case or drop the nullability until something needs it — currently unused schema surface.

8. **`waitlistPosition` as a stored, shifted-on-every-promotion column is more machinery than the requirement needs.** CAND-25 requires updating every other waitlisted row's position on each promotion/cancellation — the "keeps needing new bookkeeping" pattern CLAUDE.md's engineering rules flag as a signal to reconsider the approach rather than keep patching it. A customer's position is fully recoverable at read time via `ROW_NUMBER() OVER (PARTITION BY class_session_id ORDER BY created_at) WHERE status='WAITLISTED'`. Recommend dropping the persisted field entirely — reflected above (no `waitlist_position` column on `session_bookings`).

9. **CAND-22's "atomically checks `bookedCount < capacity`" has no concrete mechanism stated.** Given this codebase's documented TypeORM-optimistic-locking trap (a hand-built `manager.save()` doesn't protect this), the concrete fix is a guarded UPDATE: `UPDATE class_sessions SET booked_count = booked_count + :qty WHERE id = :id AND booked_count + :qty <= capacity`, checking `affected === 1`, falling through to waitlist on 0 rows affected. `class_sessions.version` (added above) covers non-capacity concurrent edits (CAND-14) the same way `bookings.version` does today.

10. **`legs` vs. `bookingModel = SESSION` compatibility is never explicitly forbidden.** Domain doc §5 scopes legs to "flat (non-legged) services only," and CAND-08's precondition just says "Service exists" — not `bookingModel = APPOINTMENT`. Recommend an explicit invariant: `SESSION` services carry neither `resourceRequirements` nor `legs` (aggregate-enforced, same pattern as today's "booking must have ≥ 1 line" — not a DB constraint, since it can't be expressed across the now-normalized child tables).

11. **Aggregate/outbox wiring for the new events is an open architectural decision, not a detail.** `SessionBookingConfirmed`/`Waitlisted`/`Completed`, `WaitlistPromoted`, `ClassSessionCancelled` are all triggered by a specific use-case call (`SessionBooking`/`ClassSession` transitioning state) — the same shape as `Booking`'s 3-aggregate transactional-outbox pattern (TD24-S02), not the 4-cron direct-publish pattern (which already correctly shows "Events Triggered: None" on CAND-13/CAND-25b — no gap there). This means `ClassSession` and `SessionBooking` becoming full `AggregateRoot`s with their own outbox-draining repositories is a real, non-trivial commitment the domain doc never states outright.

12. **Doc-hygiene note, independent of this discovery:** `docs/13-DATABASE_SCHEMA.md`'s `booking.bookings` table is already stale against the real migration — missing `scheduled_end_at` and `version`, both present in `CreateBookingBookings1748000000014`. Found while grounding this document against real code; worth a separate fix outside this discovery.

13. **A leg can require more than one resource at once — the domain doc's `ServiceLeg.resourceRequirement` (singular) doesn't allow for this, but the concrete prototype does.** `public-05-multi-leg-itinerary.html`'s middle leg ("Massagem") locks both a therapist (Renata Souza, customer-chosen) *and* a room (Sala de Terapia) simultaneously — the same two resources `Massagem Relaxante`'s own bundle uses, deliberately, to demonstrate CAND-31 cross-service exclusivity "from the other direction" (per that file's own comment). The domain doc §5's abstract JSON example only ever shows one `resourceRequirement` per leg. Fixed above: `service_legs` no longer carries `resource_type`/`selection_mode` directly — those moved to a new `service_leg_resource_requirements` child table (one-to-many per leg), with its own `service_leg_resource_requirement_pool`, mirroring the flat-service bundle shape one level deeper. Worth carrying this fix back into the domain doc's own `ServiceLeg` properties (§5), not just this schema.

14. **Prototype display bug, found while grounding the `session_bookings` example above — fixed (2026-08-05).** `staff-02-session-roster.html`, `staff-04-turmas-proximas.html` (two cards — the "Hoje" listing and the "Turmas passadas" entry), and `staff-02b-fechar-turma.html` all showed "3 de 4"/"3/4 vagas preenchidas" (75% bar) for the same underlying session, but its three confirmed rows (Fernanda ×1, Roberta ×1, Ana & Bia ×2) sum to 4 — genuinely full, which is also the correct reason Marcos Tanaka is waitlisted rather than confirmed. Not a data-model issue, but the bug spanned three files sharing the same wrong number, not one. All three now show 4/4 (100%); `staff-04`'s two cards additionally now use its own already-defined but previously-unused `.capacity-bar-fill.full`/red styling, matching the "Lotada" convention already established in `public-02-class-session-picker.html`.

15. **The original fix for §9 item 7, which this doc had marked "Resolved," was itself wrong — corrected mid-conversation (2026-08-05).** The first draft of this doc scoped the eligible pool to `template_id` (`class_schedule_template_slot_pool`). Two problems surfaced on review: (a) no `CAND` ever populated it — `CAND-11`'s main flow only ever picks a resource, never declares a pool, so the table had a schema with no write path anywhere; (b) scoping per-template meant re-curating the same "who can teach Pilates" list separately for every template of the same service, with real drift risk (a newly-qualified instructor would need adding to each template's own pool individually, rather than once). Corrected: the pool moved to `service_class_resource_pool`, scoped by `service_id` — declared once, shared by every template of that service, filled by the same `manager-02` checklist mechanism `CAND-06` step 3 already uses for the flat case. `class_schedule_template_slots` keeps storing only the one resolved pick per template, now validated against the service-level pool instead of a redundant one of its own. This is also a reminder that marking something "Resolved" in this doc means the schema was designed, not that it was verified against every use case that would actually populate it — worth double-checking that in future entries too.

---

## 7. Relationship to domain doc §9 (Open Questions)

- **§9.1 (`LOCATION` backfill)** — informed by §6 item 6 above: backfilling is useful for giving normalized requirement/pool tables something to reference, but does not resolve or replace the separate `resourceId IS NULL` "everything" sentinel on closures/openings. Still an open product decision on backfill itself; this doc only clarifies that the two concepts don't collapse into one.
- **§9.7 (SESSION-type resource pool)** — resolved concretely by `service_class_resource_pool` (service-scoped, not template-scoped — see §6 item 15 for the mid-course correction) plus `class_schedule_template_slots`' resolved pick, generalized to any resource type including `EQUIPMENT`.
- **§9.8 (`Resource.maxCapacity`)** — deliberately left out of `resources` above; adding it later is a pure additive/expand migration once the product decision is made, so no schema work is blocked on it today.
- **§9.2–§9.6, §9.9–§9.10** — unaffected by the physical schema; still open at the product/business-rule level, not the data-model level.
