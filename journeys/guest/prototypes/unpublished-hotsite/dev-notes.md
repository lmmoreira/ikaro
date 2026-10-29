# Dev Notes — GUEST: Hotsite não publicada

> **Status: Draft (planned Billing milestone, UC-122).** Moved as-is from the tenant-billing discovery; to be reshaped to the `journeys/README.md` template (file map, props, validation, states) at story discovery. The page is the shared root state for every public hotsite route when the manifest's effective `isPublished` is false; it is a different case from an unknown slug (`app/not-found.tsx`).

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
