# Hotsite — Dev Notes

**Journey:** MANAGER — Hotsite (Branding & Content)
**UCs:** UC-027
**Prototype:** `manager/prototypes/hotsite/`

---

## Overview

Backend and BFF are both fully implemented and `MANAGER`-guarded (confirmed via `/uc-audit UC-026,UC-027,UC-028,UC-029`, 2026-06-16). All of it is shipped (the editor is built at `/dashboard/hotsite`). Branding scope was expanded beyond the original UC text — see "Branding field set" below — per explicit user decision during the audit (2026-06-16): cover every field the aggregate already supports, not just the original 4.

---

## Routes

| Prototype file | Production route | Page component |
|---|---|---|
| `01-hotsite-editor.html` | `/dashboard/hotsite` (no `[slug]` segment) | `HotsiteEditor` — opens in `VisualHotsiteEditorView` (TD55-S01); the tabbed Branding / Layout / SEO / Manifest editor (`HotsiteEditorMainView`) is behind "Editar em detalhes", with "Voltar à edição visual" in the dashboard topbar |
| `01d-module-config-hero.html` | drill-down within editor (no separate route) | `HeroConfigPanel`, inside `ModuleConfigShell` (there is no `ModuleConfigPanel` component: the shell is `ModuleConfigShell.tsx` and each module type has its own `<Type>ConfigPanel.tsx`, all in `apps/web/features/platform/components/hotsite/modules/`) |
| `01e-module-config-chatbot.html` | drill-down within editor (no separate route) | `ChatbotConfigPanel` (shipped `M19-S12`) |
| `02-preview.html` | in-editor preview (no separate app route; see "preview semantics" below) | `HotsitePreview` |

---

## BFF calls

| Action | Method + Path | Role guard |
|---|---|---|
| Get config | `GET /tenants/hotsite` | MANAGER |
| Update branding/layout/SEO | `PATCH /tenants/hotsite` | MANAGER |
| Publish | `POST /tenants/hotsite/publish` | MANAGER |
| Unpublish | `POST /tenants/hotsite/unpublish` | MANAGER |
| Generate image upload URL | `POST /tenants/hotsite/images/signed-url` | MANAGER |
| Generate image read URL | `POST /tenants/hotsite/images/read-signed-url` | MANAGER |
| Feature a booking photo in the gallery | `POST /tenants/hotsite/gallery/feature-booking-photo` | MANAGER |
| Delete image | `POST /tenants/hotsite/images/delete` | MANAGER |
| List the template catalogue (TD56-S04) — `[{ id, version, thumbnailUrl, capabilities }]`, no display strings (names and descriptions are the web's, keyed by `id`) | `GET /tenants/hotsite/templates` | MANAGER |
| Apply a template to the current (possibly unsaved) draft — pure, persists nothing; returns `{ content, appliedTemplate, appliedSampleTestimonials }` or `404 PLATFORM_HOTSITE_TEMPLATE_NOT_FOUND`. A failed apply leaves the draft unchanged and the gallery offers Retry | `POST /tenants/hotsite/templates/:templateId/apply` | MANAGER |
| Chatbot cap status (new, feeds the `01e` red banner) — served by `tenant-settings.controller.ts` (`GET /v1/tenants/chatbot/cap-status`), not by `hotsite-admin.controller.ts` | `GET /v1/tenants/chatbot/cap-status` → `{ dailyCapReachedToday: boolean }` | MANAGER |

All of the `tenants/hotsite` endpoints exist in `apps/bff/src/features/platform/hotsite-admin.controller.ts`, proxying `apps/backend/src/contexts/platform/infrastructure/controllers/hotsite-admin.controller.ts`. `.http` coverage confirmed on both sides. `GET /v1/tenants/chatbot/cap-status` shipped in `M19-S10`; per `docs/API_CONTRACTS.md` § Chatbot Cap Status, which reuses the identical per-tenant daily-cap `COUNT` query `POST /public/platform/chatbot/messages` already runs for cap enforcement, not a new counting mechanism.

---

## Branding field set (`HotsiteBrandingResponse`)

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
  heroBgStyle?: 'primary' | 'background';
  alternateSectionBg?: boolean;
  dividerStyle?: 'none' | 'gradient' | 'solid';
  brandName?: string;
  brandTagline?: string;
}
```

The current editor exposes all 18 fields in five sections: Cores; Logo e identidade; Tipografia; Forma e estilo; Ritmo visual. `heroBgStyle` is `primary | background`, `alternateSectionBg` is a boolean switch, and `dividerStyle` is `none | gradient | solid`. `TD56-S06` (2026-10-24) added `borderRadius: soft`, `buttonRadius`, `headingWeight` and `headingTransform` to this tab, so the count is now 21; see `journeys/manager/hotsite.md` for the panel controls added alongside.

---

## Module types (`hotsite-config.aggregate.ts` layout)

`NAVIGATION | HERO | SERVICE_LIST | GALLERY | TESTIMONIALS | BOOKING_CTA | ABOUT | CONTENT_BLOCK | CONTACT | FOOTER | CHATBOT | LEAD_FORM` — 12 types (`FOOTER` added `M13-S36`, `CHATBOT` added 2026-08-08, `LEAD_FORM` added 2026-08-23, both via `/discovery-to-milestone`; `NAVIGATION` and `CONTENT_BLOCK` added by TD56, whose panels are `NavigationConfigPanel` and `ContentBlockConfigPanel` — this folder's screens predate them, see `editor-vision/` for the delivered editor). Order in the JSONB array determines render order on the public hotsite. Each module has `enabled: boolean` plus its own config shape (see `HeroModuleData`, etc. in the aggregate file).

**Per-module config — the ten original module types are clickable in this prototype (`NAVIGATION` and `CONTENT_BLOCK` are prototyped in `editor-vision/`):**
- HERO (`01d-module-config-hero.html`) is the complete baseline for its shipped panel: title, subtitle, eyebrow, variant, X/Y content position, primary and secondary CTAs, lateral panel, optional background image, and its focal point.
- `SERVICE_LIST`, `GALLERY`, `BOOKING_CTA`, `TESTIMONIALS`, `ABOUT`, `CONTACT`, and `FOOTER` share `01f-module-config.html`. The selected `?module=` query string renders that module's baseline field set in the same dashboard/drill-down shell, keeping every Layout-row link clickable without duplicating the common shell.
- CHATBOT (`01e-module-config-chatbot.html`), the 9th type, added 2026-08-08: `variant` (`'bubble' | 'inline'`), `accentColor` (`'primary' | 'secondary'`), `botName`, `welcomeMessage` — see `packages/types/src/hotsite.ts` `ChatbotModuleData` (`docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § CHATBOT). **Shipped `M19-S12`** — `ChatbotConfigPanel.tsx`. Two things this panel needs that no other module's panel does:
  1. A standing (non-dismissible) info note disclosing that availability depends on Ikaro-managed AI provider credits (`.availability-note` in the prototype screen).
  2. A conditional red banner when `GET /v1/tenants/chatbot/cap-status` returns `dailyCapReachedToday: true` (UC-027 A5) — the only module config screen that shows this.
