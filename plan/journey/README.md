# Journey Maps (`plan/journey/`)

## Purpose

A **journey** documents one cohesive sequence of screens/actions a specific actor moves through to accomplish a goal, built from one or more use cases (`docs/04-USE_CASES.md`). Journeys bridge **use cases** (atomic business actions) and **wireframes/pages** (what gets built) — and are the primary tool for finding IA gaps: places where a use case implies a step but no page/route exists yet.

A **prototype** is a folder of static HTML files that makes the journey clickable in a browser. It uses the real `--ba-*` branding tokens and serves as the handoff spec from UX validation to React implementation.

---

## Folder structure

```
plan/journey/
├── README.md                        ← this file
├── shared/                          ← assets shared across ALL actor prototypes
│   ├── tokens.css                   ← single source of truth for --ba-* tokens
│   ├── hotsite.html                 ← fake public hotsite (entry for both guest + customer)
│   └── login.html                   ← Google OAuth login screen
├── guest/
│   ├── use-cases.md                 ← UC inventory for this role
│   ├── <journey-slug>.md            ← one file per journey
│   └── prototypes/
│       └── <journey-slug>/
│           ├── index.html           ← navigation hub + dry-run checklist
│           ├── 00-hotsite.html      ← redirect → ../../../shared/hotsite.html
│           ├── 01-<screen>.html     ← numbered screens in flow order
│           ├── ...
│           └── dev-notes.md         ← implementation handoff: components, API, validation, states
├── customer/
│   ├── use-cases.md
│   ├── <journey-slug>.md
│   └── prototypes/
│       └── <journey-slug>/
│           ├── index.html
│           ├── 00-hotsite.html      ← redirect → ../../../shared/hotsite.html
│           ├── 00-login.html        ← redirect → ../../../shared/login.html
│           ├── 01-<screen>.html
│           ├── ...
│           └── dev-notes.md
├── staff/
│   ├── use-cases.md                 ← shared STAFF + MANAGER journeys
│   ├── <journey-slug>.md
│   └── prototypes/
│       └── <journey-slug>/
└── manager/
    ├── use-cases.md                 ← MANAGER-exclusive journeys
    ├── <journey-slug>.md
    └── prototypes/
        └── <journey-slug>/
```

### Why MANAGER, not ADMIN

`docs/04-USE_CASES.md` uses "Admin" loosely to mean "Staff or Manager." The system has exactly two staff-side JWT roles (CLAUDE.md §1): `STAFF` and `MANAGER`. `MANAGER` is a **superset** — everything `STAFF` can do, plus settings/team/hotsite management.

- A journey belongs in `staff/` if both `STAFF` and `MANAGER` can perform it.
- A journey belongs in `manager/` only if the use case explicitly restricts it to the `MANAGER` role.

### Excluded use cases

Two UCs don't belong in any folder here:

| UC | Why excluded |
|---|---|
| UC-016b — Weekly Loyalty Expiry Warning | System cron job, email-only, no UI |
| UC-024 — Platform Operator Provisions Tenant | Platform-level CLI/API call by internal ops, not a tenant dashboard user |

---

## Part 1 — Journey files

### File naming

- `use-cases.md` — per-folder inventory of every UC relevant to that actor
- `<journey-slug>.md` — one file per journey, e.g. `staff/booking-management.md`

A "journey" = a cluster of related UCs the actor would naturally work through in one sitting — group by **goal**, not by UC number. One UC can appear in multiple journeys/folders if multiple actors are involved.

### Journey file template

```markdown
# <Role> — <Journey Title>

**Actor(s):** STAFF | MANAGER | CUSTOMER | GUEST
**Goal:** <one sentence>
**UCs covered:** UC-XXX, UC-YYY
**Status:** Draft | Reviewed | Mapped to stories

## Flow

\`\`\`mermaid
flowchart TD
    ...
\`\`\`

## Pages referenced

| Page / Route | Component | Story | Status |
|---|---|---|---|
| /[slug]/booking | BookingForm | M12-S07 | ✅ Existing |

## Open questions / gaps

- [ ] ...
```

### Mermaid conventions

- Diagram type: `flowchart TD` (top-to-bottom)
- **Page/screen** → rectangle: `B["/dashboard/bookings<br/>Booking Queue"]`
- **User/system action** → rounded: `B(("Click Aprovar"))`
- **Decision point** → diamond: `C{"2+ tenants?"}`
- **Start/end** → stadium: `([Login])`
- **Gap** (no page/route exists yet) → dashed red:
  ```
  classDef gap stroke:#f00,stroke-dasharray: 5 5,fill:#fee
  ```
  Label prefixed `❓ GAP:` with the blocked UC.
- **Existing** (already built in a prior milestone) → green:
  ```
  classDef existing fill:#e6ffe6,stroke:#3a3
  ```
- Edges labeled with the triggering UC: `A -->|UC-003 Approve| B`

