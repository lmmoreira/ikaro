# M12 — Hotsite Public Frontend

**Phase:** Local Development  
**Goal:** Every tenant has a public-facing website at `http://localhost:3000/[slug]` with their branding, a list of services, and a complete booking form flow. The frontend is driven by a server-side manifest so layout changes don't require code deployments.  
**Depends on:** M07-S04 (guest booking endpoint), M05-S05 (public services list), M06-S04 (availability endpoint), M02 (hotsite manifest API)  
**Blocks:** M13 (dashboard includes hotsite manager), M16 (E2E tests include hotsite flow)

---

## Stories

---

### M12-S01 — HotsiteConfig domain update + manifest API

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `docs/14-API_CONTRACTS.md` § tenants/slug endpoint

**Description:**  
Implement the hotsite manifest API that powers the frontend rendering engine. The manifest bundles branding and layout configuration into a single JSON response. Also complete the `HotsiteConfig` domain layer fully (M02-S01 created a stub) with the module types from the architecture doc.

**Module types (from `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`):**
`HERO | SERVICE_LIST | GALLERY | TESTIMONIALS | BOOKING_CTA | ABOUT | CONTACT`

Each module has `type` + `data` object specific to the type. Example:
```json
{ "type": "HERO", "data": { "title": "Bem-vindo à Lavacar", "subtitle": "...", "backgroundImageUrl": "..." } }
```

**BFF endpoint:** `GET /v1/tenants/slug/:slug`
- **Public** — no auth required
- Returns full manifest:
```json
{
  "tenant": { "id": "uuid", "name": "Lavacar BeloAuto", "slug": "lavacar-beloauto" },
  "branding": { "primaryColor": "#2563eb", "logoUrl": "https://...", "bannerImageUrl": "..." },
  "layout": [
    { "type": "HERO", "data": { ... } },
    { "type": "SERVICE_LIST", "data": { "showPrices": true } }
  ],
  "isPublished": true
}
```
- If tenant not found → `404`
- If hotsite not published → `404` (public cannot see unpublished hotsites)

**Acceptance criteria:**
- [ ] `GET /v1/tenants/slug/lavacar-beloauto` returns full manifest JSON
- [ ] Unpublished hotsite returns `404`
- [ ] Non-existent slug returns `404`
- [ ] Response is cacheable: `Cache-Control: public, max-age=300` header set
- [ ] BFF adds `Cache-Control` header — Next.js ISR will respect it

**Dependencies:** M02-S03, M03-S05

---

### M12-S02 — UC-027: Admin manages hotsite

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/04-USE_CASES.md` § UC-027, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`

**Description:**  
Implement the admin endpoint for updating hotsite content (branding + layout modules) and toggling publish status.

**Backend use cases:**
- `UpdateHotsiteContentUseCase` — loads `HotsiteConfig` by `tenantId`, calls `config.updateContent(branding, layout)`, persists
- `PublishHotsiteUseCase` — calls `config.publish()`, persists
- `UnpublishHotsiteUseCase` — calls `config.unpublish()`, persists

**BFF endpoints:**
- `PATCH /v1/tenants/hotsite` — requires JWT + `MANAGER` role; body: `{ branding?, layout? }`; returns `200`
- `POST /v1/tenants/hotsite/publish` — requires JWT + `MANAGER` role; returns `200 { isPublished: true }`
- `POST /v1/tenants/hotsite/unpublish` — requires JWT + `MANAGER` role; returns `200 { isPublished: false }`
- `GET /v1/tenants/hotsite` — requires JWT + `MANAGER` role; returns full hotsite config including unpublished state

**Acceptance criteria:**
- [ ] PATCH updates branding and/or layout; unspecified fields unchanged
- [ ] `primaryColor` with invalid hex (e.g., `"notacolor"`) returns `400`
- [ ] Layout with unknown module type (e.g., `"UNKNOWN_MODULE"`) returns `400`
- [ ] Publishing a hotsite with empty layout returns `422` (must have at least 1 module)
- [ ] After publish → `GET /v1/tenants/slug/:slug` returns the manifest
- [ ] After unpublish → `GET /v1/tenants/slug/:slug` returns `404`
- [ ] Only `MANAGER` role can publish — `STAFF` returns `403`

**Dependencies:** M12-S01, M03-S05

---

### M12-S03 — Next.js [slug] routing + manifest fetching + CSS branding

