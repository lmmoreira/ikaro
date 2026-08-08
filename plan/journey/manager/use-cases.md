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