- LEAD_FORM (`../lead-form/01-config.html`), the 10th type, added 2026-08-23 for `M20-LEAD-FORM-MODULE`: `title`/`subtitle`/`ctaLabel`/`variant`/`bgStyle` (teaser fields, same shape every module's config gets) plus `audienceMode` and up to 20 inline-edited `questions[]` — the latter two are **not** part of `LeadFormModuleData` (kept out of the cached manifest, see `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § LEAD_FORM). **Shipped `M20-S08`** — `LeadFormConfigPanel.tsx`. All fields (teaser + `audienceMode` + `questions[]`) save together through the single consolidated `PATCH /v1/tenants/hotsite` (folded in at M20-S08 — see `../lead-form/dev-notes.md` and `docs/DOMAIN_MODEL.md` § `LeadFormConfig` "Cross-aggregate save"); the config-only `GET /v1/tenants/lead-form/config` stays separate.

`default-layout.ts`'s `MODULE_ORDER`/`DEFAULT_MODULE_DATA` were updated in the same story to include `'CHATBOT'` — without that, the Layout tab never materializes a row for it and the Manifesto tab rejects a pasted `CHATBOT` module. The same update was made for `'LEAD_FORM'` in `M20-S08`.

---

## Engineering question — preview semantics (resolved, shipped)

`is_published` gates what the public hotsite route serves, so "Preview" must show the *draft* (unsaved) state — something the public route never serves once published.

**Resolved: client-side live preview, confirmed shipped.** `HotsiteEditor` passes a `draft: HotsiteAdminContentResponse` prop directly into `apps/web/features/platform/components/hotsite/HotsitePreview.tsx`, which renders the module tree client-side from that prop — no extra BFF call, no preview-mode parameter/token. No BFF preview-mode parameter/token exists or is needed.

`02-preview.html` reproduces the editor's preview frame plus its 22rem desktop publish card / mobile publish bar.

## Manifesto (advanced editing)

`ManifestTab.tsx` is the fourth editor tab. It accepts the JSON object `{ branding, layout, seo }`, validates its structure, known unique module types and each module's data shape before applying it to the draft. It is an advanced escape hatch; Branding, Layout and SEO remain the guided manager workflow. `01-hotsite-editor.html` includes this delivered state, while `packages/hotsite-templates/definitions/beloauto.json` (merged with its copy by `buildTemplateManifest`) is a realistic configuration and `hotsite-impl/beloauto.html` its public-site output reference.

---

## Reference artifacts in this folder

- `hotsite-impl/` holds the six public-site references (`<name>.html`: `beloauto`, `casa47`, `mimo-pet`, `origem`, `clinica-lume`, `lume-studio`) and their design-reference images. The template compositions themselves live in `packages/hotsite-templates/` (definitions for structure, per-locale copy files for text, a versioned asset manifest), which is the source of truth for each composition's module order, enabled set, variants and presentation; the web specs and the backend layout audit build them through `buildTemplateManifest`. They carry no tenant logo, and their images are shared catalogue objects delivered by the deploy pipelines. The folder is reference material, not a screen of this prototype.
- `editor-vision/` holds the prototypes of the visual editor shipped by TD55 (`td/TD55-HOTSITE-VISUAL-EDITOR-UX.md`), with its own `index.html` and `dev-notes.md` (which files are authoritative for what). The screens above are the detailed (tabbed) editor, reached through "Editar em detalhes".

## Error handling

| Scenario | UI response |
|---|---|
| Invalid color (not hex) — UC-027 A1 | Field: red border + "Cor inválida. Use o formato hexadecimal, ex: #2563eb." — `01b-color-error.html` |
| Image upload fails — UC-027 A2 | Inline error; the upload target remains available for retry — `01c-image-upload-fallback.html` |

## Unpublish (new — not in original UC text)

`POST /tenants/hotsite/unpublish` exists in the backend/BFF but UC-027's text never describes a take-down flow. The prototype places it in a "Zona de risco" panel inside the editor (`01-hotsite-editor.html`, bottom of page) as a secondary, visually de-emphasized action. Shipped (the "Despublicar hotsite" action; `hotsite-admin.controller.ts`).