**Agent:** `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § routing + manifest caching + CSS variables

**Description:**  
Implement the Next.js App Router foundation for the hotsite: the `[slug]/layout.tsx` fetches the manifest (with ISR 5-minute revalidation), applies the tenant's branding via CSS custom properties, and provides the manifest to all child pages via React context.

**What to create/update in `apps/web/app/[slug]/`:**
- `layout.tsx`:
  - Server component — fetches `GET /v1/tenants/slug/[slug]` at render time
  - `next/cache` `revalidate: 300` (5-minute ISR)
  - `notFound()` if manifest returns 404
  - Injects CSS variables from `branding` via `<style>` tag: `--primary-color`, `--logo-url`
  - Passes manifest to `ManifestProvider` context
- `page.tsx`:
  - Reads manifest from context
  - Renders the `layout[]` array: maps each module type to its React component
- `ManifestContext.tsx` — React context providing manifest to all hotsite components

**Acceptance criteria:**
- [ ] `GET /lavacar-beloauto` renders the hotsite with tenant branding applied
- [ ] `--primary-color` CSS variable is set to the tenant's `branding.primaryColor`
- [ ] `GET /nonexistent-slug` returns Next.js 404 page
- [ ] Second request within 5 minutes is served from Next.js cache (no BFF call)
- [ ] Cache revalidates after 5 minutes (ISR behavior verified with mock)
- [ ] TypeScript compiles with zero errors

**Dependencies:** M12-S01, M00-S05

---

### M12-S04 — HERO module component

**Agent:** `frontend-ts`  
**Complexity:** S  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § HERO module

**Description:**  
Implement the HERO hotsite module. A full-width section with background image, headline, subtitle, and a call-to-action button that scrolls to the booking form.

**Component:** `apps/web/components/hotsite/HeroModule.tsx`
- Props: `{ title: string, subtitle?: string, backgroundImageUrl?: string, ctaLabel?: string }`
- Renders: full-width section, `<h1>` title, `<p>` subtitle, primary CTA button using `var(--primary-color)`
- CTA scrolls to `#booking-form` anchor on the page
- Responsive: mobile-first (full-height on mobile, 60vh on desktop)
- Uses shadcn/ui `Button` component

**Acceptance criteria:**
- [ ] HERO renders in `GET /[slug]` when `layout` includes `{ "type": "HERO", "data": {...} }`
- [ ] Primary color button uses `var(--primary-color)` (not hardcoded)
- [ ] If `backgroundImageUrl` is null, renders with a solid `var(--primary-color)` background
- [ ] CTA button clicks scroll to `#booking-form` (smooth scroll)
- [ ] Vitest component test: renders title, subtitle, and CTA button correctly

**Dependencies:** M12-S03

---

### M12-S05 — SERVICE_LIST module component

**Agent:** `frontend-ts`  
**Complexity:** S  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § SERVICE_LIST module

**Description:**  
Implement the SERVICE_LIST hotsite module. Fetches active services from `GET /v1/services` (with `X-Tenant-Slug` header) and renders them as cards with name, description, price, and duration.

**Component:** `apps/web/components/hotsite/ServiceListModule.tsx`
- Props: `{ showPrices: boolean, showDuration?: boolean }`
- Fetches services via `GET /v1/services` server-side (with tenant slug from manifest context)
- Renders a responsive grid of `ServiceCard` components
- Price displayed as `R$ 150,00` (pt-BR format)
- Duration displayed as `"60 min"` or `"1h 30min"`

**Acceptance criteria:**
- [ ] Services are rendered from the live API (not hardcoded)
- [ ] `showPrices: false` hides price badges
- [ ] Price format is `R$ 150,00` (comma decimal separator)
- [ ] If no services exist yet, renders: `"Nenhum serviço disponível no momento"`
- [ ] Responsive grid: 1 column mobile, 2 columns tablet, 3 columns desktop

**Dependencies:** M12-S03, M05-S05

---

### M12-S06 — GALLERY, TESTIMONIALS, ABOUT, CONTACT modules

**Agent:** `frontend-ts`  
**Complexity:** S  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § module types

**Description:**  
Implement the 4 remaining static hotsite modules. These are simpler presentation components that render data from the manifest `data` object — no API calls.

**Components to create:**
- `GalleryModule.tsx` — image grid; props: `{ images: [{url, alt}][], columns?: number }`; lazy-loads images; if empty, hides section entirely
- `TestimonialsModule.tsx` — customer quotes carousel; props: `{ items: [{name, quote, rating}][] }`; uses shadcn/ui `Card`
- `AboutModule.tsx` — about section; props: `{ title, body, imageUrl? }`; renders Markdown-safe HTML
- `ContactModule.tsx` — contact info; props: `{ phone?, whatsapp?, address?, email?, mapEmbedUrl? }`

**Acceptance criteria:**
- [ ] All 4 components render correctly when their module type is present in the manifest layout
- [ ] A module type not in the layout array is simply not rendered (no errors)
- [ ] `GalleryModule` with empty `images[]` renders nothing (not an empty grid)
- [ ] `TestimonialsModule` with 1+ items renders at minimum one quote card
- [ ] All text in example content must be pt-BR

**Dependencies:** M12-S03

---

### M12-S07 — BOOKING_FORM module: service selection + slot picker

**Agent:** `frontend-ts`  
**Complexity:** L  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § BOOKING_FORM module, `docs/04-USE_CASES.md` § UC-001, UC-011

**Description:**  
Implement the booking form module — the most interactive part of the hotsite. The form is a multi-step flow: (1) select services, (2) pick date/slot, (3) fill personal info, (4) submit. This calls UC-001 (guest booking) and UC-011 (availability).

**Step 1 — Service Selection:**
- Renders service cards with a checkbox/toggle to select them
- Shows running total: `"2 serviços — R$ 300,00 — 2h"`
- "Próximo" button disabled until ≥1 service selected

