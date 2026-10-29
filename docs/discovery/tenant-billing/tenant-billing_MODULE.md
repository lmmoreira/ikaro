# Discovery: Tenant Billing — Hotsite Module `TRIAL_SIGNUP_CTA`

**Status:** Discovery — module spec at the level `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` §7 ("Adding a New Module") needs. Not implemented.

**Companion docs:** `tenant-billing.md` §6 · `tenant-billing_USECASES.md` (CAND-22, 26) · `prototype/` (`manager-05*`, `public-02`) — promoted to `journeys/manager/prototypes/hotsite/01g`/`01h` and `journeys/guest/prototypes/ikaro-trial/`; the canonical module contract is now `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` § TRIAL_SIGNUP_CTA.

## 1. What it is

A call-to-action block on Ikaro's **own** tenant hotsite: a title, an optional text, and a button. The button opens the separate public page `/ikaro-trial` where the visitor starts a trial. The module contains **no form** — the multi-step flow (Turnstile → Google → details → provision) is a page, not a hotsite section.

Naming follows the existing function-based module types (`BOOKING_CTA`, `LEAD_FORM`, `CHATBOT`). It is not a billable feature (no price, no entitlement); Ikaro's tenant is exempt from billing.

## 2. Data contract (flat, per §7 step 1)

```ts
// Mirrors BookingCtaModuleData's vocabulary (variant / title / subtitle / ctaLabel) — no second naming scheme.
export interface TrialSignupCtaModuleData {
  variant?: 'centered' | 'left-aligned';   // default 'centered'
  title: string;                           // 1..80 chars
  subtitle?: string;                       // optional, <= 200 chars
  ctaLabel: string;                        // 1..30 chars, default "Testar grátis por 14 dias"
}
// Section background (primary / secondary / none) is NOT a data field: it is the existing
// section-level `presentation.background.surface` ('primary' | 'secondary' | 'background'), exactly
// like every other hotsite module (HotsiteModulePresentation, a sibling of `data`).
```
- `href` is not configurable: the module always links to `/ikaro-trial` (the page, with language following the hotsite's language). A configurable URL would turn the module into a generic button.
- The editor panel in `manager-05*` maps to this contract: "Título" → `title`, "Descrição" → `subtitle`, "Texto do botão" → `ctaLabel`, alignment → `variant`, "Fundo da seção" → `presentation.background.surface`, "Exibir esta seção" → the module's `enabled`. Limits: title 80, subtitle 200, label 30. Reconciled with `BOOKING_CTA` on 2026-10-27; nothing is left for story discovery here.

## 3. Restriction to Ikaro's tenant

- Layout rules (`hotsite-layout.rules.ts`) **reject** a `TRIAL_SIGNUP_CTA` module on any tenant whose slug is not `PLATFORM_OWNER_TENANT_SLUG` (an env var validated in `env.validation.ts`; the prototype's slug `ikaro` is just its illustrative value, never hardcoded). The editor asks the backend whether the tenant is the platform owner instead of comparing a slug on the client. The check is server-side (API); the editor also hides the module from the add-module list for other tenants.
- This is a deliberate exception inside a generic engine. The risk is low (a foreign tenant advertising Ikaro signup) but it is closed cheaply; the alternative (a plain dedicated page with an ordinary CTA) was considered and rejected by the owner in favour of using the hotsite engine.

## 4. Checklist against §7 (promotion-time work)

1. **Contract:** add `TRIAL_SIGNUP_CTA` to `HOTSITE_MODULE_TYPES` (`packages/validation/src/hotsite.ts`), a strict schema in `packages/types/src/hotsite-schemas.ts`, the entry in `HotsiteModuleSchema`, the `HotsiteModuleType` member in `packages/types/src/enums.ts` **in the same commit** (the `closed-enum-registry` detector fails otherwise), the `XxxModuleData` interface in `packages/types/src/hotsite.ts`, and an entry in every exhaustive `Record<HotsiteModuleType, …>` (`MODULE_SCHEMAS`, `MODULE_CONFIG_PANELS`, the `hotsite.layout.modules.*` labels).
2. **Component:** `apps/web/shells/hotsite/components/TrialSignupCtaModule.tsx`, server component, `var(--ba-*)` only, rendered through `HotsiteSectionShell` (`selfLayout`), accessible, with a Vitest + RTL spec. The button is a link to `/ikaro-trial`.
3. **Zod schema** registered in `module-schemas.ts` (`MODULE_DATA_SCHEMAS`).
4. **Render branch:** a `case 'TRIAL_SIGNUP_CTA'` in `HotsiteModuleView.tsx` (the switch is exhaustive).
5. **Admin config panel** in the hotsite editor (`manager-05` prototypes): title, text, button label, enabled toggle, presentation.
6. **Docs:** add to the §3 table and §4 data interfaces of `HOTSITE_DYNAMIC_ARCHITECTURE.md`.
7. **i18n:** `hotsite.layout.modules.TRIAL_SIGNUP_CTA.*` labels in both locales.
8. **Verified extra touch points (review 3):** the backend mirror `contexts/platform/domain/hotsite-config.types.ts` (union of module data interfaces); `hotsite-layout.rules.ts` (per-type singleton rule, `presentation` allow-list, the owner-slug restriction goes here); `HotsiteModuleSchema` and its exhaustiveness spec in `packages/validation/src/hotsite-modules.ts`; the web `page-model.ts` and `default-layout.ts`; and `packages/hotsite-templates` (definitions plus `copy/{pt-BR,en}` — its tests require copy for every module key, and templates must **not** carry this module, so the catalogue test needs an explicit exclusion). Data vocabulary: `BookingCtaDataSchema` is a loose object (`variant?`, `title`, `subtitle?`, `ctaLabel`, plus image/layout options); mirror only `variant`/`title`/`subtitle`/`ctaLabel`.

## 5. The `/ikaro-trial` page (not a module)

A public page served at `/ikaro-trial`, server-rendered, **branded as the Ikaro tenant**: it takes the platform-owner tenant's hotsite branding through the same `applyBranding()` path as any tenant page (the booking page, lead form, …), so the trial pages look like Ikaro's own hotsite (owner decision 2026-10-27, decision 71). Because `--ba-*` tokens only exist under the hotsite tree (CLAUDE.md §8), the pages are implemented inside it — under `app/[slug]/…` for the owner slug only (404 for any other slug) — and the public URL `/ikaro-trial` is a Next.js rewrite to `/{PLATFORM_OWNER_TENANT_SLUG}/ikaro-trial/*`. The routing mechanism is the only detail left to story discovery:
- feature descriptions (translated copy in `packages/i18n`), dependency hints, tiers for the chatbot;
- a **price table** read from `GET /v1/public/billing/prices?country=` with a BR/US switch (loading and error states; a failed price load never blocks signup since the trial is free);
- then Turnstile → Google → form → welcome (CAND-22).

Styling is therefore the owner tenant's branding (`--ba-*` through the hotsite layout), not a separate marketing style. If the owner tenant's hotsite is unpublished or suspended (it cannot be suspended, `exempt`), the trial pages still render, because they do not depend on the manager's `isPublished` flag; they only need the branding from the manifest.

## 6. Edge cases

- Module disabled or removed → the Ikaro hotsite simply has no CTA; `/ikaro-trial` still works if linked.
- Ikaro's tenant suspended (should never happen: `exempt`, which cannot be cleared for it) → `exempt` and the guard in CAND-27 A4 prevent it.
- The module appears in a template catalogue? **No** — templates must not carry it (a template could be applied to a foreign tenant). Template application ignores/rejects it.
