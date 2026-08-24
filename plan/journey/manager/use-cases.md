# MANAGER — Use Case Inventory

Source: `docs/04-USE_CASES.md`. Working checklist for journeys in this folder — use cases explicitly restricted to the `MANAGER` role. Everything `STAFF` can also do lives in `staff/use-cases.md` (MANAGER inherits all of it).

| UC | Title | Notes | Journey file |
|---|---|---|---|
| UC-026 | Admin Edits Tenant Settings | Shipped (`M13-S31`, ✅ Done) | `manager/configuracoes.md` |
| UC-027 | Tenant Admin Manages Hotsite Content & Branding | Branding field scope expanded 2026-06-16 per `/uc-audit` | `manager/hotsite.md` |
| UC-028 | Admin Invites New Staff Member | | `manager/equipe.md` |
| UC-029 | Admin Deactivates Staff Member | | `manager/equipe.md` |
| UC-030 | Admin Edits Staff Member Profile | Shipped (`M13-S43`, ✅ Done); added to `manager/equipe.md` 2026-07-31; prototype: `04-staff-detail-edit.html` | `manager/equipe.md` |
| UC-031 | Admin Reactivates Staff Member | Shipped (`M13-S44`, ✅ Done); added to `manager/equipe.md` 2026-07-31 — one-click "Ativar" row action on `01-team-list.html`, no dedicated screen | `manager/equipe.md` |
| UC-027 | Configure chatbot module (Hotsite) | 9th module type — `variant`/`accentColor`/`botName`/`welcomeMessage`, promoted from `docs/discovery/CHATBOT/CHATBOT.md` (2026-08-08). Draft — not yet shipped, no story assigned. | `manager/hotsite.md` |
| UC-026 | Edit chatbot knowledge text | New `chatbot.knowledgeText` field in tenant settings, promoted from `docs/discovery/CHATBOT/CHATBOT.md` (2026-08-08). Draft — not yet shipped, no story assigned. | `manager/configuracoes.md` |
| UC-037 | Manager Configures the Lead Form Module | 10th module type — audience mode + up to 20 inline-edited questions, promoted from `docs/discovery/lead-form-module/lead-form-module.md` (2026-08-23) for milestone `M20-LEAD-FORM-MODULE`. Draft — not yet shipped, no story assigned. | `manager/lead-form-config.md` |
| UC-041 | Staff/Manager Views Leads Submissions | New top-level "Leads" nav item (STAFF\|MANAGER), promoted 2026-08-23 for `M20-LEAD-FORM-MODULE`, **gated on `GET /v1/tenants/lead-form/status` (post-review redesign 2026-08-24)** — absent entirely for a tenant that never enabled the module. No CSV export — removed from scope entirely, not deferred; basic + advanced (ANDed, per-question) search, backed by a `platform.lead_form_answers` child table (M20-S12/S13, added 2026-08-23), is the real replacement for finding a specific lead. Draft — not yet shipped, no story assigned. | `manager/lead-form-submissions.md` |
| UC-042 | Manager Configures Lead Form Settings | `settings.leadForm.{retentionMonths,maxSubmissionsPerDay,maxSubmissionsPerIpPerDay}` — all three tenant-editable (post-review redesign 2026-08-24 corrected the two caps from an Ikaro-only deviation to normal per-tenant settings), promoted 2026-08-23 for `M20-LEAD-FORM-MODULE` — no dedicated screen, folds into the existing settings form. Draft — not yet shipped, no story assigned. | `manager/configuracoes.md` |