### What goes in the flowchart vs. the prototype

The flowchart documents **navigation** — screens the actor moves between and decisions that change which screen comes next. It does not model UI states within a single screen.

**Always include in the flowchart:**
- Decision nodes that change the actor's next screen (e.g., slot conflict → forced back to step 2)
- Terminal outcomes — both success and significant failure (booking rejected, unrecoverable error)
- IA gaps: routes that do not exist yet — dashed red `classDef gap`, label prefixed `❓ GAP:`

**Leave out of the flowchart:**
- Loading, fetch-error, empty, and validation states *within* the same screen — these are UI states for one route, not navigation events; document them in the prototype instead
- Per-field validation errors (too granular for a flow diagram)

Every journey must show at minimum: **(1)** the happy-path terminal state, **(2)** any business-rule branch that forces the actor to a different screen, **(3)** any significant rejection or failure that ends the journey outside the success path.

### Journey workflow

0. **Validate source docs**: run `/docs-audit` scoped to the relevant UCs. Resolve findings before proceeding — journeys built on stale UC text cause rework.
1. **Inventory**: every UC assigned to a folder's `use-cases.md` by primary actor.
2. **Group into journeys**: cluster related UCs by goal. Update the inventory's "Journey file" column.
3. **Draw the flow**: every screen the actor sees, in order, with decisions and gaps marked.
4. **List "Pages referenced"**: cross-reference `plan/M13-DASHBOARD-FRONTEND.md` story numbers.
5. **Resolve gaps**: for each gap node, propose a new story, fold into an existing story's AC, or explicitly defer with a documented reason.
6. **Hand off to prototype**: once gaps are agreed, create the prototype folder.

---

## Part 2 — Prototypes

### Purpose

A prototype validates the UX flow before any React code is written, and doubles as a handoff spec that gives a future implementation agent everything it needs without back-and-forth. The goal is **minimum friction from prototype to development**.

### Prototype folder contents

Every prototype folder must contain:

| File | Required | Purpose |
|---|---|---|
| `tokens.css` | ❌ **never create locally** | Do NOT create in the prototype folder — every step file must reference `../../../shared/tokens.css` instead. Individual copies create update drift. |
| `index.html` | ✅ | Navigation hub — lists all screens + dry-run checklist |
| `dev-notes.md` | ✅ | Implementation handoff — components, API calls, validation rules, states |
| `00-hotsite.html` | when journey starts on hotsite | Fake hotsite with login bar at top |
| `00-login.html` | when journey requires auth | Google OAuth login screen |
| `01-<screen>.html` … | ✅ | One file per step, numbered in flow order |

### Shared assets — check before creating any file

**Before creating any file in a prototype folder, ask: "could this file be needed by more than one actor's prototype?"** If yes, put it in `plan/journey/shared/` instead.

Currently shared:

| File | Purpose |
|---|---|
| `shared/tokens.css` | Single source of truth for all `--ba-*` custom properties and reusable CSS classes |
| `shared/hotsite.html` | Fake public hotsite, unauthenticated state — entry point for both guest and customer flows |
| `shared/hotsite-logged-in.html` | Fake public hotsite, authenticated state — avatar dropdown (Minha conta / Sair) instead of "Entrar"; used by customer flows |
| `shared/login.html` | Google OAuth login screen (customer) — referenced by both guest ("Entrar" bar) and customer (auth bar link) |
| `shared/staff-login.html` | Google OAuth login screen (staff/manager) — referenced by all staff-side journeys; links out to the canonical error states in `staff/prototypes/login/` rather than duplicating their copy |
| `shared/customer-dashboard.html` | "Início" tab of `/{slug}/minha-conta` — overview stats + upcoming/history preview; cross-links to the Agendamentos (`customer/prototypes/minha-conta/01-minha-conta.html`) and Fidelidade tabs |
| `shared/dashboard-shell.html` | Generic staff/manager dashboard master template (sidebar + bottom-nav + bottom-sheet). NOT a finished page — copy the shell when building a new staff page; `staff/prototypes/agenda/00-agenda.html` is the validated reference implementation, not this file |
| `shared/entry.html` | Prototype-only actor picker (Sou cliente / Sou funcionário) — lets a reviewer start from one URL; has no production equivalent |

**Path convention from a step file to shared/:** Step files live at `<actor>/prototypes/<journey>/`, so shared/ is three levels up then back into shared/:
```
../../../shared/tokens.css
../../../shared/hotsite.html
../../../shared/login.html
```

**Redirect pattern** — when a shared page replaces a previously local one (e.g. `00-hotsite.html`), keep the local file as a minimal HTML redirect so existing links don't break:
```html
<!DOCTYPE html>
<html><head>
  <meta http-equiv="refresh" content="0; url=../../../shared/hotsite.html">
</head><body>
  <p>Redirecting… <a href="../../../shared/hotsite.html">click here</a></p>
</body></html>
```

