# GUEST — Página Indisponível (Unavailable Hotsite Page)

**Actor(s):** GUEST (any visitor — an authenticated CUSTOMER or STAFF member who opens the public site sees the same page)
**Goal:** A visitor who opens a tenant's public hotsite route that is not available — the hotsite is not published, the tenant is suspended, or a module's page is disabled — lands on one neutral page that says so, never reveals why, and still offers the team login and the customer login
**UCs covered:** UC-122 (hotsite is effectively unpublished when suspended); UC-039 A6 (lead-form module disabled); also the existing "Em breve" placeholder (M12-S08), which this page replaces
**Status:** Draft (planned Billing milestone)

> The page is shared by **every** unavailable public hotsite route — the manager unpublished the hotsite, the tenant has not published yet, the tenant is `SUSPENDED` (UC-121), or a published hotsite's lead-form module is disabled (UC-039 A6) — so it can never reveal the reason, and no copy says "Em breve". It is the root state for **all** public hotsite routes, not specific to the lead form or the service page. It is a different case from an **unknown slug**, which keeps the root-level `app/not-found.tsx` (static Ikaro styling, no tenant branding).

## Flow

```mermaid
flowchart TD
    classDef existing fill:#e6ffe6,stroke:#3a3
    classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee

    Visit(["Visitor opens a public hotsite route<br/>/{slug}, /booking, /booking/availability-alert,<br/>/lead-form, /servicos/{serviceSlug}"]) --> Manifest{"manifest.isPublished<br/>(effective: manager flag AND tenant operational)"}
    Manifest -- "true" --> Module{"lead-form module enabled?<br/>(only /lead-form asks)"}
    Module -- "yes, or another route" --> Site["✅ Normal hotsite / page"]
    Module -- "no (UC-039 A6)" --> Unavailable
    Manifest -- "false<br/>(unpublished, never published, or tenant suspended)" --> Unavailable["❓ GAP: UnavailablePage — 'Página indisponível'<br/>+ top bar (01-page-not-published)"]
    Unavailable --> Team(("Área da Equipe")) --> StaffLogin["✅ /dashboard/login?tenantSlug=…<br/>(staff/login.md)"]
    Unavailable --> Customer(("Entrar")) --> CustLogin["✅ /{slug}/login<br/>(customer/login.md)"]
    Visit -. "unknown slug" .-> NotFound["✅ app/not-found.tsx<br/>(separate case, not this page)"]

    class Site,StaffLogin,CustLogin,NotFound existing
    class Unavailable gap
```

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| every public hotsite route (`/{slug}`, `/booking`, `/booking/availability-alert`, `/lead-form`, `/servicos/{serviceSlug}`) | `Unavailable` (`apps/web/shells/hotsite/components/Unavailable.tsx`) | M12-S08 (placeholder) | ✅ Existing — today a bare "Em breve" placeholder with no top bar |
| the same routes, with the top bar and the neutral copy | `UnavailablePage` (new) = `HotsiteAuthBar` + `Unavailable` (message only), "Página indisponível" | M25-S30 | ❓ Gap — `Unavailable` takes no props and renders no bar today |
| unknown slug | `app/not-found.tsx` | M12-S08 | ✅ Existing — a different case, unchanged |

## Open questions / gaps

- [ ] **Top-bar label:** the real `HotsiteAuthBar` says "Área da Equipe"; the prototype keeps the real label (the discovery spec called it "Login da equipe"). Verify the bar renders in the story.
- [ ] **Customer sign-in on an unpublished hotsite:** `[slug]/login` and `[slug]/my-account` never check `isPublished`, so customers and the team keep a working sign-in path — intentional, it is what makes the customer "Empresa inativa" badge (`customer/minha-conta.md`) and the staff notice (`staff/login.md`) reachable.
- [x] **Copy scope (decided at M25-S30 discovery):** one neutral page and copy for every case, including a published hotsite whose lead-form module is disabled (UC-039 A6) and the stale cached page (the widget keeps the message-only `Unavailable` under the bar the page already draws). "Em breve" is removed; nothing links to a disabled lead-form, so that page is reached by URL, a cached page up to 5 minutes old, or the widget's live check.
- [ ] **Copy:** "Página indisponível" and "Esta página não está disponível no momento. Volte em breve." are new (en: "Page unavailable" / "This page isn't available right now. Please check back soon."); today's placeholder says "Em breve" / "Estamos preparando algo especial". The browser tab reads "Página indisponível — Ikaro". Both need pt-BR and en entries.
- [ ] **Existing journey lines:** `guest/submit-lead-form.md` and `guest/service-detail.md` already point at the generic `Unavailable` for a hotsite that is not published; they now also point here.

## Prototype

Folder: `guest/prototypes/unpublished-hotsite/` — hub: `index.html`.

| File | Screen | UC | Status |
|---|---|---|---|
| `index.html` | Navigation hub + dry-run checklist | — | ❓ Draft |
| `01-page-not-published.html` | "Página indisponível" with the top bar (team login + customer login) | UC-122 | ❓ Draft |
| `dev-notes.md` | Implementation handoff (moved as-is from the billing discovery; reshape at story discovery) | — | ❓ Draft |

The page is reached from any published-looking hotsite link, so the hub links to `../../../shared/hotsite.html` for the published look; there is no `00-hotsite.html` because the journey does not start on a working hotsite.
