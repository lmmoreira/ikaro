# Discovery: Tenant Billing — Hotsite Module `TRIAL_SIGNUP_CTA`

**Status:** Discovery — module spec at the level `docs/HOTSITE_DYNAMIC_ARCHITECTURE.md` §7 ("Adding a New Module") needs. Not implemented.

**Companion docs:** `tenant-billing.md` §6 · `tenant-billing_USECASES.md` (CAND-22, 26) · `prototype/` (`manager-05*`, `public-02`).

## 1. What it is

A call-to-action block on Ikaro's **own** tenant hotsite: a title, an optional text, and a button. The button opens the separate public page `/ikaro-trial` where the visitor starts a trial. The module contains **no form** — the multi-step flow (Turnstile → Google → details → provision) is a page, not a hotsite section.

Naming follows the existing function-based module types (`BOOKING_CTA`, `LEAD_FORM`, `CHATBOT`). It is not a billable feature (no price, no entitlement); Ikaro's tenant is exempt from billing.

## 2. Data contract (flat, per §7 step 1)

```ts
export interface TrialSignupCtaModuleData {
  title: string;            // 1..80 chars
  text?: string;            // optional, <= 400 chars
  buttonLabel: string;      // 1..40 chars, default "Testar grátis por 14 dias"
}
```
- `href` is not configurable: the module always links to `/ikaro-trial` (the page, with language following the hotsite's language). A configurable URL would turn the module into a generic button.
- Accepts `presentation` and `presentation.background` like the other CTA modules (`BOOKING_CTA`'s rules): decide in the story; default yes.

## 3. Restriction to Ikaro's tenant

- Layout rules (`hotsite-layout.rules.ts`) **reject** a `TRIAL_SIGNUP_CTA` module on any tenant whose slug is not `PLATFORM_OWNER_TENANT_SLUG` (an env var validated in `env.validation.ts`). The check is server-side (API); the editor also hides the module from the add-module list for other tenants.
- This is a deliberate exception inside a generic engine. The risk is low (a foreign tenant advertising Ikaro signup) but it is closed cheaply; the alternative (a plain dedicated page with an ordinary CTA) was considered and rejected by the owner in favour of using the hotsite engine.

## 4. Checklist against §7 (promotion-time work)

1. **Contract:** add `TRIAL_SIGNUP_CTA` to `HOTSITE_MODULE_TYPES` (`packages/validation/src/hotsite.ts`), a strict schema in `packages/types/src/hotsite-schemas.ts`, the entry in `HotsiteModuleSchema`, the `HotsiteModuleType` member in `packages/types/src/enums.ts` **in the same commit** (the `closed-enum-registry` detector fails otherwise), the `XxxModuleData` interface in `packages/types/src/hotsite.ts`, and an entry in every exhaustive `Record<HotsiteModuleType, …>` (`MODULE_SCHEMAS`, `MODULE_CONFIG_PANELS`, the `hotsite.layout.modules.*` labels).
2. **Component:** `apps/web/shells/hotsite/components/TrialSignupCtaModule.tsx`, server component, `var(--ba-*)` only, rendered through `HotsiteSectionShell` (`selfLayout`), accessible, with a Vitest + RTL spec. The button is a link to `/ikaro-trial`.
3. **Zod schema** registered in `module-schemas.ts` (`MODULE_DATA_SCHEMAS`).
4. **Render branch:** a `case 'TRIAL_SIGNUP_CTA'` in `HotsiteModuleView.tsx` (the switch is exhaustive).
5. **Admin config panel** in the hotsite editor (`manager-05` prototypes): title, text, button label, enabled toggle, presentation.
6. **Docs:** add to the §3 table and §4 data interfaces of `HOTSITE_DYNAMIC_ARCHITECTURE.md`.
7. **i18n:** `hotsite.layout.modules.TRIAL_SIGNUP_CTA.*` labels in both locales.

## 5. The `/ikaro-trial` page (not a module)

A Next.js route outside the `[slug]` tree (technical slice, like `auth`), server-rendered:
- feature descriptions (translated copy in `packages/i18n`), dependency hints, tiers for the chatbot;
- a **price table** read from `GET /v1/public/billing/prices?country=` with a BR/US switch (loading and error states; a failed price load never blocks signup since the trial is free);
- then Turnstile → Google → form → welcome (CAND-22).

It must not use `--ba-*` tokens unless it is placed under the hotsite tree; as a platform page it uses the Ikaro marketing styling (decided in story discovery, with the CLAUDE.md §8 `--ba-*` boundary in mind).

## 6. Edge cases

- Module disabled or removed → the Ikaro hotsite simply has no CTA; `/ikaro-trial` still works if linked.
- Ikaro's tenant suspended (should never happen: `exempt`) → the guard in CAND-27 A4 and `exempt` prevent it.
- The module appears in a template catalogue? **No** — templates must not carry it (a template could be applied to a foreign tenant). Template application ignores/rejects it.
