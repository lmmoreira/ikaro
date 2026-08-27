# CUSTOMER — Submit Lead Form

**Actor(s):** CUSTOMER
**Goal:** Submit interest via a tenant's lead-capture form, with contact fields pre-filled from the account profile
**UCs covered:** UC-040
**Status:** Built — M20-S09. Promoted from `docs/discovery/lead-form-module/lead-form-module.md` via `/discovery-to-milestone` (2026-08-23) for milestone `M20-LEAD-FORM-MODULE`.

## Flow

```mermaid
flowchart TD
    Start(["Hotsite /{slug} (autenticado)<br/>LEAD_FORM teaser section"]) --> CTA(("Clica 'Preencher formulário'"))
    CTA --> Fetch{"GET /public/platform/lead-form/:slug<br/>+ GET /customers/me (server-side)"}
    Fetch --> Form["formulário pré-preenchido<br/>(01-form-prefilled) |UC-040|"]

    LoginReturn(["Retorno de guest/prototypes/lead-form/01g-login-required.html<br/>após login"]) --> Fetch

    Form --> Turnstile(("Completa Turnstile + Enviar"))
    Turnstile --> Submit{"POST /public/platform/lead-form/:slug/submissions<br/>(customerId do JWT sub)"}
    Submit -- "400/401/429" --> SharedError["mesmos estados do fluxo GUEST<br/>ver guest/prototypes/lead-form/"]
    Submit -- "200 OK" --> Success["recebido, auth bar autenticada<br/>(01b-success)"]

    SharedError --> Form
```

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| `/[slug]/lead-form` (authenticated) | `LeadFormPage` (same component as GUEST, prefilled via `getHotsiteCustomerProfile()` client-side) | M20-S09 | ✅ Done |

## Open questions / gaps

- [x] Milestone/story: `M20-S09` (`plan/M20-LEAD-FORM-MODULE.md`) — shipped.
- [x] Loading, validation error, captcha error, rate-limited, and generic submission error are identical to the GUEST flow — intentionally not re-prototyped here, per `guest/submit-lead-form.md`. Success **is** re-prototyped (`01b-success.html`), not because the content differs but because the auth bar does — the GUEST success screen shows the unauthenticated "Entrar" link, which would be wrong for an already-logged-in customer. An earlier draft of `01-form-prefilled.html` linked its "Enviar" button to the GUEST success screen; fixed to link to `01b-success.html` instead.

## Prototype

Folder: `customer/prototypes/lead-form/`

| File | Screen | UC | Status |
|---|---|---|---|
| `index.html` | Navigation hub | — | ✅ Criado |
| `01-form-prefilled.html` | Formulário com dados pré-preenchidos | UC-040 | ✅ Criado |
| `01b-success.html` | Envio recebido, auth bar autenticada (avatar/dropdown) | — | ✅ Criado |
| `dev-notes.md` | Implementation handoff | — | ✅ Criado |

Every other alternate state links back into `../../../guest/prototypes/lead-form/` rather than duplicating it.