**Good shareability candidates for future prototypes:** any page that appears identically across actor flows (e.g. a tenant-selection screen after login, a success/error splash, a shared layout shell).

**Rule:** do not duplicate. One change (copy tweak, token update, layout fix) should propagate everywhere automatically.

### tokens.css

The canonical token file is `shared/tokens.css`. Individual prototype folders do **not** have their own `tokens.css` — all step files reference `../../../shared/tokens.css`.

Always copy the **exact default values** from `hotsite-config.aggregate.ts` (`DEFAULT_HOTSITE_BRANDING`) and `apply-branding.ts`. Never invent values.

```css
:root {
  --ba-primary:       #2563eb;
  --ba-secondary:     #eff6ff;
  --ba-background:    #ffffff;
  --ba-text:          #111827;
  --ba-heading-font:  'Inter', sans-serif;
  --ba-body-font:     'Inter', sans-serif;
  --ba-radius:        8px;            /* borderRadius: 'rounded' */
  --ba-section-py:    5rem;           /* spacing: 'comfortable' */
  --ba-shadow:        0 1px 3px rgba(0,0,0,0.10); /* shadowStyle: 'subtle' */
  --ba-btn-bg:        #2563eb;        /* buttonStyle: 'filled' */
  --ba-btn-text:      #ffffff;
  --ba-btn-border:    #2563eb;
  --ba-btn-hover-bg:  #2563eb;
  --ba-hero-text:     #ffffff;
}
```

Also define reusable classes: `.btn-primary`, `.btn-secondary`, `.card`, `.card.selected`, `.step-container`, `.step-indicator`, `.form-label`, `.form-input`, `.nav-buttons`, `.slot-btn`, `.day-pill`, `.upload-area`, `.auth-bar`, `.auth-avatar`. See existing `tokens.css` files for the full list.

### Brand + auth bar pattern (mandatory on every public screen)

Every non-dashboard prototype screen (guest booking flow, customer booking flow, standalone public pages like `submit-info`) must show a **combined brand + auth bar** at the top — not a plain right-aligned "Entrar" strip. The brand name gives the page identity; the auth element (Entrar or avatar) goes on the right.

**Unauthenticated (GUEST screens):**
```html
<div style="background:white;border-bottom:1px solid var(--ba-secondary);
            padding:0.625rem 1.5rem;display:flex;align-items:center;justify-content:space-between;">
  <div style="display:flex;align-items:center;gap:0.625rem;">
    <div style="width:1.875rem;height:1.875rem;border-radius:0.375rem;background:var(--ba-primary);
                color:white;display:flex;align-items:center;justify-content:center;
                font-weight:700;font-size:0.8125rem;">B</div>
    <span style="font-weight:700;font-size:0.9375rem;color:var(--ba-text);">Ikaro Demo</span>
  </div>
  <a href="../../../shared/login.html" style="display:flex;align-items:center;gap:0.375rem;
     font-size:0.875rem;font-weight:500;color:var(--ba-primary);text-decoration:none;">
    <!-- person SVG icon -->
    Entrar
  </a>
</div>
```

**Authenticated (CUSTOMER booking screens) — brand left, avatar dropdown right:**
```html
<div style="background:white;border-bottom:1px solid var(--ba-secondary);
            padding:0.625rem 1.5rem;display:flex;align-items:center;justify-content:space-between;">
  <div style="display:flex;align-items:center;gap:0.625rem;">
    <div style="width:1.875rem;height:1.875rem;border-radius:0.375rem;background:var(--ba-primary);
                color:white;display:flex;align-items:center;justify-content:center;
                font-weight:700;font-size:0.8125rem;">B</div>
    <span style="font-weight:700;font-size:0.9375rem;color:var(--ba-text);">Ikaro Demo</span>
  </div>
  <!-- existing auth-bar avatar dropdown -->
  <div style="position:relative;"><details>...avatar + dropdown...</details></div>
</div>
```

**Standalone public pages** (e.g. `submit-info`, no booking flow context) use a minimal brand-only header — same logo mark + name, no "Entrar" link needed if the page has its own clear purpose.

**Rules:**
- The brand bar is **always present** on every public (non-dashboard) screen — including error and loading variants.
- The brand logo ("B" square) + tenant name must appear on the **left** so the user always knows which business they're interacting with.
- The auth element on customer screens **must be clickable** (dropdown or link) so the reviewer can navigate.
- Both guest and customer screens link to **`../../../shared/login.html`** — the single shared login page.
- **Do NOT** use the old pattern of a right-aligned "Entrar" link on a secondary-color background (`var(--ba-secondary)`) — that was replaced.

### Hotsite entry point (`00-hotsite.html`)

When the journey starts on the public hotsite (not on a dashboard), create `00-hotsite.html` as the first screen. It must contain:

- The login bar at the very top (unauthenticated state → "Entrar")
- A `HeroModule` (solid `--ba-primary` background, headline, "Agendar agora" CTA)
- A `ServiceListModule` (2–4 sample service cards)
- A `BookingCtaModule` (secondary CTA banner, `id="booking-form"`)
- A minimal footer

The "Agendar" CTA links to `01-<first-booking-step>.html`. The "Entrar" link goes to `../../../shared/login.html` (shared login page).

**For new journeys:** do not copy `00-hotsite.html` or create a new one — link directly to `../../../shared/hotsite.html` from `index.html`, or use the redirect pattern (see "Shared assets" section above).

**Do NOT skip `00-hotsite.html`** — without it, the login bar has no context. The reviewer needs to see where "Entrar" lives relative to the rest of the page before the booking flow starts.

### Screen HTML conventions

Each screen file must follow this structure:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Passo N — <Screen Name></title>
  <link rel="stylesheet" href="tokens.css">
</head>
<body>

  <!-- AUTH BAR (guest or customer variant — always first) -->

  <!--
    COMPONENT: <ComponentName>
    FILE:      apps/web/components/<path>/<ComponentName>.tsx  (EXISTS | GAP)
    PROPS:     ...
    BFF CALL:  METHOD /endpoint  (if applicable)
  -->
  <div class="step-container">
    <p class="step-indicator">Passo N de N</p>
    <h2 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: var(--ba-text)">
      Screen title
    </h2>

    <!-- screen content -->

    <div class="nav-buttons">
      <a class="btn-secondary" href="<prev>.html">Voltar</a>
      <a class="btn-primary" href="<next>.html">Próximo</a>
    </div>
  </div>

</body>
</html>
```

**HTML comment rules:**
- Always open a block comment naming the React component, its file path, and `(EXISTS)` or `(GAP — <story>)`.
- For BFF calls: include `METHOD /endpoint`, headers, and brief response shape.
- For **minor conditional content** within a screen (e.g. a field that appears only when a condition is met): keep it commented-out so reviewers can toggle it inline. For **complete alternate states** (loading, fetch-error, empty, validation-error, submission, success): create a separate variant screen — see "Unhappy path variant screens (mandatory)" below.
- For conditional sections (e.g. pickup address): keep them commented-out so the reviewer can toggle them.

### Summary card ("Revisar pedido")

Any step that asks the user to take a consequential action (fill personal info, confirm booking) should show a read-only summary of what was selected in earlier steps. Format:

```html
<h3 style="font-size: 1.5rem; font-weight: 700; margin-top: 1.5rem; margin-bottom: 1rem; color: var(--ba-text)">
  Revisar pedido
</h3>
<div class="card">
  <p style="font-size: 0.75rem; font-weight: 600; opacity: 0.65; text-transform: uppercase;
            letter-spacing: 0.05em; margin-bottom: 0.5rem;">Serviço</p>
  <p style="font-weight: 600; color: var(--ba-text)">Lavagem Simples</p>
  <p style="font-size: 0.875rem; color: var(--ba-primary); margin-top: 0.125rem;">R$ 60,00 — 30 min</p>
  <hr style="border: none; border-top: 1px solid var(--ba-secondary); margin: 0.875rem 0;">
  <p style="font-size: 0.75rem; font-weight: 600; opacity: 0.65; text-transform: uppercase;
            letter-spacing: 0.05em; margin-bottom: 0.25rem;">Data e horário</p>
  <p style="font-weight: 600; color: var(--ba-text)">Quarta-feira, 18 de junho às 10:00</p>
</div>
```

- The title ("Revisar pedido") is **always a heading element** (`<h2>` or `<h3>`) **outside** the card — never a `<p>` inside the card.
- Apply consistently across all actor paths (guest and customer step 3 show the same card).

### Unhappy path variant screens (mandatory)

> **Non-negotiable rule:** Every prototype must include clickable variant screens for every meaningful non-happy-path state. Commented-out HTML blocks are only for minor inline conditional content — a reviewer clicking through `index.html` must be able to *see* every important state without reading HTML source. This applies to **every journey, every actor, every prototype**, with no exceptions.

#### Naming convention

Variant screens use a letter suffix after the step number, in the same folder as the happy-path screens:

```
01-<screen>.html       ← happy-path baseline
01b-<variant>.html     ← first alternate state for step 1
01c-<variant>.html     ← second alternate state for step 1
02b-<variant>.html     ← first alternate state for step 2
```

They are listed in `index.html` under a dedicated **"Estados alternativos (unhappy paths)"** section, separate from the happy-path list, each tagged:
- `tag-green` — component handles this state correctly today
- `tag-red ⚠` — component has a gap or limitation in this state (still create the screen — it makes the gap tangible)

#### State checklist — apply to every screen before declaring a prototype done

For each step/screen, answer these questions and create a variant for every "yes":

| Question | States to prototype |
|---|---|
| Does it fetch async data on mount? | `b-loading` + `c-fetch-error` |
| Can the fetched data be empty or all-unavailable? | `d-empty` or `d-fully-unavailable` |
| Is it a form with client-side validation? | one `b-validation-error` variant per distinct error type (or one combined showing the worst case) |
| Does it submit to an API? | `b-submitting` + `c-submission-error` + `d-success` |
| Does any component have a stuck or partially-broken state? | a gap variant tagged ⚠ in `index.html`, documented in `dev-notes.md` Known limitations |

#### IA gaps vs. known limitations

- **IA gap** — a route/page does not yet exist: show as a dashed-red `classDef gap` node in the journey `.md` flowchart. Do not create a prototype screen until the story is approved.
- **Known limitation** — a route/page exists but a component behaves incompletely in a given state (e.g. no retry button, no empty-state copy): create the variant screen anyway, tag it ⚠, and add a bullet in `dev-notes.md` "Known limitations" with a proposed fix and a reference to the screen file.

#### `index.html` unhappy-paths section template

```html
<hr>
<h2 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--ba-text)">
  Estados alternativos (unhappy paths)