**Step 2 — Date & Slot Picker:**
- Calendar component (date picker) for selecting a date
- On date select → calls `GET /v1/schedule/availability?date=&serviceIds=` → shows available slots as buttons
- Loading state while fetching availability
- "Nenhum horário disponível" if no slots returned

**Step 3 — Personal Info:**
- Fields: name, email, phone, address (if any service `requiresPickupAddress`)
- All labels in pt-BR
- Client-side validation before submit

**Step 4 — Submit & Confirmation:**
- Calls `POST /v1/bookings` with guest data
- On `201` → shows success screen: "Solicitação enviada! Aguarde a confirmação por email."
- On `409` (slot taken) → returns to Step 2 with "Horário indisponível, escolha outro"
- On error → shows generic pt-BR error message

**Acceptance criteria:**
- [ ] Full 4-step flow works end-to-end against local backend
- [ ] Slot picker shows real availability from the API (not mocked)
- [ ] Selecting a slot that becomes taken between view and submit shows `409` error and returns to Step 2
- [ ] Form fields validated before submission (email format, phone format)
- [ ] Address fields only shown when a selected service has `requiresPickupAddress=true`
- [ ] All labels, placeholders, error messages in pt-BR
- [ ] Component test: mock API responses and assert step transitions

**Dependencies:** M12-S03, M07-S04, M06-S04

---

### M12-S08 — Hotsite 404 and unpublished states

**Agent:** `frontend-ts`  
**Complexity:** S  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`

**Description:**  
Implement the hotsite edge cases: a 404 page for unknown slugs and a clean "coming soon" page for unpublished hotsites. These should be branded to BeloAuto (not tenant-branded, since we have no manifest).

**What to create:**
- `apps/web/app/[slug]/not-found.tsx` — BeloAuto-branded 404 page: "Lavacar não encontrada" + link to `beloauto.com`
- `apps/web/app/[slug]/unavailable.tsx` — "Em breve" page shown when hotsite exists but is unpublished (admin preview mode in M13)

**Acceptance criteria:**
- [ ] `GET /unknown-slug` renders the 404 page
- [ ] 404 page has a human-readable pt-BR message
- [ ] Meta tags: `<title>Não encontrado — BeloAuto</title>`
- [ ] No JavaScript errors on 404 page

**Dependencies:** M12-S03

---

### M12-S09 — Hotsite SEO: meta tags, Open Graph, structured data

**Agent:** `frontend-ts`  
**Complexity:** S  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § manifest schema

**Description:**  
Implement per-tenant SEO metadata on the hotsite. Brazilian car-wash businesses depend on Google search and WhatsApp link previews to attract customers. Without this story, every tenant's hotsite shows the same generic `<title>BeloAuto</title>` in search results and WhatsApp previews — a missed business opportunity for every tenant on the platform.

**What to add to `apps/web/app/[slug]/layout.tsx`:**

```typescript
export async function generateMetadata({ params }): Promise<Metadata> {
  const manifest = await fetchManifest(params.slug);
  if (!manifest) return { title: 'Não encontrado — BeloAuto' };

  return {
    title: `${manifest.tenant.name} — Agendamento Online`,
    description: `Agende seu serviço de lavagem na ${manifest.tenant.name}. Rápido, fácil e online.`,
    openGraph: {
      title: `${manifest.tenant.name} — Agendamento Online`,
      description: `Agende agora na ${manifest.tenant.name}`,
      url: `https://beloauto.com/${params.slug}`,
      siteName: 'BeloAuto',
      images: manifest.branding.bannerImageUrl
        ? [{ url: manifest.branding.bannerImageUrl, width: 1200, height: 630 }]
        : [],
      locale: 'pt_BR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${manifest.tenant.name} — Agendamento Online`,
      images: manifest.branding.bannerImageUrl ? [manifest.branding.bannerImageUrl] : [],
    },
    robots: manifest.isPublished
      ? { index: true, follow: true }
      : { index: false, follow: false },
    alternates: { canonical: `https://beloauto.com/${params.slug}` },
  };
}
```

**Also add JSON-LD structured data** (LocalBusiness schema) as a `<script>` tag in `page.tsx`:
```json
{
  "@context": "https://schema.org",
  "@type": "AutoWash",
  "name": "[tenant.name]",
  "url": "https://beloauto.com/[slug]"
}
```

**Acceptance criteria:**
- [ ] `<title>` tag is `"[Tenant Name] — Agendamento Online"` — not the generic "BeloAuto"
- [ ] `og:image` uses `manifest.branding.bannerImageUrl` when available
- [ ] `og:locale` is `pt_BR`
- [ ] JSON-LD `<script type="application/ld+json">` is present in `<head>`
- [ ] Unpublished hotsites have `<meta name="robots" content="noindex, nofollow">`
- [ ] `generateMetadata` reuses the same ISR-cached manifest fetch — no extra network call
- [ ] `canonical` URL is set to `https://beloauto.com/[slug]`
- [ ] Pasting `https://beloauto.com/lavacar-beloauto` into WhatsApp shows the tenant name and banner image in the preview

**Dependencies:** M12-S03
