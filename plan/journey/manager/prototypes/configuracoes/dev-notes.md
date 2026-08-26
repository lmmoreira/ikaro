# Configurações — Dev Notes

**Journey:** MANAGER — Configurações (Tenant Settings)
**UCs:** UC-026
**Prototype:** `manager/prototypes/configuracoes/`

---

## Overview

✅ **Fully shipped** (`M13-S31`). Updated 2026-07-31 — this file previously claimed the BFF endpoint didn't exist; it does, and the real form has 7 sections / far more fields than originally scoped here (deliberate scope expansion during `M13-S31`, never backfilled into this handoff doc until now).

---

## Routes

| Prototype file | Production route | Page component |
|---|---|---|
| `01-settings-form.html` | `/dashboard/settings` (no `[slug]` segment) | `SettingsForm` |

---

## BFF calls

| Action | Method + Path | Role guard | Status |
|---|---|---|---|
| Get settings | `GET /tenants/settings` | MANAGER | ✅ Exists |
| Update settings | `PATCH /tenants/settings` | MANAGER | ✅ Exists |

`apps/bff/src/features/platform/tenant-settings.controller.ts` (EXISTS) proxies to the backend:

```typescript
// apps/backend/src/contexts/platform/infrastructure/controllers/tenant-settings.controller.ts
GET   /tenants/settings    // -> current tenants.name + tenants.settings JSONB
PATCH /tenants/settings    // -> validates + updates tenants.settings + tenants.name
```

---

## Two data sources, one form

`Nome do estabelecimento` and `Slug` are `tenants` table columns, not part of the `settings` JSONB — everything else (cancellation window, buffer, loyalty expiry, business hours, business_info) lives in `settings`. UC-026 step 5 confirms the save updates both `tenants.settings` *and* `tenants.name` in one request. The form should hide this split from the admin; the BFF/backend already accept a combined payload.

```typescript
interface UpdateTenantSettingsDto {
  name?: string;                         // tenants.name (not in settings JSONB)
  settings: {
    loyalty?: { expiryDays?: number };
    booking?: { cancellationWindowHours?: number; serviceBufferMinutes?: number };
    businessHours?: {
      timezone: string;
      monday?: { open: string; close: string } | null;   // null = closed
      tuesday?: { open: string; close: string } | null;
      // ... wednesday .. sunday
    };
    businessInfo?: {
      phone?: string | null;
      email?: string | null;
      address?: {
        street: string; number: string; complement?: string;
        neighborhood: string; city: string; state: string; zipCode: string;
      } | null;
    };
  };
}
```

Verify exact key casing (`businessHours` vs `business_hours`) against the actual DTO/Zod schema — `docs/21-TENANTS_SETTINGS_SCHEMA.md` uses snake_case for the JSONB keys but the BFF layer typically exposes camelCase to the frontend; don't assume, check the schema file directly when the BFF story lands.

---

## Field set (real, ✅ shipped — expanded well beyond the original scope)

The real `SettingsForm.tsx` has 7 sections, not the 5 this file originally described:

| Section | Fields |
|---|---|
| Geral | name, slug (read-only) |
| Agendamento | cancellationWindowHours, serviceBufferMinutes, **autoApproveEnabled**, **minBookingAdvanceHours**, **maxBookingAdvanceDays**, **slotGranularityMinutes**, **welcomeStaffScreenDays** |
| Fidelidade | loyaltyExpiryDays, **pointsPerCurrencyUnit**, **loyaltyEnableNotifications**, **loyaltyExpiryWarningDays**, **loyaltyNotificationMinPoints** |
| **Notificações** (missing from the original draft entirely) | notificationFromEmail |
| Horário | timezone + per-day open/close/closed |
| Contato | phone, email, **structured address** (zipCode with ViaCEP lookup, number, street, complement, neighborhood, city, state — not one free-text line as originally drafted), **social links** (whatsapp, instagram, facebook) |
| **Chatbot** (✅ shipped — added 2026-08-08, built by the M19 chatbot milestone) | `chatbot.knowledgeText` only — see below |
| **Formulário de contato** (❌ GAP — not yet built, added 2026-08-25, M20-S11) | `leadForm.{retentionMonths,maxSubmissionsPerDay,maxSubmissionsPerIpPerDay}` — see below |
| **Localização** (missing from the original draft entirely) | countryCode, currency, language — all read-only, set at tenant creation |

Bold fields (excluding Chatbot/Lead Form, tracked separately below) were entirely absent from this doc and the prototype screen before the 2026-07-31 sync. Section render order in `SettingsForm.tsx` matches this table's order top to bottom.

