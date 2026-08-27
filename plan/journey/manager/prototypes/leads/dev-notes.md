# Dev Notes — MANAGER/STAFF: View Leads Submissions

**Journey:** MANAGER/STAFF — View Leads Submissions
**UCs:** UC-041
**Prototype:** `manager/prototypes/leads/`
**Status:** ✅ Done — base list/detail + gated nav (M20-S10), search backend/BFF (M20-S12), search frontend UI (M20-S13, basic/advanced/date-range, button-driven — see below). Promoted from `docs/discovery/lead-form-module/prototype/` (M20 milestone, `docs/04-USE_CASES.md` UC-041).

---

---

## Overview

A new top-level sidebar item "Leads" — a simple paginated list (name/email/phone, most-recent-first), click-through to a full read-only detail view. Own dedicated screen, not nested inside hotsite editing (mirrors how Bookings gets its own screen). Visible to STAFF and MANAGER alike (`MAIN_NAV_KEYS`, not the manager-only section) — viewing leads doesn't require MANAGER; only editing the module config (`manager/prototypes/lead-form/`) does.

**Gated, not unconditional (added during the post-review redesign, 2026-08-24; implementation corrected during M20-S10 story-discovery, 2026-08-27):** the "Leads" item only renders when the `LEAD_FORM` module is actually enabled for this tenant. There is no single shared `app/dashboard/layout.tsx` doing this fetch (that file is a bare passthrough) — the shared `loadDashboardShellContext()` helper (`apps/web/shells/dashboard/model/dashboard-shell-context.ts`), called independently by every top-level section's own `layout.tsx`, fetches `GET /v1/tenants/lead-form/status` (`{ enabled: boolean }`, M20-S01) and adds `leadFormEnabled` to the shared shell context, threaded down through `DashboardShell` to `Sidebar.tsx`/`BottomNav.tsx`/`MoreSheet.tsx`. A tenant that never turned the module on never sees this item, since it would otherwise point at a permanently empty screen — unlike Agenda/Fidelidade above it, which every tenant uses regardless of any module toggle. On mobile, `MoreSheet` (renamed from `ManagerSheet`) also gained a header-less "Leads" entry so STAFF — who has no "Mais" overflow at all otherwise — can reach it too.

**CSV export is removed from this milestone's scope entirely, not merely deferred** (see `plan/M20-LEAD-FORM-MODULE.md` Non-Goals: at current volume caps, a synchronous buffer-and-return export would have fully satisfied the requirement with no new infrastructure, but the decision made during the post-review redesign is to not build even that for M20 — a generic async report/export module is a legitimate future initiative once a second real export need exists, not something to build speculatively for one consumer). The discovery's own `manager-04-leads-export.html` mockup and its "Exportar CSV" buttons are **not** relocated here — this folder omits them entirely rather than promoting dead UI.

