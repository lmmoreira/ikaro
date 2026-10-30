# Dev Notes — GUEST: Hotsite não publicada

> **Status: Draft (planned Billing milestone, UC-122).** Moved as-is from the tenant-billing discovery; the `journeys/README.md` template sections (File map, Props, States) are now added at the end; the page has no form, so there is no validation table. The page is the shared root state for every public hotsite route when the manifest's effective `isPublished` is false; it is a different case from an unknown slug (`app/not-found.tsx`).

## Overview

One screen: the neutral "Página não publicada" page. It is the existing `Unavailable` component (`apps/web/shells/hotsite/components/Unavailable.tsx`, today a bare "Em breve" placeholder with no props and no top bar) with a new copy variant and the top bar. It is rendered for every unpublished hotsite — the manager unpublished it, it was never published, or the tenant is `SUSPENDED` — so it never reveals why. Customer and team sign-in stay reachable because `[slug]/login` and `[slug]/my-account` never check `isPublished`.

## Open questions / known limitations

- **Top-bar label:** the real `HotsiteAuthBar` says "Área da Equipe"; the prototype keeps the real label (the discovery spec called it "Login da equipe"). Verify `<Unavailable />` renders the bar in the story.
- **Existing journeys that cite the placeholder:** `guest/submit-lead-form.md` and `guest/service-detail.md` already say a hotsite that is not published resolves to the generic `Unavailable`; this journey is where that page is now drawn.
- **Language:** all copy is pt-BR; the en entries are created with the story.

## Screen 1 — Hotsite: Página não publicada (`01-page-not-published.html`; `Unavailable`)

File: `01-page-not-published.html` — Status: **CHANGED** (`apps/web/shells/hotsite/components/Unavailable.tsx` takes no props and renders no `HotsiteAuthBar` today; branding is already inherited today (`var(--ba-*)` via `app/[slug]/layout.tsx` `applyBranding`), so what is new is the top bar, the tenant name and logo in the bar (from the minimal manifest) and the copy; it is used for every unpublished hotsite, never only for suspended ones, so it stays reason-neutral). Copy variant "Página não publicada" is also new.
BFF: `GET /v1/public/platform/manifest/:slug` (a normal manifest with `isPublished === false`, effective value; the layout is stubbed empty); no billing detail exposed publicly.
Copy: "Página não publicada", "Esta página não está disponível no momento. Volte em breve." Reason-neutral. Top bar keeps "Área da Equipe" and "Entrar".
Background painted with `var(--ba-background)` (hotsite full-page rule).

## File map (apps/web)

From `plan/M25-TENANT-BILLING-FOUNDATION.md` M25-S30. Each component change also ships its `.spec.tsx`.

| apps/web path | Status | Action |
|---|---|---|
| `shells/hotsite/components/Unavailable.tsx` | EXISTS (bare "Em breve", no props, no bar) | Modify: add the unpublished variant, the top bar and the tenant name/logo |
| `shells/hotsite/components/HotsiteAuthBar.tsx` (and its `HotsiteAuthBarSignedOut`/`HotsiteAuthBarDropdown` parts) | EXISTS | Reuse as is; modify only if needed to reuse it; do not duplicate the bar |
| `app/[slug]/page.tsx`, `app/[slug]/booking/page.tsx`, `app/[slug]/booking/availability-alert/page.tsx`, `app/[slug]/lead-form/page.tsx`, `app/[slug]/servicos/[serviceSlug]/page.tsx` | EXISTS | Modify: pass the variant and tenant context (pages stay thin) |
| `packages/i18n/locales/pt-BR/web.json`, `packages/i18n/locales/en/web.json` | EXISTS | Modify: keys for the new copy variant, both locales |

## Props

- **`Unavailable` today takes none.** The component reads its copy from `useTranslations('hotsite')` (`unavailable.label`, `unavailable.body`) and paints `var(--ba-background)`.
- **Proposed `Unavailable` props** (decided at story discovery): `variant: 'unpublished' | 'moduleDisabled'` (the second keeps the legacy "Em breve" for a published hotsite whose lead-form module is disabled), plus the tenant context the bar needs: `slug`, `tenantName`, `logoUrl`.
- **`HotsiteAuthBar` props today** (reuse unchanged): `slug: string`, `logoUrl: string`, `tenantName: string`, and optional `navigation` / `navigationCta` (not passed here: this page has no navigation module). It is a client component; it fetches the session after hydration.

## States

| State | Trigger | Rendered |
|---|---|---|
| Unpublished | Manifest returned with effective `isPublished === false` (never published, unpublished by the manager, or tenant `SUSPENDED`; the reason is never shown) | `Unavailable` variant `unpublished`: top bar + "Página não publicada" |
| Module disabled (legacy) | Published hotsite, `/lead-form` while the LEAD_FORM module is disabled | `Unavailable` variant `moduleDisabled`: bare "Em breve", unchanged |
| Published | `isPublished === true` | The normal page, unchanged |
| Unknown slug | Manifest `404` | Root `app/not-found.tsx` (not this page) |
| Manifest loading | Server-rendered; the route has no client spinner | Not drawn. Next.js `loading.tsx` for the `[slug]` tree is not part of this story; today nothing is shown until the server responds |
| Manifest error | Manifest fetch fails (BFF down, `5xx`) | Not drawn. Falls to the route's error boundary; it must NOT show "Página não publicada", because that would tell visitors a healthy hotsite was unpublished. Decide the error page at story discovery |
| Bar session loading | `HotsiteAuthBar` fetching `/api/session` after hydration | The signed-out bar (team and customer login links) until the session answers; both links work without a session |