---

## Chatbot section (✅ shipped)

Promoted from `docs/discovery/CHATBOT/CHATBOT.md` §5/§6 via `/discovery-to-milestone` (2026-08-08).
Prototyped in `01d-chatbot-section.html` against the full, current 7-section form (not an excerpt).

**Field:** `chatbot.knowledgeText` — the only tenant-editable field in the `chatbot` settings
category (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §7). Free-form business info/policy/FAQ/tone text,
assembled into the chatbot's system prompt alongside live services/prices (UC-033).

**BFF call:** part of the existing `PATCH /v1/tenants/settings` call — no new endpoint. Body adds
one key to the existing `settings` payload:
```typescript
interface UpdateTenantSettingsDto {
  // ...existing categories unchanged...
  settings: {
    // ...
    chatbot?: { knowledgeText?: string };
  };
}
```

**Validation:**
| Field | Rule | Error message |
|---|---|---|
| `chatbot.knowledgeText` | optional string, max `maxKnowledgeTextLength` (4000 chars, tenant-overridable but not exposed in this form) | `400` — "O texto de conhecimento não pode ultrapassar 4000 caracteres." (exact copy TBD, confirm at story-discovery) |

**Deliberately absent from this form:** the 8 volume/cost caps (`maxConversationsPerDay`, etc.) and
`llmProvider`/`llmModel` — fixed platform defaults, Ikaro-only per-tenant override, never accepted
through this endpoint even if present in the request body (see
`docs/discovery/CHATBOT/CHATBOT.md` §5 for the full rationale, `docs/21-TENANTS_SETTINGS_SCHEMA.md`
§7 for the complete field list).

---

## Formulário de contato (Lead Form) section (❌ GAP — not yet built)

Promoted from `docs/discovery/lead-form-module/lead-form-module.md` via `/discovery-to-milestone`
(M20). Prototyped in `01e-lead-form-section.html` as an excerpt against the full, current
8-section form (not a standalone screen) — see that file's own comment block for the excerpt note.

**Fields:** all 3 tenant-editable, unlike Chatbot's caps (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §8 —
these are genuinely per-tenant abuse-protection knobs, not a shared platform-cost concern):

| Field | Rule | Default | Suffix |
|---|---|---|---|
| `leadForm.retentionMonths` | integer 1-24 | 6 | "meses" |
| `leadForm.maxSubmissionsPerDay` | integer 1-1000 | 100 | "/ dia" |
| `leadForm.maxSubmissionsPerIpPerDay` | integer 1-100 | 3 | "/ dia" |

**BFF call:** part of the existing `PATCH /v1/tenants/settings` call — no new endpoint (schema
already extended by M20-S03 in `@ikaro/validation`'s `LeadFormSettingsSchema`).

**Validation:** each field has its own dedicated `400` error code, already present in both locale
files: `PLATFORM_SETTINGS_LEAD_FORM_RETENTION_MONTHS_INVALID`,
`PLATFORM_SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_DAY_INVALID`,
`PLATFORM_SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_IP_PER_DAY_INVALID`. Unlike `chatbot.knowledgeText`,
all 3 bounds are fully client-checkable — validated client-side the same way as
`cancellationWindowHours` etc., not via a server-round-trip error mapping.

---

## Validation (UC-026 A1)

| Field | Rule | Error message |
|---|---|---|
| name | min 1 | "Informe o nome do estabelecimento." |
| cancellationWindowHours | 0–720 | "O valor máximo é 720 horas (30 dias)." |
| serviceBufferMinutes | 0–120 | "O valor máximo é 120 minutos." |
| loyaltyExpiryDays | 1–3650 | "Informe um valor entre 1 e 3650 dias." |
| timezone | valid IANA id | "Selecione um fuso horário válido." |
| businessInfo.phone | 10–11 digits, optional | "Telefone inválido." |
| businessInfo.email | `z.email()`, optional | "E-mail inválido." |

Slug is never submitted — input stays `readonly`; UC-026 A2 says the system silently ignores any manipulation attempt, so there's no need for a slug-specific error state.

Address uses a ViaCEP-backed zip lookup (`PostalCodeField`), matching the pattern already used in the guest/customer booking flow's pickup address — not a single free-text field.

---

## Out of scope (confirmed, don't build)

- **Audit log view** — UC-026 step 6 mentions logging who changed what, but CLAUDE.md §6 lists "audit log view" as an explicitly undocumented/missing UC. No "Histórico de alterações" screen in this prototype.