</h2>
<p>One sentence describing what these screens show.</p>
<ul>
  <li>
    <a href="01b-<variant>.html">Passo 1b — <Scenario description></a>
    <span class="tag tag-green">EXISTS: ComponentName (state)</span>
  </li>
  <li>
    <a href="02c-<variant>.html">Passo 2c — <Scenario description></a>
    <span class="tag tag-red">⚠ <short gap description> — ver dev-notes.md</span>
  </li>
</ul>
```

Also update the "what this prototype validates" checklist in `index.html` to include yes/no questions about the unhappy-path variants — e.g., "Does the empty-availability state need an explanatory message?"

### `dev-notes.md` template

This file is the bridge between prototype and implementation. A future agent reading it must be able to write production React + TypeScript without asking questions.

```markdown
# Dev Notes — <ROLE>: <Journey Title>

## Overview
<2–3 sentences: what exists, what's new, target story>

## File map

| File | Status | Action |
|---|---|---|
| `apps/web/components/booking/Foo.tsx` | ✅ EXISTS | No changes |
| `apps/web/components/booking/Bar.tsx` | ❌ Gap | Create — step 3 |

## Screen N — <Name> (`<ComponentName>`)

**File:** `apps/web/...` (EXISTS | GAP)

**Props:** (list with types)

**BFF call:**
\`\`\`
METHOD /endpoint
  Header: X-Tenant-Slug: {slug}
  Body: { field: type }
  Response: { ... }
\`\`\`

**Validation:**
| Field | Rule | Error message |
|---|---|---|
| contactName | min 1 | "Informe seu nome." |

**States:** idle → submitting → success / error

**Error messages:** (exact pt-BR strings)

**Mobile notes:** (responsive behavior)
```

**Mandatory sections per screen:** file path + status, props, BFF call (if any), validation table (if form), state machine (if submit), error copy.

### index.html checklist

The `index.html` must list every screen with a tag indicating its status:

```html
<span class="tag tag-green">EXISTS: ComponentName</span>   <!-- already built -->
<span class="tag tag-red">GAP: /route — M13-SXX</span>     <!-- needs building -->
```

It must also include a "what this prototype validates" block — 4–6 specific yes/no questions the reviewer should be able to answer after clicking through.

---

## Part 3 — Workflow (end to end)

1. Run `/docs-audit` on the relevant UCs.
2. Write the journey `.md` file — mermaid flow, pages table, gaps.
3. Update `use-cases.md` — set "Journey file" column.
4. Update `README.md` Index table.
5. Create the prototype folder:
   a. **Check shared/ first** — do not create `tokens.css`, `hotsite.html`, or `login.html` in the prototype folder; link to `../../../shared/` instead. Create a local redirect stub for `00-hotsite.html` / `00-login.html` if needed so `index.html` links keep working.
   b. Numbered step files — in flow order; each references `../../../shared/tokens.css`
   c. `index.html` — navigation hub
   d. `dev-notes.md` — implementation handoff
6. Open `index.html` in a browser and click through every screen. Fix anything that looks wrong before declaring the prototype done.
7. Hand off: share `index.html` link with the reviewer. Once UX is approved, `dev-notes.md` goes directly to the implementation story.

---

## Part 4 — Common pitfalls (lessons from first dry-run)

These mistakes were made during the guest/customer booking prototype (2026-06-15) and must not be repeated.

### ❌ Wrong folder
Putting a screen in the wrong actor folder. The `00-hotsite.html` for the **customer** journey must live in `customer/prototypes/`, not in `guest/prototypes/`. Always re-read the user's description of the flow before creating files — ask "which actor is this for?" before writing a single file.

### ❌ Missing hotsite entry point
Starting the prototype at the first booking step (`01-service-selection.html`) without a `00-hotsite.html`. The login bar has no context without the page it lives on. Always create `00-hotsite.html` when the journey begins on the public hotsite.

