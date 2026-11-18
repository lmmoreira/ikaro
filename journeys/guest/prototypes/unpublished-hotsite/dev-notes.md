# Dev Notes — GUEST: Página indisponível

> **Status: Shipped (UC-122, M25-S30).** The page is the shared root state for every public hotsite route that is unavailable: the manifest's effective `isPublished` is false (unpublished, never published or tenant `SUSPENDED`), or the hotsite is published but its lead-form module is disabled (UC-039 A6), or the tenant lacks the BOOKING feature on a booking page. It is a different case from an unknown slug (`app/not-found.tsx`). The page has no form, so there is no validation table.

## Overview

One screen: the neutral "Página indisponível" page. It is the `Unavailable` component (`apps/web/shells/hotsite/components/Unavailable.tsx`, formerly a bare "Em breve" placeholder; now no props, the title and body only, no top bar) plus `UnavailablePage` (`apps/web/shells/hotsite/components/UnavailablePage.tsx`) that renders the top bar over it. There is **one** copy for every case, so it never reveals why and nothing says "Em breve". Customer and team sign-in stay reachable because `[slug]/login` and `[slug]/my-account` never check `isPublished`.

## Open questions / known limitations

- **Top-bar label:** the real `HotsiteAuthBar` says "Área da Equipe"; the prototype keeps the real label (the discovery spec called it "Login da equipe"). The bar draws its own labels from the `auth` namespace, so this page adds no login copy.
- **Existing journeys that cite the placeholder:** `guest/submit-lead-form.md` and `guest/service-detail.md` point at this page for the cases that reach it; this journey is where it is drawn.
- **Language:** all copy is pt-BR; the en entries are created with the story ("Page unavailable" / "This page isn't available right now. Please check back soon.").
- **Reachability of the disabled-module case:** nothing links to a disabled lead-form (the teaser stops rendering and the header CTA is dropped), so it is reached by URL, a cached page up to 5 minutes old, or the widget's live check.

## Screen 1 — Página indisponível (`01-page-not-published.html`; `UnavailablePage` → `Unavailable`)

File: `01-page-not-published.html` (the prototype file keeps its original name) — Status: **Shipped** (M25-S30; `Unavailable.tsx` takes no props and renders the title and body only, the `HotsiteAuthBar` is drawn by `UnavailablePage`; branding is inherited (`var(--ba-*)` via `app/[slug]/layout.tsx` `applyBranding`), and the top bar, the tenant name and logo in the bar (from the manifest) and the neutral copy were added). It is used for every unavailable route, never only for suspended tenants, so it stays reason-neutral.
BFF: `GET /v1/public/platform/manifest/:slug` (a normal manifest with `isPublished === false`, effective value; the layout is stubbed empty); no billing detail exposed publicly.
Copy: "Página indisponível" and "Esta página não está disponível no momento. Volte em breve." (en: "Page unavailable" and "This page isn't available right now. Please check back soon."). Reason-neutral. The bar keeps "Área da Equipe" and "Entrar". The browser tab reads "Página indisponível — Ikaro" on the four routes that build a title from it.
Background painted with `var(--ba-background)` (hotsite full-page rule).

## File map (apps/web)

Shipped in M25-S30 (`plan/M25-TENANT-BILLING-FOUNDATION.md`). Each component change also ships its `.spec.tsx`.

| apps/web path | Status | What shipped |
|---|---|---|
| `shells/hotsite/components/Unavailable.tsx` | EXISTS (shipped, M25-S30) | Neutral message only (heading and body, no props), `--ba-background` painted; still used by `LeadFormWidget` |
| `shells/hotsite/components/UnavailablePage.tsx` | EXISTS (shipped, M25-S30) | `HotsiteAuthBar` (from the manifest) over `Unavailable` |
| `shells/hotsite/components/HotsiteAuthBar.tsx` (and its `HotsiteAuthBarSignedOut`/`HotsiteAuthBarDropdown` parts) | EXISTS | Reused as is; the bar is not duplicated |
| `app/[slug]/page.tsx`, `app/[slug]/booking/page.tsx`, `app/[slug]/booking/availability-alert/page.tsx`, `app/[slug]/lead-form/page.tsx`, `app/[slug]/servicos/[serviceSlug]/page.tsx` | EXISTS (shipped, M25-S30) | Render `<UnavailablePage />` (pages stay thin); the first four also take the new tab title |
| `features/platform/components/public/LeadFormWidget.tsx` | EXISTS | Unchanged: keeps the message-only `Unavailable` (its page already draws the bar) |
| `packages/i18n/locales/pt-BR/web.json`, `packages/i18n/locales/en/web.json` | EXISTS (shipped, M25-S30) | Both locales: `hotsite.unavailable.title` and `hotsite.unavailable.body` replaced `hotsite.unavailable.label` and `hotsite.unavailable.body` (the `label` key is gone) |

## Props

- **`Unavailable` takes none.** It reads its copy from `useTranslations('hotsite')` (`unavailable.title`, `unavailable.body`) and paints `var(--ba-background)`.
- **`UnavailablePage`** takes `slug` and the manifest, and passes the bar `logoUrl` (`manifest.branding.logoUrl`), `tenantName` (`resolveHotsiteDisplayName`) and `navigation` / `navigationCta` (`resolveManifestNavigation` / `resolveHotsiteNavigationCta`, empty for an unpublished manifest because its `layout` is `[]`).
- **`HotsiteAuthBar` props today** (reuse unchanged): `slug: string`, `logoUrl: string`, `tenantName: string`, and optional `navigation` / `navigationCta`. It is a client component; it fetches the session after hydration.

## States

| State | Trigger | Rendered |
|---|---|---|
| Unpublished | Manifest returned with effective `isPublished === false` (never published, unpublished by the manager, or tenant `SUSPENDED`; the reason is never shown) | `UnavailablePage`: top bar + "Página indisponível" |
| Module disabled | Published hotsite, `/lead-form` while the LEAD_FORM module is disabled | The same `UnavailablePage`, with the site's navigation in the bar |
| Module disabled after the page was cached | `LeadFormWidget`'s live config call reports the module disabled | `Unavailable` only, under the bar the page already draws (never two bars) |
| Feature missing | Published hotsite, but the tenant lacks the BOOKING feature and the route is `/booking`, `/booking/availability-alert` or `/servicos/[serviceSlug]` (`isHotsitePageAvailable`, `features/platform/hotsite/feature-availability.ts`: `isPublished` AND the page's feature available) | The same `UnavailablePage`, reason-neutral |
| Published | `isPublished === true` | The normal page, unchanged |
| Unknown slug | Manifest `404` | Root `app/not-found.tsx` (not this page) |
| Manifest loading | Server-rendered; the route has no client spinner | Not drawn. Next.js `loading.tsx` for the `[slug]` tree is not part of this story; today nothing is shown until the server responds |
| Manifest error | Manifest fetch fails (BFF down, `5xx`) | Not drawn. Falls to the route's error boundary (decided at discovery, M25-S30); it must NOT show this page, because that would tell visitors a healthy hotsite is unavailable |
| Bar session loading | `HotsiteAuthBar` fetching `/api/session` after hydration | The signed-out bar (team and customer login links) until the session answers; both links work without a session |