**Search is the real replacement (M20-S12/S13, added post-promotion 2026-08-23) — two modes, mutually exclusive:**
- **Basic** (`01-submissions-list.html`'s search box): one free-text term, matches partially across name, email, and any question's label/answer, OR-ed together. Good enough for "find Carlos."
- **Advanced** (`01d-advanced-filters.html`): one or more question+value filter rows, ANDed — e.g. "estado civil contém casado" AND "mora contém São Paulo" returns only submissions matching *both*. The basic mode's single flattened match can't do this correctly (it can't tell which question a matched term came from, so two OR-ed terms would also match a submission where each term appears in an unrelated field) — that's the whole reason advanced mode exists as a separate thing, not just a bigger search box.

**Button-driven, not live/debounced (M20-S13 story-discovery, 2026-08-27 — overrides an earlier debounced draft):** typing into the search box, editing a filter row, or picking a date range does nothing by itself. Basic mode shares one "Aplicar"/"Limpar" pair between the search box and the date range; advanced mode shares one "Aplicar filtros"/"Limpar filtros" pair between the filter rows and the date range (neither is live-typed in that mode either). No 3-character minimum (M20-S13 implementation, 2026-08-27, reversing S12's original design — see BFF calls below): any non-empty search/filter value works, so "Aplicar"/"Aplicar filtros" have no disabled state to guard against beyond an empty box. "Limpar"/"Limpar filtros" reset that mode's own inputs + the date range, without leaving the current mode. The "Busca avançada"/"Voltar para busca simples" toggle is the only action that drops the *other* mode's active query — it never touches the date range.

Backed by a new `platform.lead_form_answers` child table — one row per question per submission, written once alongside the JSONB snapshot at insert time (`docs/13-DATABASE_SCHEMA.md`), never a live/derived query. An earlier draft of this design used a single flattened `search_text` column instead; replaced once it became clear a flattened blob can't support the advanced (ANDed, per-question) case at all.

**Date range (`submittedFrom`/`submittedTo`), added the same day — orthogonal to both search modes**, not a third mode: combines via AND with basic search, with advanced filters, or stands alone with neither active. Resolved server-side using the tenant's own `settings.businessHours.timezone` — "Aug 1" means a different UTC instant per tenant, so this reuses `localDateTimeToUTCIso()` (`apps/backend/src/shared/utils/calendar-date.ts`), the same real utility Chatbot's own `conversationDate` daily-cap bucketing already relies on, not the UTC-naive `startOfDayUTC()`/`todayUTC()` pair from the same file (those exist only for a platform-wide, not tenant-scoped, breaker). **Prototype uses a native `<input type="date">` pair** — no existing range-calendar mockup to copy from elsewhere in this repo's prototypes. **The real implementation must use shadcn/ui's `Calendar` in range mode** (e.g. `Popover` + `Calendar`), per this codebase's own "prefer shadcn/ui primitives" convention — the native date input here is a prototype-only stand-in, not the intended final UI.

---

## File map

| File | Status | Role |
|---|---|---|
| `apps/web/app/dashboard/leads/page.tsx` | ✅ Done | Submissions list (no search yet — M20-S12/S13) |
| `apps/web/app/dashboard/leads/[id]/page.tsx` | ✅ Done | Submission detail |
| `apps/web/app/dashboard/leads/layout.tsx` | ✅ Done | New — uses `DashboardSectionShell`, same shape as `settings/layout.tsx`/`hotsite/layout.tsx` |
| `apps/web/shells/dashboard/model/dashboard-shell-context.ts` | ✅ Done (extend) | `loadDashboardShellContext()` gains a parallel `GET /v1/tenants/lead-form/status` fetch; `DashboardShellContext` gains `leadFormEnabled: boolean` |
| `apps/web/shells/dashboard/components/Sidebar.tsx` | ✅ Done (extend) | Adds "Leads" to `MAIN_NAV_KEYS` when `leadFormEnabled` |
| `apps/web/shells/dashboard/components/BottomNav.tsx` | ✅ Done (extend) | "Mais" trigger now also shows for STAFF when `leadFormEnabled` |
| `apps/web/shells/dashboard/components/MoreSheet.tsx` | ✅ Done (renamed from `ManagerSheet.tsx`) | Header-less "Leads" item for either role when enabled, manager-only section unchanged |
| `apps/web/features/platform/components/leads/LeadFormSubmissionsList.tsx` | ✅ Done | Paginated list component; renders the search panel + distinct no-results state (M20-S13) |
| `apps/web/features/platform/components/leads/LeadFormSubmissionDetail.tsx` | ✅ Done | Read-only detail component |
| `apps/web/features/platform/components/leads/LeadFormSearchPanel.tsx` | ✅ Done (M20-S13) | Basic/advanced mode orchestrator — Aplicar/Limpar, URL navigation |
| `apps/web/features/platform/components/leads/LeadFormAdvancedFilters.tsx` | ✅ Done (M20-S13) | Repeatable question+value filter rows |
| `apps/web/features/platform/components/leads/LeadFormDateRangeControl.tsx` | ✅ Done (M20-S13) | shadcn `Popover`+`Calendar` (range mode) date-range picker |
| `apps/web/features/platform/model/lead-form-search.ts` | ✅ Done (M20-S13) | Pure query-shape helpers (build/parse the `?search=`/`?filters=`/`?submittedFrom=`/`?submittedTo=` query) |
| `apps/web/features/platform/api/lead-form-submissions.server.ts` | ✅ Done | Server-side `listLeadFormSubmissions`/`getLeadFormSubmission`/`getLeadFormFilterOptions` (M20-S13 extends the first, adds the third) |

---

## Prototype variants — alternate states

| Screen | Scenario | Notes |
|---|---|---|
| `01-submissions-list.html` | Happy path — paginated list, basic search box, date range (M20-S13) | |
| `01b-submissions-empty.html` | No submissions yet (UC-041 A1) | Same screen tier, full shell |
| `01c-search-no-results.html` | Search/filters/date-range yield zero matches (UC-041 A3) | Same screen tier, full shell — distinct from `01b`: submissions exist, just none match |
| `01d-advanced-filters.html` | Advanced mode — 2 ANDed question+value filter rows + date range (UC-041 step 4-5, A4-A5) | Distinct interaction pattern from `01`'s single search box — its own screen, not just described in prose |
| `02-submission-detail.html` | Click-through detail (UC-041 main flow) | Drill-down — full sidebar, no bottom-nav, mirrors `../equipe/04-staff-detail-edit.html`'s convention |

A submission whose `answers` snapshot references a question no longer in the current config (UC-041 A2) isn't a separate screen — it renders identically, since the snapshot is self-contained.

---

## BFF calls

```
GET /v1/tenants/lead-form/submissions?page=&pageSize=&search=|filters=&submittedFrom=&submittedTo=   STAFF|MANAGER, ordered submittedAt DESC
  Response: { items: [{id,name,email,phone,submittedAt}], page, pageSize, total }
  search (M20-S12/S13, BASIC): optional, non-empty, case-insensitive partial match against
    name, email, or any question label/answer, OR-ed. Button-driven client-side (M20-S13
    story-discovery, 2026-08-27) — fires only on an explicit "Aplicar" click, never live/
    debounced. No minimum length beyond non-empty (revised M20-S13 implementation, 2026-08-27
    — see below).
  filters (M20-S12/S13, ADVANCED): optional, URL-encoded JSON array,
    [{"questionLabel":"...","value":"..."}], max 5 entries. Each entry ANDed — every filter
    must match. questionLabel matches by EXACT equality (dropdown-sourced); value by the
    same non-empty-only rule as search. Mutually exclusive with search — never send both.
  submittedFrom/submittedTo (M20-S12/S13, DATE RANGE): optional, YYYY-MM-DD, tenant-local
    calendar dates, both inclusive from the caller's view. ORTHOGONAL to search/filters —
    combines via AND with either, or stands alone. Resolved server-side to a half-open UTC
    range via localDateTimeToUTCIso() using the tenant's businessHours.timezone. submittedFrom
    after submittedTo -> 400 before the query runs.
  All omitted -> unfiltered, unchanged from before this addition. An EMPTY search/filter value
  is rejected 400 before the query runs. No 3-character minimum (M20-S12's original design,
  reversed during M20-S13 implementation, 2026-08-27): pg_trgm genuinely can't accelerate a
  pattern under 3 chars, but the unindexed fallback isn't a flat scan of the whole answers
  table -- the per-question match is an EXISTS correlated on (tenant_id, submission_id), which
  IS indexed, so it only costs a short ILIKE over one submission's own <=20 answer rows. The
  real bound scales with a tenant's own submission count (up to ~730,000 at this feature's
  configured ceiling), not the much larger cross-submission answer-row total -- full reasoning
  and the two rounds of estimate corrections behind it: packages/validation/src/
  lead-form-submission.ts. Rejecting a real short search (an age, "25") outright was judged the
  worse trade-off.
GET /v1/tenants/lead-form/submissions/filter-options   STAFF|MANAGER
  Response: { questionLabels: string[] }
  Distinct question labels ever recorded for this tenant — includes labels from questions
  since edited/removed from the live LeadFormConfig (explicit decision: matches the
  submission's own snapshot, not the current config). Powers 01d's "pergunta" dropdown.
GET /v1/tenants/lead-form/submissions/:id                STAFF|MANAGER
  Response: { id, name, email, phone, submittedAt, answers: [{questionLabel, questionType, answerValue}] }
  404 — submission doesn't exist in this tenant
```

Full contract: `docs/14-API_CONTRACTS.md` § Leads Submissions (Admin).

## Mobile notes

`01-submissions-list.html` and `01d-advanced-filters.html` both reflow below 480px: the search box + "Busca avançada" button row (`.search-filter-row`) stacks vertically instead of sitting side-by-side, `01d`'s `.filter-row` grid (pergunta / valor / remover) collapses from 3 columns to 1, and both files' `.date-range-row` stacks its two `<input type="date">` fields full-width instead of the fixed `max-width:11rem` desktop sizing. The list itself (`.lead-row`) already reflows correctly at any width without a breakpoint — it was already a single flex row with `min-width:0` on the text column. `01d`'s filter-panel note callout and the "Aplicar filtros"/"Limpar filtros" button pair need no breakpoint of their own; they're already full-width-friendly.

## Known limitations (flagged, not silently dropped)

- No manual delete/edit of a single submission — the retention cron (UC-043) is the only deletion path.
- No CSV export — search (M20-S12/S13) is the real replacement, see Overview.