### ❌ Auth bar not clickable on customer screens
The customer auth bar (showing the user's name) was initially a static `<div>`. It must be wrapped in an `<a href="00-login.html">` so the reviewer can navigate back to the login screen in the prototype. Every customer screen's auth bar must be a link.

### ❌ "Revisar pedido" as a `<p>` inside the card
The "Revisar pedido" title was first written as a paragraph inside the `.card` div. It must be a heading element (`<h2>` or `<h3>`) **outside and above** the card — matching the same typographic weight as other step headings (`font-size: 1.5rem; font-weight: 700`).

### ❌ Summary card missing on guest step 3
The read-only "Revisar pedido" summary card (service + date/time) was initially added only to the customer's step 3. It belongs on the guest's step 3 as well — any step where the user fills in their data or confirms should show what they selected in previous steps.

### ❌ `dev-notes.md` omitting open questions
The `dev-notes.md` must flag any endpoint or component that is **assumed to exist but not verified**. Example: `GET /customers/me` — note it explicitly: "verify this endpoint exists in `apps/bff/src/` before implementing." Do not silently assume.

### ❌ Inventing token values
`tokens.css` must use the exact values from `DEFAULT_HOTSITE_BRANDING` in `hotsite-config.aggregate.ts` and the mappings in `apply-branding.ts`. Never invent hex values or pixel sizes.

### ❌ Skipping the index.html dry-run checklist
The `index.html` "what this prototype validates" block is not cosmetic — it forces explicit UX questions before clicking through. Without it, reviewers don't know what they're validating. Always include 4–6 specific yes/no questions.

### ❌ Duplicating shared files across actor folders
Creating a separate `tokens.css`, `hotsite.html`, or `login.html` in each actor's prototype folder means that any copy tweak or token update must be applied N times. Before creating any prototype file, ask: "is this identical — or nearly identical — across all actor flows?" If yes, put it in `plan/journey/shared/` and reference it via `../../../shared/<file>`. Use the redirect pattern for `00-hotsite.html` and `00-login.html` stubs so that `index.html` links keep working.

### ❌ Only prototyping the happy path

Leaving all error/loading/empty/submission states as commented-out HTML blocks inside the numbered step files, with no clickable variant screens. A reviewer who opens `index.html` and clicks through sees only the happy path — they cannot validate how errors or edge cases look without reading HTML source. Worse, gaps in component behaviour (no retry button, no empty-state copy) stay invisible to product stakeholders until a developer hits them in production.

**Fix:** Apply the "Unhappy path variant screens (mandatory)" checklist above before declaring any prototype done. For each step: does it fetch? does it validate? does it submit? can data be empty? is any state stuck/incomplete? Create a variant screen for each "yes", tag it in `index.html`, and document it in `dev-notes.md`. Even when fixing the underlying behaviour is deferred, always visualise the gap state — making it tangible is what turns a known issue into a tracked decision.

### ❌ Writing the prototype before the journey `.md` file

Creating HTML prototype files before `<actor>/<slug>.md` exists. The journey `.md` is the specification — it defines navigation scope, maps IA gaps, and documents open questions. Without it, the prototype may answer the wrong questions or miss gaps entirely.

**Fix:** Always complete Part 3 steps 1–4 first (run `/docs-audit`, write `<actor>/<slug>.md`, update `use-cases.md` journey column, update README index). Only then create any file under `<actor>/prototypes/<slug>/`.

### ❌ Using `.topbar-avatar` for dashboard avatars (hidden on desktop)

`tokens.css` hides `.topbar-avatar` at `≥1024px` because the sidebar footer takes over identity display on desktop. Using `.topbar-avatar` for the clickable avatar element in dashboard prototype screens causes it to disappear on desktop.

**Fix:** Use `.auth-avatar` for all avatar elements in dashboard prototype screens (topbar and sidebar footer). If the user's display name should appear next to the avatar in the topbar on desktop, add an explicit override: `@media (min-width: 1024px) { .topbar-user-name { display: inline !important; } }`.

### ❌ `.topbar-brand` hidden on desktop in non-sidebar layouts

`tokens.css` hides `.topbar-brand` at `≥1024px` because the sidebar replaces it. Customer dashboards (no sidebar, brand remains in topbar) need an explicit override.

**Fix:** Any prototype layout that shows a topbar brand on desktop without a sidebar must include: `@media (min-width: 1024px) { .topbar-brand { display: flex !important; } }`.

### ❌ Bottom nav visible on drill-down detail pages

The bottom nav is navigation for top-level tabs. Drill-down pages (booking detail, etc.) are reached via a card tap; the only exit is the topbar back arrow. Showing the bottom nav on these pages creates a competing, confusing navigation layer.

**Fix:** Add `.bottom-nav { display: none !important; }` to the `<style>` block of every detail/drill-down page.

### ❌ Full-width action buttons on desktop (form and confirmation pages)

Using `display: flex` with `flex: 1` on save/cancel buttons inside a wide dashboard content area causes them to stretch across the full column on desktop — visually broken and inconsistent with every other dashboard detail page.

**Fix:** Apply the `detail-layout` / `detail-aside` two-column grid pattern to ALL form pages, confirmation pages, and focused-action pages (slot-conflict, error states, etc.):

```html
<!-- In <style>: -->
.detail-layout { display: block; }
.detail-aside  { display: none; }
@media (min-width: 1024px) {
  .detail-layout { display: grid; grid-template-columns: 1fr 22rem; gap: 1.5rem; align-items: start; }
  .detail-aside  { display: block; position: sticky; top: 1.5rem; }
  .form-actions  { display: none !important; } /* hide mobile-only button row */
}

<!-- In <body>: -->
<div class="dashboard-body">
  <div class="detail-layout">
    <div>
      <!-- form fields / content -->
      <div class="form-actions"> <!-- mobile only, hidden on desktop -->
        <a class="btn-secondary">Cancelar</a>
        <a class="btn-primary">Salvar</a>
      </div>
    </div>
    <div class="detail-aside">
      <div class="card" style="padding:1.25rem;">
        <a class="btn-primary" style="display:block;...">Salvar</a>
        <a class="btn-secondary" style="display:block;...">Cancelar</a>
        <!-- optional: context note, status chip, danger link -->
      </div>
    </div>
  </div>
</div>
```

This pattern applies to: service create/edit, confirmation pages (cancel, deactivate), focused error states (slot conflict), settings forms, invite forms, and any other page where the primary content is a form or a single focused decision.

### ❌ Narrow `max-width` on `dashboard-body` instead of `detail-layout`

Using `<div class="dashboard-body" style="max-width: 36rem;">` to constrain narrow content (error messages, focused choices) leaves a large empty void on the right half of the screen on desktop — not a consistent dashboard feel.

**Fix:** Always use `detail-layout` instead. The left column naturally constrains the content width; the right aside provides context or a back action. Even when there is no meaningful aside, a minimal card with a "← Voltar" link is better than empty white space.

### ❌ Bottom sheet triggered on desktop without the shared modal override

Writing per-file CSS to convert a `.bottom-sheet` to a centered modal on desktop. This was needed once (before June 2026) but has since been added to `shared/tokens.css` globally: on `≥1024px`, all `.bottom-sheet` elements automatically reposition to a centered scale+fade modal (`top: 50%; left: 50%; transform: translate(-50%, -50%)`).

**Fix:** Do NOT add per-file `@media (min-width: 1024px) { .bottom-sheet { ... } }` overrides. The shared CSS already handles this. Only override per-file if a specific sheet needs different dimensions.

### ❌ Fixed action bar overlapping the bottom nav on mobile

Using `position: sticky; bottom: 0` on `.form-actions` in a page that also has a bottom nav causes the save button to be hidden behind (or overlap) the fixed nav — the two compete for the same bottom space.

**Fix:** On pages with BOTH a bottom nav and a primary action button (settings forms, invite forms, editor pages), use `position: fixed; bottom: 3.75rem` on `.form-actions` so it floats above the nav. Set `padding-bottom: 9rem` on `<main class="main-content">` to clear both the nav (~3.75rem) and the action bar (~4.5rem). On desktop, hide `.form-actions` via the `detail-layout` / `detail-aside` pattern.

```css
/* Mobile: action bar floats above bottom nav */
.form-actions {
  position: fixed; bottom: 3.75rem; left: 0; right: 0; z-index: 20;
  background: white; border-top: 1px solid var(--ba-secondary);
  padding: 0.75rem 1rem; box-shadow: 0 -2px 8px rgba(0,0,0,.06);
  display: flex; gap: 0.75rem;
}
/* Desktop: hidden — detail-aside handles it */
@media (min-width: 1024px) {
  .form-actions { display: none !important; }
}
```

And on `<main class="main-content">`:
```html
<main class="main-content" style="padding-bottom:9rem;">
```

Pages with a bottom nav but NO fixed action bar (list pages, read-only detail pages, success states) only need `padding-bottom: 5.5rem`.

### ❌ Using floating toasts for success states

Creating a floating `.toast` element with `position: fixed; top: 1rem` as a success notification. Toasts at `top: 1rem` overlap the prototype banner on prototype pages and are impossible to see. More importantly, the rest of the system uses **inline banners** — not floating elements — for success states.

**Fix:** Always use the inline green banner pattern, consistent with booking detail pages throughout the system:

```html
<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:var(--ba-radius);
            padding:1.125rem 1.25rem;margin-bottom:1.5rem;
            display:flex;align-items:flex-start;gap:0.875rem;">
  <div style="width:2rem;height:2rem;border-radius:9999px;background:#16a34a;
              display:flex;align-items:center;justify-content:center;flex-shrink:0;">
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white"
         stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  </div>
  <div>
    <p style="font-weight:700;font-size:0.9375rem;color:#15803d;margin-bottom:0.125rem;">
      Operação concluída!
    </p>
    <p style="font-size:0.875rem;color:#166534;opacity:0.85;line-height:1.5;">
      Descrição do que foi salvo/publicado/concluído.
    </p>
  </div>
</div>
```

This banner is in the page flow — always visible, no positioning conflicts, no timer needed. It can remain permanently on the prototype page for reviewers to see.

### ❌ Validation error variant pages showing only the errored section

Creating a validation error variant (e.g. `01b-validation-error.html`) that shows only the section containing the invalid field, omitting all the other form sections. This misleads the reviewer into thinking the rest of the form disappeared on error.

**Fix:** The validation error page must show the **complete form** — all sections, all fields — exactly as it appears in the normal state. Only the invalid field(s) are highlighted (red border + field error message below). All other data entered by the user is preserved and visible. In production, the server returns 422 and the same form page re-renders with error annotations; the reviewer must be able to see this correctly.

### ❌ Dashboard nav items linking to `#` or self-looping instead of the real cross-journey path

Sidebar, bottom-nav, and bottom-sheet items that point to another journey (e.g. "Fidelidade" from inside `servicos/`, or "Equipe"/"Configurações"/"Hotsite" from inside any staff page) were found pointing at `href="#"` or self-looping back to the current page's own file, instead of the real destination — **218 separate occurrences** across `staff/` and `manager/` in one audit pass (2026-06-17). This happens easily because every dashboard page copies its sidebar/bottom-nav markup from an earlier page rather than generating it, so a placeholder link or a self-referencing copy from the "home" page's own nav item silently propagates into every page copied from it afterward.

**Fix:** Every nav item representing a journey OTHER than the current one must link to that journey's real canonical entry-point file (e.g. Agenda → `staff/prototypes/agenda/00-agenda.html`, Equipe → `manager/prototypes/equipe/01-team-list.html`), using the standard relative-path convention (`../<journey>/<file>.html` within the same actor, `../../../<other-actor>/prototypes/<journey>/<file>.html` across actors). Before declaring a prototype done, grep the folder for `href="#"` on `sidebar-nav-item`/`bottom-nav-item`/`bottom-sheet-item` classes, and for any nav item whose href resolves to the current file under a different journey's label — both are bugs.

---

## Relationship to other docs

- `docs/04-USE_CASES.md` — source of UCs (link UC numbers, don't restate UC text)
- `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` — canonical page/folder structure; update if a journey reveals a new page
- `plan/M13-DASHBOARD-FRONTEND.md` — stories implementing these pages; update AC or add stories per gap
- `apps/backend/src/contexts/platform/domain/hotsite-config.aggregate.ts` — source of truth for token default values
- `apps/web/lib/hotsite/apply-branding.ts` — token derivation logic (button tokens, hero text contrast)

---

## Index

| Journey | Folder | Prototype | Status |
|---|---|---|---|
| GUEST — Book a Service | `guest/book-a-service.md` | `guest/prototypes/book-a-service/` | Reviewed |
| GUEST — Responder à Solicitação de Informação | `guest/submit-info.md` | `guest/prototypes/submit-info/` | Reviewed |
| CUSTOMER — Book a Service | `customer/book-a-service.md` | `customer/prototypes/book-a-service/` | Reviewed |
| CUSTOMER — Login & Tenant Selection | `customer/login.md` | `customer/prototypes/login/` | Reviewed |
| STAFF — Login & First Access | `staff/login.md` | `staff/prototypes/login/` | Reviewed |
| STAFF — Agenda (Booking Queue & Lifecycle Management) | `staff/agenda.md` | `staff/prototypes/agenda/` | Reviewed |
| STAFF — Horários (Schedule & Closure Management) | `staff/horarios.md` | `staff/prototypes/horarios/` | Reviewed |
| CUSTOMER — Minha Conta (Bookings + Loyalty) | `customer/minha-conta.md` | `customer/prototypes/minha-conta/` | Reviewed |
| STAFF — Serviços (Service Catalog) | `staff/servicos.md` | `staff/prototypes/servicos/` | Reviewed |
| STAFF — Fidelidade (Customer Loyalty Lookup) | `staff/fidelidade.md` | `staff/prototypes/fidelidade/` | Reviewed |
| MANAGER — Equipe (Team Management) | `manager/equipe.md` | `manager/prototypes/equipe/` | Reviewed |
| MANAGER — Configurações (Tenant Settings) | `manager/configuracoes.md` | `manager/prototypes/configuracoes/` | Reviewed |
| MANAGER — Hotsite (Branding & Content) | `manager/hotsite.md` | `manager/prototypes/hotsite/` | Reviewed |

---

## Permission protocol

These are planning docs — CLAUDE.md §0 applies. Discuss changes before writing/editing any file in `plan/journey/`.
