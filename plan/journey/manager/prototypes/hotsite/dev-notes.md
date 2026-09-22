# Hotsite — Dev Notes

**Journey:** MANAGER — Hotsite (Branding & Content)
**UCs:** UC-027
**Prototype:** `manager/prototypes/hotsite/`

---

## Overview

Backend and BFF are both fully implemented and `MANAGER`-guarded (confirmed via `/uc-audit UC-026,UC-027,UC-028,UC-029`, 2026-06-16). This is a **frontend-only** gap. Branding scope was expanded beyond the original UC text — see "Branding field set" below — per explicit user decision during the audit (2026-06-16): cover every field the aggregate already supports, not just the original 4.

---

## Routes

| Prototype file | Production route | Page component |
|---|---|---|
| `01-hotsite-editor.html` | `/{slug}/dashboard/hotsite` | `HotsitePage` (tabbed: Branding / Layout / SEO) |
| `01d-module-config-hero.html` | drill-down within editor (no separate route, modal/sheet likely) | `ModuleConfigPanel` (HERO variant) |
| `01e-module-config-chatbot.html` | drill-down within editor (no separate route) | `ChatbotConfigPanel` (shipped `M19-S12`) |
| `02-preview.html` | `/{slug}/dashboard/hotsite/preview` or iframe overlay | `HotsitePreview` |

---

## BFF calls

| Action | Method + Path | Role guard |
|---|---|---|
| Get config | `GET /tenants/hotsite` | MANAGER |
| Update branding/layout/SEO | `PATCH /tenants/hotsite` | MANAGER |
| Publish | `POST /tenants/hotsite/publish` | MANAGER |
| Unpublish | `POST /tenants/hotsite/unpublish` | MANAGER |
| Chatbot cap status (new, feeds the `01e` red banner) | `GET /v1/tenants/chatbot/cap-status` → `{ dailyCapReachedToday: boolean }` | MANAGER |

All four (branding/layout/publish/unpublish) exist in `apps/bff/src/platform/hotsite-admin.controller.ts`, proxying `apps/backend/src/contexts/platform/infrastructure/controllers/hotsite-admin.controller.ts`. `.http` coverage confirmed on both sides. `GET /v1/tenants/chatbot/cap-status` shipped in `M19-S10`; per `docs/14-API_CONTRACTS.md` § Chatbot Cap Status it reuses the identical per-tenant daily-cap `COUNT` query `POST /public/platform/chatbot/messages` already runs for cap enforcement, not a new counting mechanism.

---

## Branding field set (from `hotsite-config.aggregate.ts` — `HotsiteBranding`)

```typescript
interface HotsiteBranding {
  primaryColor: string;       // hex, required
  secondaryColor: string;     // hex, required
  backgroundColor: string;    // hex, required
  textColor: string;          // hex, required
  headingFontFamily: string;
  bodyFontFamily: string;
  logoUrl: string;
  borderRadius: 'sharp' | 'rounded' | 'pill';
  buttonStyle: 'filled' | 'outline' | 'ghost';
  spacing: 'compact' | 'comfortable' | 'spacious';
  shadowStyle: 'none' | 'subtle' | 'strong';
  buttonBackgroundColor?: string;  // optional hex — overrides primaryColor on buttons
  buttonTextColor?: string;        // optional hex
}
```

`docs/04-USE_CASES.md` UC-027 Section A was updated (2026-06-16) to list these 13 fields. The prototype groups them into 4 sub-sections (Cores, Logo, Tipografia, Forma e estilo) to keep the form scannable.

> ✅ **Resolved during M13-S35 discovery (2026-07-07):** `HotsiteBrandingResponse` (`packages/types/src/hotsite.ts`) actually carries 5 more fields the prototype never showed — `heroBgStyle`, `alternateSectionBg`, `dividerStyle`, `brandName`, `brandTagline` — confirmed live and consumed by the public hotsite renderer today (`apps/web/features/platform/hotsite/apply-branding.ts`, `page-model.ts`, the Hero/BookingCta brand-card). M13-S35 covers all 18 fields, extending the grouping to 5 sub-sections: the 4 above plus a new "Ritmo visual" section (`heroBgStyle`, `alternateSectionBg`, `dividerStyle`), with `brandName`/`brandTagline` folded into "Logo e identidade". See `plan/M13-DASHBOARD-FRONTEND.md` § M13-S35 for the full field table.

---

## Module types (`hotsite-config.aggregate.ts` layout)

