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

0. **Validate source docs**: run `/uc-audit` scoped to the relevant UCs. Resolve findings before proceeding — journeys built on stale UC text cause rework.
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
| `tokens.css` | ✅ | `--ba-*` CSS custom properties at their default values |
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
| `shared/hotsite.html` | Fake public hotsite — used as the entry point for both guest and customer flows |
| `shared/login.html` | Google OAuth login screen — referenced by both guest ("Entrar" bar) and customer (auth bar link) |

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

### Login bar pattern (mandatory on every screen)

Every prototype screen must show the auth bar at the top. The bar's visual identity is always identical — only the content changes based on auth state.

**Unauthenticated (GUEST screens):**
```html
<div style="background: var(--ba-secondary); padding: 0.5rem 1.5rem;
            display: flex; align-items: center; justify-content: flex-end;">
  <a href="../../../shared/login.html" style="display: flex; align-items: center; gap: 0.375rem;
     font-size: 0.875rem; font-weight: 500; color: var(--ba-primary); text-decoration: none;">
    <!-- person SVG icon -->
    Entrar
  </a>
</div>
```

**Authenticated (CUSTOMER screens) — clickable → login page:**
```html
<div class="auth-bar">
  <a href="../../../shared/login.html" style="display: flex; align-items: center; gap: 0.5rem;
     text-decoration: none; color: var(--ba-text);">
    <div class="auth-avatar">JS</div>
    <span>João Silva</span>
  </a>
</div>
```

**Rules:**
- The bar is **always present** on every booking step (not just step 1).
- The auth bar on customer screens **must be a link** so the reviewer can navigate back to the login screen.
- Both guest and customer screens link to **`../../../shared/login.html`** — the single shared login page.

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

1. Run `/uc-audit` on the relevant UCs.
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
| CUSTOMER — Book a Service | `customer/book-a-service.md` | `customer/prototypes/book-a-service/` | Draft |

---

## Permission protocol

These are planning docs — CLAUDE.md §0 applies. Discuss changes before writing/editing any file in `plan/journey/`.