`HERO | SERVICE_LIST | GALLERY | BOOKING_CTA | TESTIMONIALS | ABOUT | CONTACT | FOOTER | CHATBOT | LEAD_FORM` — 10 types (`FOOTER` added `M13-S36`, `CHATBOT` added 2026-08-08, `LEAD_FORM` added 2026-08-23, both via `/discovery-to-milestone`). Order in the JSONB array determines render order on the public hotsite. Each module has `enabled: boolean` plus its own config shape (see `HeroModuleData`, etc. in the aggregate file).

**Per-module config — only HERO, CHATBOT, and LEAD_FORM are prototyped:**
- HERO (`01d-module-config-hero.html`), representative example: title, subtitle, layout (centered/left), CTA target, optional background image. **Shipped** — `HeroConfigPanel.tsx` and the other 6 original panels (`SERVICE_LIST`, `GALLERY`, `BOOKING_CTA`, `TESTIMONIALS`, `ABOUT`, `CONTACT`, plus `FOOTER`) all built directly from the real types in `M13-S36`, without individual prototype screens (an explicit `M13-S36` decision).
- CHATBOT (`01e-module-config-chatbot.html`), the 9th type, added 2026-08-08: `variant` (`'bubble' | 'inline'`), `accentColor` (`'primary' | 'secondary'`), `botName`, `welcomeMessage` — see `packages/types/src/hotsite.ts` `ChatbotModuleData` (`docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § CHATBOT). **Shipped `M19-S12`** — `ChatbotConfigPanel.tsx`. Two things this panel needs that no other module's panel does:
  1. A standing (non-dismissible) info note disclosing that availability depends on Ikaro-managed AI provider credits (`.availability-note` in the prototype screen).
  2. A conditional red banner when `GET /v1/tenants/chatbot/cap-status` returns `dailyCapReachedToday: true` (UC-027 A5) — the only module config screen that shows this.
- LEAD_FORM (`../lead-form/01-config.html`), the 10th type, added 2026-08-23 for `M20-LEAD-FORM-MODULE`: `title`/`subtitle`/`ctaLabel`/`variant`/`bgStyle` (teaser fields, same shape every module's config gets) plus `audienceMode` and up to 20 inline-edited `questions[]` — the latter two are **not** part of `LeadFormModuleData` (kept out of the cached manifest, see `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § LEAD_FORM). **Shipped `M20-S08`** — `LeadFormConfigPanel.tsx`. All fields (teaser + `audienceMode` + `questions[]`) save together through the single consolidated `PATCH /v1/tenants/hotsite` (folded in at M20-S08 — see `../lead-form/dev-notes.md` and `docs/02-DOMAIN_MODEL.md` § `LeadFormConfig` "Cross-aggregate save"); the config-only `GET /v1/tenants/lead-form/config` stays separate.

`default-layout.ts`'s `MODULE_ORDER`/`DEFAULT_MODULE_DATA` were updated in the same story to include `'CHATBOT'` — without that, the Layout tab never materializes a row for it and the Manifesto tab rejects a pasted `CHATBOT` module. The same update was made for `'LEAD_FORM'` in `M20-S08`.

---

## Engineering question — preview semantics (resolved, shipped)

`is_published` gates what the public hotsite route serves, so "Preview" must show the *draft* (unsaved) state — something the public route never serves once published.

**Resolved: client-side live preview, confirmed shipped.** `HotsiteEditor` passes a `draft: HotsiteAdminContentResponse` prop directly into `apps/web/features/platform/components/hotsite/HotsitePreview.tsx`, which renders the module tree client-side from that prop — no extra BFF call, no preview-mode parameter/token. No BFF preview-mode parameter/token exists or is needed.

`02-preview.html` mocks this visual outcome.

---

## Error handling

| Scenario | UI response |
|---|---|
| Invalid color (not hex) — UC-027 A1 | Field: red border + "Cor inválida. Use o formato hexadecimal, ex: #2563eb." — `01b-color-error.html` |
| Image upload fails — UC-027 A2 | Falls back to a URL text input — `01c-image-upload-fallback.html` |

## Unpublish (new — not in original UC text)

`POST /tenants/hotsite/unpublish` exists in the backend/BFF but UC-027's text never describes a take-down flow. The prototype places it in a "Zona de risco" panel inside the editor (`01-hotsite-editor.html`, bottom of page) as a secondary, visually de-emphasized action. Confirm placement before implementing — could equally live in `manager/configuracoes.md` instead.
