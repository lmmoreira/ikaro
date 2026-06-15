# M12 — Hotsite Public Frontend

**Phase:** Local Development  
**Goal:** Every tenant has a public-facing website at `http://localhost:3000/[slug]` with their branding, a list of services, and a complete booking form flow. The frontend is driven by a server-side manifest so layout changes don't require code deployments.  
**Depends on:** M07-S04 (guest booking endpoint), M05-S05 (public services list), M06-S04 (availability endpoint), M02 (hotsite manifest API), M115-S01 (GCS signed-URL upload — required for admin image uploads in M12-S02)  
**Blocks:** M13 (dashboard includes hotsite manager), M16 (E2E tests include hotsite flow)

---

## Stories

---

### M12-S01 — HotsiteConfig domain update + manifest API ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`, `docs/14-API_CONTRACTS.md` § tenants/slug endpoint

**Description:**  
Implement the hotsite manifest API that powers the frontend rendering engine. The manifest bundles the full branding token set and ordered layout configuration into a single JSON response. Also complete the `HotsiteConfig` domain layer fully (M02-S01 created a stub) with the module types and branding tokens from the architecture doc.

**Module types (from `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`):**
`HERO | SERVICE_LIST | GALLERY | TESTIMONIALS | BOOKING_CTA | ABOUT | CONTACT`

Each module has `type`, `enabled` flag, and a `data` object specific to the type. The `enabled` flag allows hiding a module without removing it from the layout array.

**Full branding token set (from `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §2):**

```typescript
interface HotsiteBranding {
  // Direct values
  primaryColor: string;       // hex
  secondaryColor: string;     // hex
  backgroundColor: string;    // hex, default #ffffff
  textColor: string;          // hex, default #111827
  headingFontFamily: string;  // e.g. "Playfair Display, serif"
  bodyFontFamily: string;     // e.g. "Inter, sans-serif"
  logoUrl: string;            // GCS URL

  // Semantic choices
  borderRadius: 'sharp' | 'rounded' | 'pill';
  buttonStyle:  'filled' | 'outline' | 'ghost';
  spacing:      'compact' | 'comfortable' | 'spacious';
  shadowStyle:  'none' | 'subtle' | 'strong';
}
```

**Backend endpoint (new — Platform context):**
- `GET /hotsite` — reached via BFF `getForPublic` (like `services`/`schedule`); resolves `tenantId` from `TenantContext` (populated from `X-Tenant-ID` set by the BFF)
- Returns `{ branding: HotsiteBranding, layout: HotsiteModule[], isPublished: boolean }`
- Throws `HotsiteNotPublishedError` when `isPublished === false` → mapped to `404` (kept separate from M12-S02's admin `GET /v1/tenants/hotsite`, which always returns full state regardless of publish status)
- Throws `HotsiteNotFoundError` if no `hotsite_configs` row exists for the tenant → `404`

**BFF orchestration (`GET /v1/tenants/slug/:slug`):**
1. `GET /internal/tenants/by-slug/:slug` → `{ id, name, slug }` (404 if tenant not found)
2. `getForPublic('/hotsite', tenant.id)` → `{ branding, layout, isPublished }` (404 if not published)
3. Composes `{ tenant, branding, layout, isPublished }`, sets `Cache-Control: public, max-age=300`

**Default branding (set by `HotsiteConfig.create()` on tenant provisioning):**
```typescript
{
  primaryColor: '#2563eb',
  secondaryColor: '#eff6ff',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  headingFontFamily: 'Inter, sans-serif',
  bodyFontFamily: 'Inter, sans-serif',
  logoUrl: '',
  borderRadius: 'rounded',
  buttonStyle: 'filled',
  spacing: 'comfortable',
  shadowStyle: 'subtle',
}
```

**BFF endpoint:** `GET /v1/tenants/slug/:slug`
- **Public** — no auth required
- Returns full manifest:
```json
{
  "tenant": { "id": "uuid", "name": "Lavacar BeloAuto", "slug": "lavacar-beloauto" },
  "branding": {
    "primaryColor": "#f97316",
    "secondaryColor": "#fff7ed",
    "backgroundColor": "#ffffff",
    "textColor": "#111827",
    "headingFontFamily": "Inter, sans-serif",
    "bodyFontFamily": "Inter, sans-serif",
    "logoUrl": "https://storage.../logo.png",
    "borderRadius": "rounded",
    "buttonStyle": "filled",
    "spacing": "comfortable",
    "shadowStyle": "subtle"
  },
  "layout": [
    { "type": "HERO", "enabled": true, "data": { "variant": "centered", "title": "Bem-vindo à Lavacar", "ctaLabel": "Agendar agora", "ctaTarget": "booking" } },
    { "type": "SERVICE_LIST", "enabled": true, "data": { "showPrices": true, "showPoints": true, "layout": "grid" } },
    { "type": "GALLERY", "enabled": false, "data": { "images": [], "layout": "grid", "maxVisible": 6 } }
  ],
  "isPublished": true
}
```
- If tenant not found → `404`
- If hotsite not published → `404` (public cannot see unpublished hotsites)

**Acceptance criteria:**
- [ ] `GET /v1/tenants/slug/lavacar-beloauto` returns full manifest JSON with all 10 branding tokens
- [ ] Each layout item includes `type`, `enabled`, and `data`
- [ ] Modules with `enabled: false` are included in the manifest response (the frontend decides to skip them)
- [ ] Unpublished hotsite returns `404`
- [ ] Non-existent slug returns `404`
- [ ] Response is cacheable: `Cache-Control: public, max-age=300` header set
- [ ] BFF adds `Cache-Control` header — Next.js ISR will respect it
- [ ] Tenant isolation: `GET /v1/tenants/slug/slug-b` does not return tenant A's hotsite data

**Dependencies:** M02-S03, M03-S05

---

### M12-S02 — UC-027: Admin manages hotsite ✅ Done

**Agent:** `backend-ts` + `bff-ts` — spans both the `platform` context (hotsite content/publish/upload) and the `booking` context (photo-existence retrofit, see cross-cutting addition below)  
**Complexity:** L  
**Docs to load:** `docs/04-USE_CASES.md` § UC-027, `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md`

**Description:**  
Implement the admin endpoint for updating hotsite content (full branding token set + layout modules) and toggling publish status, plus the signed-URL flow that lets admins upload hotsite images (logo, hero/CTA backgrounds, gallery, about photos). The backend stores and returns GCS **paths** only — `filePath`, never signed URLs — fresh read-signed URLs are generated at display time. M115-S01 built the `IStorageService`/`GcsSignedUrlAdapter` and a booking-specific signed-URL endpoint; M12-S02 reuses that same port/adapter behind a hotsite-specific endpoint and path convention (M115-S01's note explicitly defers "the BFF endpoint for [hotsite uploads]" to "a separate story in M12" — this is that story).

**Backend use cases:**
- `UpdateHotsiteContentUseCase` — loads `HotsiteConfig` by `tenantId`, calls `config.updateContent(branding, layout)`, persists
- `PublishHotsiteUseCase` — calls `config.publish()`, persists
- `UnpublishHotsiteUseCase` — calls `config.unpublish()`, persists
- `GenerateHotsiteImageSignedUrlUseCase` — generates a GCS signed upload URL for hotsite images via `IStorageService` (same adapter as M115-S01, no new storage code); returns `{ signedUrl, filePath, expiresAt }`. `filePath = tenants/<tenantId>/hotsite/<purpose>/<uuid>/<fileName>`, where `purpose` is one of `branding | hero | gallery | about | booking-cta` — keeps uploaded assets organized by what they're for, mirroring how booking attachments are grouped by `bookingId`

**BFF endpoints:**
- `PATCH /v1/tenants/hotsite` — requires JWT + `MANAGER` role; body: `{ branding?, layout? }`; returns `200`
- `POST /v1/tenants/hotsite/publish` — requires JWT + `MANAGER` role; returns `200 { isPublished: true }`
- `POST /v1/tenants/hotsite/unpublish` — requires JWT + `MANAGER` role; returns `200 { isPublished: false }`
- `GET /v1/tenants/hotsite` — requires JWT + `MANAGER` role; returns full hotsite config including unpublished state
- `POST /v1/tenants/hotsite/images/signed-url` — requires JWT + `MANAGER` role; body: `{ fileName, contentType, purpose }`; returns `201 { signedUrl, filePath, expiresAt }`

**Branding validation rules:**
- `primaryColor`, `secondaryColor`, `backgroundColor`, `textColor` — valid hex strings (`#rrggbb`)
- `borderRadius` — one of `sharp | rounded | pill`
- `buttonStyle` — one of `filled | outline | ghost`
- `spacing` — one of `compact | comfortable | spacious`
- `shadowStyle` — one of `none | subtle | strong`
- `logoUrl`, image URLs in module `data` — must be valid GCS paths (`tenants/<uuid>/...`) obtained from the signed-URL endpoint above

**Cross-cutting addition — verify uploaded images exist before persisting (booking + hotsite):**

> **Why:** Pre-signed URLs let the frontend upload directly to GCS, bypassing the backend entirely. Today, nothing confirms that a `filePath`/`photoUrl` the client submits actually corresponds to a file that was uploaded — the backend only validates the *string format* (regex/URL shape — see `complete-booking.dto.ts:13`). A user could close the tab mid-upload, hit a network failure, or (in the worst case) hand-craft a request, and the booking/hotsite would persist a permanently broken image reference. Since images are core to both the booking experience (before/after photos drive trust and dispute resolution) and the hotsite (branding, galleries, hero banners — literally the product's visual identity for each tenant), this deserves a real check rather than trusting client-provided strings.
>
> **What:**
> 1. Extend `IStorageService` (shared port, `storage.service.port.ts`) with `exists(storagePath: string): Promise<boolean>` — `GcsSignedUrlAdapter` implements it via a single GCS metadata lookup (`bucket.file(path).exists()`); `InMemoryStorageService` gets a trackable `existingPaths` set + `markAsUploaded()` helper so specs can simulate both "uploaded" and "missing" scenarios
> 2. **Hotsite** (core to this story): `UpdateHotsiteContentUseCase` calls `exists()` for every non-empty image path in the submitted `branding`/`layout` (`logoUrl`, module `backgroundImageUrl`/`imageUrl`/`avatarUrl`, gallery `images[].url` where `source: 'upload'`) before calling `config.updateContent()`; throws `HotsiteImageNotUploadedError extends PlatformDomainError` → `400 hotsite-image-not-uploaded` if any path doesn't resolve
> 3. **Booking retrofit** (bundled in as the "attachment" part of this story — same gap, same fix, same place, no separate story): `RequestBookingUseCase`, `RequestAuthenticatedBookingUseCase`, `SubmitBookingInfoUseCase`/`SubmitGuestBookingInfoUseCase`, and `CompleteBookingUseCase` each gain the same `exists()` check on every submitted photo path; throws a new `BookingPhotoNotUploadedError extends BookingDomainError` → `400 photo-not-uploaded`
>
> Acceptance criteria for this addition are folded into the list below (the three `image`/`photo`-existence checkboxes).

**Acceptance criteria:**
- [ ] PATCH updates branding and/or layout; unspecified fields unchanged (partial update)
- [ ] All 10 branding tokens accepted and persisted correctly
- [ ] `primaryColor` with invalid hex (e.g., `"notacolor"`) returns `400`
- [ ] `borderRadius` with invalid value returns `400`
- [ ] Layout with unknown module type returns `400`
- [ ] Module `enabled` flag persisted correctly — toggling `enabled: false` does not remove the module from DB
- [ ] Publishing a hotsite with no `enabled: true` modules returns `422`
- [ ] After publish → `GET /v1/tenants/slug/:slug` returns the manifest
- [ ] After unpublish → `GET /v1/tenants/slug/:slug` returns `404`
- [ ] Only `MANAGER` role can publish — `STAFF` returns `403`
- [ ] `POST /v1/tenants/hotsite/images/signed-url` returns `filePath` matching `tenants/<tenantId>/hotsite/<purpose>/<uuid>/<fileName>`
- [ ] `purpose` must be one of `branding | hero | gallery | about | booking-cta` — invalid value returns `400`
- [ ] Only `MANAGER` role can request a hotsite image signed URL — `STAFF` returns `403`
- [ ] Tenant isolation: a `MANAGER` JWT scoped to Tenant A cannot view, update, publish, unpublish, or request image-upload URLs for Tenant B's hotsite — every operation resolves `tenantId` from `TenantContext` (JWT claim, never a path param), so cross-tenant access is structurally impossible; integration test asserts Tenant B's `hotsite_configs` row is unaffected by Tenant A's calls
- [ ] `PATCH /v1/tenants/hotsite` with a `logoUrl`/module image path not present in GCS → `400 hotsite-image-not-uploaded` (cross-cutting addition — `IStorageService.exists()`)
- [ ] `POST /v1/bookings`, `POST /v1/bookings/authenticated`, `PATCH /bookings/:id/submit-info`, and `PATCH /bookings/:id/complete` each → `400 photo-not-uploaded` when a submitted photo path doesn't exist in GCS (cross-cutting addition — same `IStorageService.exists()` check retrofitted into `RequestBookingUseCase`, `RequestAuthenticatedBookingUseCase`, `SubmitBookingInfoUseCase`/`SubmitGuestBookingInfoUseCase`, `CompleteBookingUseCase`)
- [ ] Happy path proven end-to-end for both contexts: upload to the signed URL first (GCS emulator), then submit with the returned `filePath` → succeeds without an existence error

**Dependencies:** M12-S01, M03-S05, M115-S01

---

### M12-S03 — Next.js [slug] routing + manifest fetching + CSS branding ✅ Done

**Agent:** `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § routing + manifest caching + CSS variables

**Description:**  
Implement the Next.js App Router foundation for the hotsite: the `[slug]/layout.tsx` fetches the manifest (with ISR 5-minute revalidation), applies the full branding token set via CSS custom properties using `applyBranding()`, and makes it available to child pages. Also includes the shared types migration and env var additions required before any module story starts.

> **Discovery decisions (2026-06-08):**
> - **No ManifestContext** — `layout.tsx` and `page.tsx` are both server components; React context is client-only. Both independently call `fetchManifest(slug)`; Next.js deduplicates the `fetch()` into a single BFF call per render. CSS variables (`var(--ba-*)`) injected on `<body>` are globally available to all client components — no JS data-passing needed for styling.
> - **ISR unchanged** — `next: { revalidate: 300 }` in `fetchManifest()` is the caching strategy. On-demand revalidation via `/api/revalidate` clears the cache immediately on publish/unpublish.
> - **Font allow-list** — `headingFontFamily`/`bodyFontFamily` resolved via `apps/web/lib/hotsite/font-config.ts` which pre-loads 8 fonts at build time using `next/font/google`. Manifest stores the font key (e.g. `"Playfair Display"`); `applyBranding()` maps it to `var(--font-<key>)`. No runtime CDN link, no LGPD exposure.
> - **Shared types migration** — `packages/types/src/hotsite.ts` created in this branch; `apps/bff/src/tenants/tenants.types.ts` deleted; 5 BFF files updated to import from `@beloauto/types`. Backend domain types (`HotsiteBranding`, `HotsiteModule` in `hotsite-config.aggregate.ts`) are NOT touched — they are domain-layer types, not API contract types.
> - **async params** — Next.js 16: `params: Promise<{ slug: string }>; const { slug } = await params` throughout.
> - **Env vars** — `HOTSITE_REVALIDATE_SECRET` and `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL` added to `apps/web/.env.example` and `.env.local`. `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL` defaults to `http://localhost:4443/beloauto-hotsite-public-dev` locally; set to CDN/bucket URL in prod via environment config.

**Font allow-list (`apps/web/lib/hotsite/font-config.ts`):**

| Manifest key | Font | Personality |
|---|---|---|
| `"Inter"` | Inter | Modern, neutral — default |
| `"Poppins"` | Poppins | Friendly, rounded — salons, clinics |
| `"Playfair Display"` | Playfair Display | Elegant, premium — luxury detailing |
| `"Montserrat"` | Montserrat | Bold, impactful — performance/sports |
| `"Raleway"` | Raleway | Light, refined — boutique/premium |
| `"Oswald"` | Oswald | Strong, condensed — garages, auto shops |
| `"Lato"` | Lato | Clean, trustworthy — clinics, corporate |
| `"Roboto"` | Roboto | Neutral, reliable — mechanics, services |

Each font is loaded once at build time with a CSS variable (`variable` option in `next/font/google`). `applyBranding()` resolves the manifest font key to the matching CSS variable; unknown keys fall back to `"Inter"`.

**Shared types migration (same branch — do first):**
1. Create `packages/types/src/hotsite.ts` — move `HotsiteManifestResponse`, `HotsiteBrandingResponse`, `HotsiteModuleResponse`, `HotsiteAdminContentResponse`, `PublishHotsiteResponse`, `UnpublishHotsiteResponse`, `GenerateHotsiteImageSignedUrlResponse`, `FeatureBookingPhotoResponse` from `apps/bff/src/tenants/tenants.types.ts`; **also define all 7 module data interfaces** (`HeroModuleData`, `ServiceListModuleData`, `GalleryModuleData`, `TestimonialsModuleData`, `BookingCtaModuleData`, `AboutModuleData`, `ContactModuleData`) from `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §4 — so S04–S09 module components import from `@beloauto/types` rather than defining local interfaces that can drift from the BFF
2. Add `export * from './hotsite'` to `packages/types/src/index.ts`
3. Delete `apps/bff/src/tenants/tenants.types.ts`
4. Update 5 BFF files to import from `@beloauto/types`: `tenants.controller.ts`, `hotsite-admin.controller.ts`, `tenants.controller.spec.ts`, `tenants.controller.component.spec.ts`, `hotsite-admin.controller.spec.ts`

**What to create/update in `apps/web/`:**
- `apps/web/lib/hotsite/font-config.ts` — loads 8 fonts via `next/font/google`, exports `FONT_VARIABLES` array (for `<body className>`) and `FONT_MAP` (key → CSS variable string)
- `apps/web/lib/hotsite/apply-branding.ts` — `applyBranding(branding)` returns `React.CSSProperties` with all `--ba-*` variables; resolves font keys via `FONT_MAP`
- `apps/web/lib/api/tenant.ts` — `fetchManifest(slug)` calls `GET ${NEXT_PUBLIC_BFF_URL}/tenants/slug/${slug}` with `next: { revalidate: 300 }`; calls `notFound()` on 404
- `apps/web/app/[slug]/layout.tsx` — server component; `await params`; calls `fetchManifest(slug)`; injects `applyBranding()` result on `<body style>`; adds font CSS variables via `className` on `<body>`; wraps children in `<html lang="pt-BR">`
- `apps/web/app/[slug]/page.tsx` — server component; `await params`; calls `fetchManifest(slug)` (deduplicated); filters `layout[]` to `enabled: true`; maps each type to its component via `MODULE_MAP` (starts as `Partial<Record<HotsiteModuleType, ...>> = {}` — each module story S04–S06 registers its entry); renders `<Footer />`
- `apps/web/app/api/revalidate/route.ts` — `GET` handler; verifies `secret` query param against `HOTSITE_REVALIDATE_SECRET`; calls `revalidatePath('/[slug]', 'page')` on match; returns `401` on mismatch/missing
- `apps/web/next.config.mjs` — add `images.remotePatterns` reading hostname from `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL`

**`applyBranding()` signature** (`apps/web/lib/hotsite/apply-branding.ts`):

```typescript
const BORDER_RADIUS = { sharp: '0px', rounded: '8px', pill: '9999px' };
const SECTION_PY    = { compact: '3rem', comfortable: '5rem', spacious: '8rem' };
const SHADOW        = {
  none:   'none',
  subtle: '0 1px 3px rgba(0,0,0,0.10)',
  strong: '0 4px 16px rgba(0,0,0,0.20)',
};

export function applyBranding(branding: HotsiteBrandingResponse): React.CSSProperties {
  return {
    '--ba-primary':       branding.primaryColor,
    '--ba-secondary':     branding.secondaryColor,
    '--ba-background':    branding.backgroundColor,
    '--ba-text':          branding.textColor,
    '--ba-heading-font':  FONT_MAP[branding.headingFontFamily] ?? FONT_MAP['Inter'],
    '--ba-body-font':     FONT_MAP[branding.bodyFontFamily]    ?? FONT_MAP['Inter'],
    '--ba-radius':        BORDER_RADIUS[branding.borderRadius],
    '--ba-section-py':    SECTION_PY[branding.spacing],
    '--ba-shadow':        SHADOW[branding.shadowStyle],
    '--ba-btn-variant':   branding.buttonStyle,
  } as React.CSSProperties;
}
```

**Rule for all module components:** use only `var(--ba-*)` for colors, fonts, radius, spacing, and shadows. Never hardcode visual values.

**Acceptance criteria:**
- [ ] `GET /lavacar-beloauto` renders the hotsite with all 10 branding tokens applied as CSS variables on `<body>`
- [ ] All `--ba-*` variables are present with correct values
- [ ] `borderRadius: 'pill'` → `--ba-radius: 9999px`; `spacing: 'compact'` → `--ba-section-py: 3rem`
- [ ] Only modules with `enabled: true` are rendered — `enabled: false` modules are skipped silently
- [ ] `GET /nonexistent-slug` returns Next.js 404 page
- [ ] Second request within 5 minutes served from Next.js cache (no BFF call)
- [ ] `headingFontFamily: 'Playfair Display'` → `--ba-heading-font` resolves to the pre-loaded `next/font/google` CSS variable (not a runtime `<link>`)
- [ ] Unknown font key falls back to Inter — no crash
- [ ] `<body>` has both `style` (CSS var values) and `className` (font CSS variable names) applied correctly
- [ ] Secured `GET /api/revalidate?secret=&slug=` route implemented — `HOTSITE_REVALIDATE_SECRET` match → `revalidatePath`, mismatch/missing → `401`
- [ ] `next.config.mjs` `images.remotePatterns` hostname derived from `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL` env var
- [ ] `HOTSITE_REVALIDATE_SECRET` and `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL` present in `apps/web/.env.example` and `.env.local`
- [ ] Shared types migration complete: `packages/types/src/hotsite.ts` exists, `apps/bff/src/tenants/tenants.types.ts` deleted, BFF imports from `@beloauto/types`, `tsc --noEmit` passes in both `apps/bff` and `apps/web`
- [ ] TypeScript compiles with zero errors across the monorepo

**Dependencies:** M12-S01, M12-S10, M00-S05

---

### M12-S04 — HERO module component ✅ Done

**Agent:** `frontend-ts`  
**Complexity:** S  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § HERO module

**Description:**  
Implement the HERO hotsite module. A full-width section with optional background image, headline, subtitle, and a call-to-action button. Supports two layout variants: `centered` (default) and `left-aligned`.

**Component:** `apps/web/components/hotsite/HeroModule.tsx`

```typescript
interface HeroModuleData {
  variant: 'centered' | 'left-aligned';  // default: 'centered'
  title: string;
  subtitle?: string;
  backgroundImageUrl?: string;           // GCS URL
  ctaLabel: string;
  ctaTarget: 'booking' | 'service-list';
}
```

- `variant: 'centered'` — title, subtitle, and button centered horizontally
- `variant: 'left-aligned'` — content left-aligned, image on the right (two-column on desktop, stacked on mobile)
- CTA scrolls to `#booking-form` (ctaTarget: 'booking') or `#service-list` (ctaTarget: 'service-list')
- If `backgroundImageUrl` is null: solid `var(--ba-primary)` background
- Button uses `var(--ba-btn-variant)` and `var(--ba-primary)` — never hardcoded colors
- Responsive: full-height on mobile, 60vh on desktop

**Component testing infrastructure (one-time setup — do first, benefits S04–S07):**

Module components (`components/hotsite/`) are synchronous prop-driven functions that return JSX with no Next.js runtime API calls. They are fully testable with `@testing-library/react` in jsdom. This story sets up the infrastructure so every subsequent module story (S05, S06, S07) can add its `*.spec.tsx` without further setup.

1. Install devDependencies in `apps/web`: `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`
2. Create `apps/web/__mocks__/next-image.ts` — renders `<img src alt ...rest>` (same global-alias pattern as `next-font-google.ts`; `next/image` has the same module-evaluation side-effect and must be globally swapped, not per-file mocked)
3. Update `apps/web/vitest.config.ts`:
   - Add `'next/image': path.resolve(__dirname, '__mocks__/next-image.ts')` to `resolve.alias`
   - Each component spec file declares `// @vitest-environment jsdom` at line 1 — `environmentMatchGlobs` is not available in Vitest v4's TypeScript types; per-file declaration is the correct mechanism. `lib/**` stays in `node` with no annotation.
4. Update `apps/web/vitest.setup.ts`: add `import '@testing-library/jest-dom'`
5. Update `sonar-project.properties` (or equivalent): remove `apps/web/components/**` from `sonar.coverage.exclusions` — module components now have Vitest tests and must contribute to coverage

**Component typing convention (established here for all module stories):**

`HeroModule` declares its own fully-typed props interface. The `ModuleComponent` registry type in `page.tsx` uses `data: Record<string, unknown>` for heterogeneity — the cast is isolated to the registration site only, never inside the component:

```ts
// HeroModule.tsx — fully typed, readable contract
interface HeroModuleProps {
  readonly data: HeroModuleData;
  readonly slug: string;
}

// page.tsx — single cast at the boundary
MODULE_MAP['HERO'] = HeroModule as ModuleComponent;
```

All subsequent module components (S05–S07) follow this same pattern.

**Acceptance criteria:**

*Component:*
- [ ] `variant: 'centered'` — title, optional subtitle, and CTA button rendered and horizontally centred
- [ ] `variant: 'left-aligned'` — content left-aligned; on desktop: two-column layout (content left, image right); on mobile: single-column stacked
- [ ] Both variants are responsive — stack to single column on `< sm` breakpoint
- [ ] CTA button uses `var(--ba-primary)` for colour — no hardcoded hex or Tailwind colour class
- [ ] CTA button style respects `var(--ba-btn-variant)` — `filled`, `outline`, `ghost` produce distinct visual styles without hardcoded values
- [ ] `backgroundImageUrl` absent → no `<img>` rendered; section background is solid `var(--ba-primary)`
- [ ] `backgroundImageUrl` present → rendered via `next/image` with `priority` prop set (LCP element — never `loading="lazy"`)
- [ ] `ctaTarget: 'booking'` → CTA `href="#booking-form"`
- [ ] `ctaTarget: 'service-list'` → CTA `href="#service-list"`
- [ ] `subtitle` present → subtitle text rendered; `subtitle` absent → no subtitle element in DOM
- [ ] Section height: full-height on mobile, `60vh` on desktop
- [ ] `HeroModule` registered as `MODULE_MAP['HERO']` in `apps/web/app/[slug]/page.tsx`; cast to `ModuleComponent` at the registration site only

*Infrastructure:*
- [ ] `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` present in `apps/web` devDependencies
- [ ] `apps/web/__mocks__/next-image.ts` created and wired into `vitest.config.ts` `resolve.alias`
- [ ] Each component spec file declares `// @vitest-environment jsdom` at line 1; existing `lib/**` tests continue to pass with `environment: 'node'` (no annotation needed)
- [ ] `vitest.setup.ts` imports `@testing-library/jest-dom`
- [ ] `sonar.coverage.exclusions` no longer includes `apps/web/components/**`

*`HeroModule.spec.tsx` (via `@testing-library/react` in jsdom):*
- [ ] `variant: 'centered'` — title text, CTA button with correct label rendered; centred layout class/structure applied
- [ ] `variant: 'left-aligned'` — title text rendered; left-aligned layout class/structure applied
- [ ] `ctaTarget: 'booking'` → CTA anchor `href` is `#booking-form`
- [ ] `ctaTarget: 'service-list'` → CTA anchor `href` is `#service-list`
- [ ] `backgroundImageUrl` absent → no `<img>` in DOM
- [ ] `backgroundImageUrl: 'https://example.com/hero.jpg'` → `<img>` rendered with `src` matching the URL
- [ ] `subtitle: 'Texto'` → subtitle text in DOM; no `subtitle` prop → subtitle element absent
- [ ] `tsc --noEmit` passes across monorepo after all changes

**Dependencies:** M12-S03

---

### M12-S05 — SERVICE_LIST module component ✅ Done

**Agent:** `frontend-ts`  
**Complexity:** S  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § SERVICE_LIST module

**Description:**  
Implement the SERVICE_LIST hotsite module. Fetches active services from the BFF and renders them as cards with name, description, price, and duration.

> **Note (M12-S04 follow-up):** `HeroModule.tsx` defines local `btnStyle`/`headingStyle` constants referencing `var(--ba-btn-bg)`, `var(--ba-btn-text)`, `var(--ba-radius)`, `var(--ba-heading-font)`, etc. If `ServiceListModule` (and S06's modules) need the same button/heading styling, don't redefine these inline — extract a shared `apps/web/lib/hotsite/module-styles.ts` once the pattern repeats in a second component. Not done in S04 since there was only one consumer.

> **Note (story-discovery resolution, M12-S05):** Data fetching happens at **page level**, not inside the component — `app/[slug]/page.tsx` calls a new `fetchServices(slug)` (`apps/web/lib/api/services.ts`, same `next: { revalidate: 300 }` ISR pattern as `fetchManifest`) when a `SERVICE_LIST` module is enabled, and passes the resolved array as a `services` prop. `ServiceListModule` itself stays a synchronous, fully-prop-driven component — consistent with `HeroModule` and the "rendered from mocked data" component-test expectation.
>
> **Note (refactor during M12-S05):** the public service-list contract was promoted to `@beloauto/types` as `HotsiteServiceResponse`/`HotsiteServiceListResponse` (`id, name, description, price: Money, durationMinutes, loyaltyPointsValue, requiresPickupAddress, isActive, createdAt`) — `apps/web/lib/api/services.ts` imports these directly rather than defining a local `ServiceListItem`. The BFF's `apps/bff/src/services/services.types.ts` was deleted; admin CRUD lives in `ServicesController` and the public list in the new `ServicesPublicController` (`GET /services`), both `@Controller('services')` and both returning `@beloauto/types` shapes. The existing `@beloauto/types` `ServiceResponse` (`service.dto.ts`) remains a different, unused dashboard-shaped placeholder — not touched by this story.
>
> Duration format: `< 60` → `"${m} min"`; `>= 60` and `m % 60 === 0` → `"${h}h"`; otherwise `"${h}h ${m}min"` (e.g. 45→"45 min", 60→"1h", 90→"1h 30min").

**Component:** `apps/web/components/hotsite/ServiceListModule.tsx`

```typescript
interface ServiceListModuleData {
  title?: string;               // default "Nossos Serviços"
  showPrices: boolean;
  showPoints: boolean;          // loyalty points per service
  layout: 'grid' | 'list';     // default: 'grid'
}
```

- Fetches services server-side via `GET /v1/services` with `X-Tenant-Slug` header
- Price displayed as `R$ 150,00` (pt-BR format)
- Duration displayed as `"60 min"` or `"1h 30min"`
- `layout: 'grid'` → responsive grid (1 col mobile, 2 tablet, 3 desktop)
- `layout: 'list'` → single-column stacked cards
- Section anchor: `id="service-list"` (HERO CTA target)

**Acceptance criteria:**
- [ ] Services rendered from live API (not hardcoded)
- [ ] `showPrices: false` hides price badges
- [ ] `showPoints: false` hides loyalty point badges
- [ ] `layout: 'grid'` renders responsive grid; `layout: 'list'` renders single column
- [ ] Price format is `R$ 150,00` (comma decimal separator)
- [ ] Empty services → `"Nenhum serviço disponível no momento"`
- [ ] Section has `id="service-list"` anchor

**Dependencies:** M12-S03, M05-S05

---

### M12-S06 — GALLERY, TESTIMONIALS, ABOUT, CONTACT modules + tenant business info settings ✅ Done

**Agent:** `backend-ts` + `bff-ts` + `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § module data contracts (esp. CONTACT) + `docs/21-TENANTS_SETTINGS_SCHEMA.md` § Business Info Settings

**Description:**  
Implement the 4 remaining hotsite modules. All render data from the manifest `data` object. GALLERY is the most important — it displays admin-curated before/after images that come from two sources: completed booking after-photos and custom admin uploads.

> **Note (story-discovery, M12-S06):** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` documented CONTACT's address/phone/email as "pulled from `tenants.settings`", but no such field existed anywhere — `TenantSettings`, the `tenants` table, and the manifest's `tenant` object only ever carried `{ id, name, slug }`. This story adds a `business_info` block to `tenants.settings` (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §6, added 2026-06-10) and resolves it into a new `business` field on the public manifest — bumping this story from S to M and adding `apps/backend`/`apps/bff`/`packages/types` to its scope, on top of the 3 frontend-only modules (GALLERY, TESTIMONIALS, ABOUT).

**Part A — `tenants.settings.business_info` (backend domain):**
1. `apps/backend/src/contexts/platform/domain/value-objects/tenant-settings.vo.ts` — add `BusinessInfoAddress` (`street, number, complement?, neighborhood, city, state, zip_code`) and `BusinessInfo` (`phone: string | null`, `email: string | null`, `address: BusinessInfoAddress | null`); add optional `business_info?: BusinessInfo` to `TenantSettingsProps`. **Unlike `notification` (single-field, whole-object fallback), the `business_info` getter must default per-field** — `{ phone: this.props.business_info?.phone ?? null, email: this.props.business_info?.email ?? null, address: this.props.business_info?.address ?? null }` — because a partial PATCH (e.g. `{ phone: "..." }` only) survives `deepMerge` as a partial object, and a whole-object fallback would silently drop the other fields. `TenantSettings.default()` includes the all-null shape. Split validation into `validateBusinessInfo()` (checks `phone` via `PhoneNumber.isValid`, `email` via `Email.isValid`, delegates `address` to `validateBusinessAddress()`) and `validateBusinessAddress()` (checks `zip_code` is exactly 8 digits, `state` is a 2-letter uppercase UF, and required sub-fields `street/number/neighborhood/city/state/zip_code` are present) — both ≤20 lines (CLAUDE.md §7); both called from `validate()` alongside `validateLoyalty`/`validateBooking`/`validateBusinessHours`
   - Test builders: `apps/backend/src/test/builders/platform/tenant-settings-props.builder.ts` — add `withBusinessInfo(overrides: Partial<BusinessInfo>)` (same merge pattern as `withNotification`); `apps/backend/src/test/builders/platform/tenant-entity.builder.ts` — add `withSettings(settings: TenantSettingsProps)` (currently missing — needed for the tenant-isolation integration test where Tenant A has `business_info` set and Tenant B doesn't)
2. `apps/backend/src/contexts/platform/application/dtos/update-tenant-settings.dto.ts` — add `BusinessInfoAddressSchema` (`.partial()`, all fields `z.string().nullable().optional()`: `street, number, complement, neighborhood, city, state, zip_code`) and `BusinessInfoSchema` (`.partial()`: `phone`/`email` as `z.string().nullable().optional()`, `address: BusinessInfoAddressSchema.nullable().optional()`) to `UpdateTenantSettingsSchema.settings`. Mirror `BookingSchema`'s pattern of duplicating cheap format checks in zod (`zip_code: z.string().regex(/^\d{8}$/)`, `state: z.string().regex(/^[A-Z]{2}$/)`); defer `phone`/`email` validity to the domain VO (item 1) — not simple regexes
3. `apps/backend/http/platform/tenant-settings.http` — add example `PATCH /tenants/settings` requests that set/clear `business_info` (happy path + `400` invalid `zip_code`/`phone`/`email`)

**Part B — manifest exposure (backend + shared types):**
4. `apps/backend/src/contexts/platform/application/use-cases/get-hotsite-manifest.use-case.ts` — inject `ITenantRepository` (`TENANT_REPOSITORY` — same Platform context as `HotsiteConfig`, no cross-context port needed). After the existing `HotsiteNotFoundError`/`HotsiteNotPublishedError` checks, call `const tenant = await this.tenantRepo.findById(tenantContext.tenantId); if (!tenant) throw new TenantNotFoundError(tenantContext.tenantId);` — mirrors the identical lookup in `publish-hotsite.use-case.ts` (already mapped to 404 by `platform-error.mapper.ts`, no new mapping needed). Map `tenant.settings.business_info` (snake_case `zip_code`, `BusinessInfoAddress | null`) → `business: HotsiteBusinessInfoResponse` (camelCase `zipCode`; `address` fields spread when non-null else `address: null`) on `GetHotsiteManifestUseCaseResult`
5. `packages/types/src/hotsite.ts` — add `HotsiteBusinessInfoResponse` (`phone: string | null; email: string | null; address: { street, number, complement?, neighborhood, city, state, zipCode } | null`); add `business: HotsiteBusinessInfoResponse` to `HotsiteManifestResponse` **only** — not the base `HotsiteResponse`, since `HotsiteAdminContentResponse extends HotsiteResponse` serves `/tenants/hotsite` (admin content has no `business`)
6. `apps/bff/src/platform/platform.public.controller.ts` (+ `.spec`/`.component.spec`) — `business` lives on `HotsiteManifestResponse` only (item 5), so the existing `return { tenant, ...hotsite }` needs `hotsite`'s type widened: change `getForPublic<HotsiteResponse>('/hotsite', tenant.id)` to `getForPublic<HotsiteResponse & { business: HotsiteBusinessInfoResponse }>('/hotsite', tenant.id)` — body unchanged, only the type parameter. Update both spec fixtures: add a `business: HotsiteBusinessInfoResponse` object to the `hotsiteResponse` fixture and assert `result.business` / `res.body.business` equals it

**Part C — frontend module components (`apps/web/components/hotsite/`):**

**`GalleryModule.tsx`**
```typescript
// canonical type: packages/types/src/hotsite.ts (already includes bookingId/photoType from M12-S10)
interface GalleryImage {
  url: string;
  caption?: string;
  source: 'booking' | 'upload';
  bookingId?: string;
  photoType?: 'before' | 'after';
}

interface GalleryModuleData {
  title?: string;                    // default "Nossos Resultados"
  images: GalleryImage[];            // admin-curated ordered list
  layout: 'grid' | 'masonry';       // default: 'grid'
  maxVisible: number;                // default 6
}
```
- **Islands split:** `GalleryModule.tsx` (server) renders the heading and maps `images` to server-rendered `GalleryItem` (`next/image`, `loading="lazy"`, badge) elements, passed as `children` to `GalleryGrid.tsx` (`'use client'`, the only island) — `GalleryGrid` holds `expanded` state (`useState`), slices `children` to `maxVisible` until "Ver mais" is clicked, then renders all. No image data crosses the server/client boundary, only pre-rendered nodes plus `maxVisible`/`children.length`
- "Ver mais" button renders only if `images.length > maxVisible`
- Lazy-loads images (`loading="lazy"`)
- If `images` is empty, renders nothing (entire section hidden)
- `layout: 'masonry'` uses CSS columns for a Pinterest-style layout
- Images with `photoType` render a localized badge ("Antes" / "Depois")
- No section `id` — no `HeroModuleData.ctaTarget` value references GALLERY

**`TestimonialsModule.tsx`**
```typescript
interface Testimonial {
  authorName: string;
  text: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  avatarUrl?: string;
}

interface TestimonialsModuleData {
  title?: string;                    // default "O que nossos clientes dizem"
  items: Testimonial[];
  layout: 'grid' | 'carousel';      // default: 'grid'
}
```
- Star rating rendered when `rating` is present
- **Islands split:** `TestimonialsModule.tsx` (server) maps `items` to server-rendered `TestimonialCard` elements; `layout: 'grid'` renders them in a plain `<ul>` (no client code); `layout: 'carousel'` passes the same cards as `children` to `TestimonialsCarousel.tsx` (`'use client'`, the only island) — holds `activeIndex` state and renders prev/next navigation buttons

**`AboutModule.tsx`**
```typescript
interface AboutModuleData {
  title: string;                     // e.g. "Sobre nós" | "Conheça o Dr. Silva"
  body: string;                      // markdown — rendered as safe HTML
  imageUrl?: string;                 // GCS URL
  imagePosition: 'left' | 'right';  // default: 'right'
}
```
- `body` rendered as markdown via `react-markdown` + `rehype-sanitize` (new `apps/web` dependencies)
- Two-column layout on desktop (text + image); stacked on mobile

**`ContactModule.tsx`**
```typescript
interface ContactModuleData {
  title?: string;           // default "Fale conosco"
  showAddress: boolean;
  showPhone: boolean;
  showWhatsapp: boolean;
  showEmail: boolean;
  showMap: boolean;
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
  };
}
```
- New `business: HotsiteBusinessInfoResponse` prop (from `manifest.business`, passed by `app/[slug]/page.tsx` the same way `ServiceListModule` receives `services`) supplies the actual address/phone/email values; `data` only controls which sections to show
- `showAddress` / `showPhone` / `showEmail` are each gated on the corresponding `business.xxx` being non-`null`, even when the flag is `true`
- `showWhatsapp` → `https://wa.me/<digits>` link from `data.socialLinks.whatsapp`, opens in a new tab
- `socialLinks.instagram` / `.facebook` rendered when present
- `showMap: true` → keyless `https://maps.google.com/maps?q=<urlencoded address>&output=embed` iframe built from `business.address`; omitted if `business.address` is `null`

**Wiring (`app/[slug]/page.tsx` + `lib/hotsite/module-schemas.ts`):**
- Register `GALLERY`, `TESTIMONIALS`, `ABOUT` in `MODULE_MAP` and add `GalleryModuleDataSchema`/`TestimonialsModuleDataSchema`/`AboutModuleDataSchema` to `MODULE_DATA_SCHEMAS`; update `module-schemas.spec.ts`'s "module types without a registered schema" test accordingly
- `CONTACT` follows the `SERVICE_LIST` pattern (special-cased in `page.tsx`, not in `MODULE_MAP`) since it needs the extra `business` prop from `manifest.business`
- New files live flat in `apps/web/components/hotsite/` alongside existing modules: `GalleryItem.tsx`, `GalleryGrid.tsx`, `TestimonialCard.tsx`, `TestimonialsCarousel.tsx` — each island (`GalleryGrid`, `TestimonialsCarousel`) gets its own `*.spec.tsx` testing the interactive behavior (`@testing-library/user-event`)

**Acceptance criteria:**
- [ ] All 4 components render correctly when their module type is present in `layout` with `enabled: true`
- [ ] `GalleryModule` with empty `images[]` renders nothing (section fully hidden)
- [ ] `GalleryModule` with 8 images and `maxVisible: 6` shows 6 images + "Ver mais" button
- [ ] `GalleryModule` renders images via `next/image` with breakpoint-matched `sizes`, `loading="lazy"` (below-the-fold)
- [ ] `GalleryModule` images with `photoType` present render a localized badge (`"Antes"` for `before`, `"Depois"` for `after`) — see `GalleryImage.photoType` (M12-S10)
- [ ] `AboutModule` with `imagePosition: 'left'` renders image on left, text on right on desktop
- [ ] `AboutModule` markdown body is sanitised (no raw `<script>` tags rendered)
- [ ] `ContactModule` `showMap: false` renders no iframe
- [ ] `ContactModule` `showMap: true` + `business.address: null` renders no iframe
- [ ] `ContactModule` `showAddress` / `showPhone` / `showEmail: true` with the corresponding `business.xxx: null` renders nothing for that field
- [ ] `ContactModule` `showWhatsapp: true` + `data.socialLinks.whatsapp` present renders a `wa.me/<digits>` link
- [ ] `tenant-settings.vo.ts`: `business_info` validation rejects invalid `phone`/`email`/`zip_code`/`state`, accepts `null`/partial values — unit tests
- [ ] `GetHotsiteManifestUseCase`: manifest includes `business` resolved from `tenant.settings.business_info`; integration test asserts tenant isolation (Tenant A's `business_info` never appears in Tenant B's manifest)
- [ ] `GalleryGrid` reveals remaining images when "Ver mais" is clicked (RTL + `user-event`); `TestimonialsCarousel` advances `activeIndex` on next/prev click
- [ ] `TenantSettingsPropsBuilder.withBusinessInfo()` and `TenantEntityBuilder.withSettings()` exist and are used by the new tests
- [ ] All text in example/default content is pt-BR

**Dependencies:** M12-S03

---

### M12-S07 — BOOKING_CTA module + booking form page ✅ Done

**Agent:** `frontend-ts`  
**Complexity:** XL  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § BOOKING_CTA module, `docs/04-USE_CASES.md` § UC-001, UC-011, `docs/14-API_CONTRACTS.md` § Bookings, § Schedule Availability

**Description:**  
Implement the BOOKING_CTA module and the full booking form page — the most interactive part of the hotsite. The form is a 4-step flow: (1) select services, (2) pick a day from a horizontal availability carousel then a time slot, (3) fill personal info (contact + optional contact address + conditional pickup address + optional before-service photos), (4) submit. Calls UC-001 (guest booking) and UC-011 (availability, two-phase).

This story also retires the stale, unused `@beloauto/types` booking/schedule contracts (replacing them with shapes that mirror the BFF's `bookings.types.ts` / `schedule.types.ts`) and introduces a ports-and-adapters address-lookup abstraction (ViaCEP today, swappable for Google or another provider later without touching callers).

---

**1. `@beloauto/types` — replace stale contracts**

All current exports of `booking.dto.ts` and `schedule.dto.ts` have zero usages in `apps/` — safe full replacement.

`packages/types/src/money.ts` — add:
```typescript
export interface MoneyAmount {
  amount: number;
  currency: string;
}
```

`packages/types/src/schedule.dto.ts` — full replacement:
```typescript
export interface AvailableSlot {
  startsAt: string; // ISO-8601 datetime
  endsAt: string;   // ISO-8601 datetime
}

export interface AvailabilityResponse {
  date: string;     // YYYY-MM-DD
  slots: AvailableSlot[];
  available: boolean;
}

export interface DaySummary {
  date: string;     // YYYY-MM-DD
  available: boolean;
  slotCount: number;
}

export type AvailabilitySummaryResponse = DaySummary[];
```

`packages/types/src/booking.dto.ts` — full replacement:
```typescript
import type { Address } from './address';
import type { MoneyAmount } from './money';

export interface CreateBookingRequest {
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  contactAddress?: Address;
  pickupAddress?: Address;
  scheduledAt: string; // ISO-8601 datetime
  serviceIds: string[];
  beforeServicePhotoUrls?: string[];
}

export interface BookingLineResponse {
  lineId: string;
  serviceId: string;
  priceAtBooking: MoneyAmount;
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
}

export interface BookingResponse {
  bookingId: string;
  status: string;
  scheduledAt: string;
  totalPrice: MoneyAmount;
  totalDurationMins: number;
  pickupAddress: Address | null;
  beforeServicePhotoUrls: string[];
  lines: BookingLineResponse[];
}

export interface AttachmentSignedUrlRequest {
  fileName: string;
  contentType: 'image/jpeg' | 'image/png';
  tenantSlug: string;
}

export interface AttachmentSignedUrlResponse {
  signedUrl: string;
  filePath: string;
  expiresAt: string;
}
```
`CompleteBookingRequest` / `RescheduleBookingRequest` / `RequestMoreInfoRequest` / `SubmitInfoRequest` are dropped — unused dashboard-side booking-management types. They'll be re-added mirroring the BFF's actual shapes when that dashboard story is built.

---

**2. New API fetchers (`apps/web/lib/api/`)**

Client-side fetchers — no `next: { revalidate }` (availability and booking data must always be fresh):

`schedule.ts`:
- `fetchAvailabilitySummary(slug, from, to, serviceIds): Promise<AvailabilitySummaryResponse>` → `GET /schedule/availability/summary?from=&to=&serviceIds=`
- `fetchAvailability(slug, date, serviceIds): Promise<AvailabilityResponse>` → `GET /schedule/availability?date=&serviceIds=`

`bookings.ts`:
- `createBooking(slug, payload: CreateBookingRequest): Promise<BookingResponse>` → `POST /bookings`
- `createAttachmentSignedUrl(slug, fileName, contentType): Promise<AttachmentSignedUrlResponse>` → `POST /bookings/attachments/signed-url` (body includes `tenantSlug: slug` — anonymous-guest scenario)

Both send `X-Tenant-Slug: slug`. `serviceIds` is joined as a comma-separated string.

---

**3. Address lookup — ports & adapters (`apps/web/lib/address/`)**

```typescript
// address-lookup.port.ts
export interface AddressLookupResult {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface AddressLookup {
  lookup(cep: string): Promise<AddressLookupResult | null>;
}
```

```typescript
// viacep-address-lookup.adapter.ts
export const viaCepAddressLookup: AddressLookup = {
  async lookup(cep) {
    // GET https://viacep.com.br/ws/${digitsOnly(cep)}/json/
    // returns null on network error or { erro: true } (CEP not found)
  },
};
```

```typescript
// in-memory-address-lookup.ts (test double)
export class InMemoryAddressLookup implements AddressLookup {
  constructor(private readonly results: Record<string, AddressLookupResult | null>) {}
  async lookup(cep: string) {
    return this.results[cep] ?? null;
  }
}
```

`AddressFields` takes `addressLookup: AddressLookup = viaCepAddressLookup` as a prop. Swapping to a Google-based adapter later means writing a new adapter implementing `AddressLookup` and changing the default — zero changes to `AddressFields` or its callers. Tests inject `InMemoryAddressLookup`.

---

**4. `BookingCtaModule.tsx`**
```typescript
interface BookingCtaModuleData {
  title: string;
  subtitle?: string;
  ctaLabel: string;
  backgroundImageUrl?: string;   // GCS URL, optional
}
```
- CTA button links to `/<slug>/booking`
- Section anchor: `id="booking-form"`
- Add `BookingCtaModuleDataSchema` to `lib/hotsite/module-schemas.ts`, register in `MODULE_MAP`

---

**5. Booking form architecture (`app/[slug]/booking/`)**
- `page.tsx` — server component, fetches `services` via `fetchServices(slug)`, renders `<BookingForm slug={slug} services={services} />`. Not unit-tested (page rule — Playwright only).
- `components/booking/BookingForm.tsx` — `'use client'`, owns step state + form state, orchestrates Steps 1-4.
- `components/booking/ServiceSelectionStep.tsx` — Step 1.
- `components/booking/AvailabilityCarousel.tsx` — Step 2, Phase 1 (day cards).
- `components/booking/SlotPicker.tsx` — Step 2, Phase 2 (time-slot buttons).
- `components/booking/AddressFields.tsx` — CEP input + autofill, reused for `contactAddress` and `pickupAddress`.
- `components/booking/PhotoUpload.tsx` — optional multi-photo upload (signed-URL flow).
- `components/booking/PersonalInfoStep.tsx` — Step 3, composes the above.
- `components/booking/ConfirmationStep.tsx` — Step 4.

Each component (except `page.tsx`) gets a `*.spec.tsx` (Vitest + RTL, `// @vitest-environment jsdom`, `vi.spyOn(globalThis, 'fetch')`).

---

**Step 1 — Service Selection:**
- Renders service cards with checkbox/toggle
- Shows running total: `"2 serviços — R$ 300,00 — 2h"`
- "Próximo" disabled until ≥1 service selected

**Step 2 — Date & Slot Picker (two-phase, horizontal carousel):**

*Phase 1* — on step entry, `fetchAvailabilitySummary(slug, today, today+13d, serviceIds)` → 14-day `DaySummary[]` (well within the default `max_booking_advance_days: 90`). Render as a horizontal scrollable carousel of day-cards (◀ ▶ scroll controls on desktop, native swipe on mobile):
- Each card shows weekday abbreviation (pt-BR: Dom/Seg/Ter/Qua/Qui/Sex/Sáb) + day number; first card labelled "Hoje"
- `available: true` → enabled; selected card highlighted with `var(--ba-primary)`
- `available: false` → disabled/greyed, not clickable

*Phase 2* — on day-card selection, `fetchAvailability(slug, date, serviceIds)` → render `slots` as time buttons (`startsAt`–`endsAt` formatted `HH:mm`). Loading state while fetching; `slots: []` → `"Nenhum horário disponível"`.

"Próximo" disabled until a slot is selected.

**Step 3 — Personal Info:**
- `contactName`, `contactEmail`, `contactPhone` — always required
- `contactAddress` — optional, collapsible "Endereço de contato (opcional)" section using `AddressFields`
- `pickupAddress` — shown and required only if a selected service has `requiresPickupAddress: true`, using `AddressFields`
- `AddressFields` CEP flow: on 8-digit CEP entry → `addressLookup.lookup(cep)` autofills street/neighborhood/city/state (editable); `number`/`complement` always manual; lookup failure leaves fields editable with no blocking error
- Optional "Fotos do veículo (opcional)" via `PhotoUpload` — for each selected image: (1) `createAttachmentSignedUrl(slug, file.name, file.type)` → `{signedUrl, filePath}`, (2) `PUT` file to `signedUrl`, (3) collect `filePath` into `beforeServicePhotoUrls`
- All labels in pt-BR; client-side validation before "Próximo"

**Step 4 — Submit & Confirmation:**
- Calls `createBooking(slug, { contactEmail, contactName, contactPhone, contactAddress?, pickupAddress?, scheduledAt, serviceIds, beforeServicePhotoUrls? })`
- `201` → `"Solicitação enviada! Aguarde a confirmação por email."`
- `409` (slot taken) → back to Step 2 with `"Horário indisponível, escolha outro"`
- Other error → generic pt-BR message

**Acceptance criteria:**
- [ ] `@beloauto/types`: `booking.dto.ts` / `schedule.dto.ts` / `money.ts` updated as above; monorepo `pnpm type-check` passes
- [ ] `BookingCtaModule` section has `id="booking-form"` anchor; CTA links to `/<slug>/booking`; `BookingCtaModuleDataSchema` registered
- [ ] Full 4-step flow works end-to-end against local backend
- [ ] Carousel: `available: false` days are disabled/unselectable; selecting an `available: true` day fetches and renders its slots
- [ ] Empty slots → `"Nenhum horário disponível"`
- [ ] `pickupAddress` fields appear and are required only when a selected service has `requiresPickupAddress: true`
- [ ] Valid 8-digit CEP autofills street/neighborhood/city/state via `AddressLookup`; invalid/not-found CEP leaves fields editable
- [ ] Photo upload completes the 3-step signed-URL flow; resulting `filePath`s are included in `beforeServicePhotoUrls`
- [ ] `409` conflict on submit returns to Step 2 with error message
- [ ] All labels, placeholders, error messages in pt-BR
- [ ] Component tests (Vitest + RTL): `AvailabilityCarousel` (enabled/disabled days, selection), `SlotPicker` (slots render, empty state), `AddressFields` (CEP autofill via `InMemoryAddressLookup`, lookup failure), `PhotoUpload` (signed-URL flow mocked), `BookingForm` (step transitions, mocked API)
- [ ] Playwright E2E for the full happy-path flow is deferred to M16-S06 (not part of this story)

**Dependencies:** M12-S03, M07-S04, M06-S04

---

### M12-S08 — Hotsite 404 and unpublished states ✅ Done

**Agent:** `frontend-ts` + `backend-ts` (small)  
**Complexity:** S  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § Unpublished state, `docs/14-API_CONTRACTS.md` § Tenant Hotsite Manifest

**Description:**  
Implement the hotsite edge cases: a 404 page for unknown slugs, and an "Em breve" placeholder for unpublished hotsites. These are two distinct cases with two distinct UIs:

- **Unknown slug** → `TenantNotFoundError`/`HotsiteNotFoundError` → `404` → `fetchManifest()` calls `notFound()` → `app/not-found.tsx` (root-level, BeloAuto-branded, no manifest available).
- **Hotsite not published** → tenant + hotsite config exist, but `isPublished: false`. Today `GetHotsiteManifestUseCase` throws `HotsiteNotPublishedError`, mapped to the *same* `404` as "unknown slug" — making the two cases indistinguishable, and discarding the `branding`/`layout`/`business` data needed to render anything tenant-specific.

**Backend change (small — `apps/backend`):**
- `get-hotsite-manifest.use-case.ts` — remove `if (!config.isPublished) throw new HotsiteNotPublishedError(tenantId)`. Instead, when `!config.isPublished`, return early with a **minimal payload**: `{ branding: config.branding, layout: [], isPublished: false, business: { phone: null, email: null, address: null, socialLinks: null } }` — skip `imageUrlResolver.resolve()` and the `tenantRepo`/`business_info` lookup entirely (not needed for the stub). Only `branding` (needed for `<Unavailable />`'s `var(--ba-*)` tokens) is real; `layout`/`business` are never populated with draft content on this **public, unauthenticated** endpoint — the admin's full draft state is already available via `GET /v1/tenants/hotsite` (M12-S02).
- `HotsiteNotPublishedError` (`platform-domain.error.ts`) and its branch in `platform-error.mapper.ts` become dead code — remove both, plus the corresponding test cases in `get-hotsite-manifest.use-case.spec.ts` and `hotsite.controller.spec.ts`.
- No change to `packages/types` (`HotsiteManifestResponse.isPublished` already exists) or the BFF controller (already passes the field through).

**Frontend changes (`apps/web`):**
- `apps/web/app/not-found.tsx` (root-level, **not** `app/[slug]/not-found.tsx`) — BeloAuto-branded 404: `"Lavacar não encontrada"` + link to `beloauto.com`. Static styling only — no manifest/branding available. Must live at the root: `fetchManifest()`'s `notFound()` fires inside `app/[slug]/layout.tsx`, and Next.js does not let a segment's own `not-found.tsx` catch a `notFound()` thrown by that segment's own `layout.tsx` — only an ancestor segment's `not-found.tsx` can.
- `apps/web/components/hotsite/Unavailable.tsx` — "Em breve" placeholder. Uses `var(--ba-*)` tokens (inherits the tenant's branding via `[slug]/layout.tsx`'s `applyBranding()`; defaults to `DEFAULT_HOTSITE_BRANDING` for unconfigured tenants — no special-casing needed).
- `apps/web/app/[slug]/page.tsx` — if `!manifest.isPublished`, render `<Unavailable />` instead of the module list (Footer omitted).

**Acceptance criteria:**
- [ ] `GET /unknown-slug` renders `not-found.tsx`
- [ ] 404 page has human-readable pt-BR message (`"Lavacar não encontrada"`) + link to `beloauto.com`
- [ ] `<title>Não encontrado — BeloAuto</title>`
- [ ] No JavaScript errors on 404 page
- [ ] Tenant with `isPublished: false` → `GET /<slug>` returns `200` and renders `<Unavailable />` ("Em breve"), not the module layout
- [ ] `<title>Em breve — BeloAuto</title>` when unpublished
- [ ] `Unavailable` component test — renders pt-BR copy using only `isPublished`/branding tokens, no other manifest data required
- [ ] `GetHotsiteManifestUseCase` returns `200 { isPublished: false, branding, layout: [], business: <all-null stub> }` for an unpublished tenant — unit test updated
- [ ] `HotsiteNotPublishedError` removed; `platform-error.mapper.ts` and related specs updated accordingly

**Dependencies:** M12-S03

---

### M12-S09 — Hotsite SEO: meta tags, Open Graph, structured data

**Agent:** `backend-ts` + `bff-ts` + `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § Manifest Schema + § SEO & Discoverability, `docs/14-API_CONTRACTS.md` § Tenant & Service Discovery, `docs/24-BFF_ARCHITECTURE.md` § Module & Controller Naming Conventions

**Description:**  
Implement per-tenant SEO metadata. Brazilian businesses depend on Google search and WhatsApp link previews. Without this, every tenant shows the same generic `<title>BeloAuto</title>` in search results. Also adds a small Platform-context "published hotsites" listing endpoint so `app/sitemap.ts` can enumerate every published tenant for search-engine discovery.

**New env var:** `NEXT_PUBLIC_SITE_URL` (`apps/web/.env.example` / `.env.local`) — `https://beloauto.com` in production, `http://localhost:3000` in local dev. All absolute URLs (canonical, OG, JSON-LD, sitemap) are built from this — never hardcode `https://beloauto.com`.

**1. SEO metadata helper — `apps/web/lib/hotsite/seo.ts`:**

```typescript
import type { Metadata } from 'next';
import type { HotsiteManifestResponse } from '@beloauto/types';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

interface BuildHotsiteMetadataOptions {
  manifest: HotsiteManifestResponse;
  slug: string;
  path?: string; // e.g. '/booking' — appended after the slug
}

export function buildHotsiteMetadata({
  manifest,
  slug,
  path = '',
}: BuildHotsiteMetadataOptions): Metadata {
  const url = `${SITE_URL}/${slug}${path}`;
  const title = `${manifest.tenant.name} — Agendamento Online`;

  return {
    title,
    description: `Agende seu serviço na ${manifest.tenant.name}. Rápido, fácil e online.`,
    openGraph: {
      title,
      url,
      siteName: 'BeloAuto',
      images: manifest.branding.logoUrl
        ? [{ url: manifest.branding.logoUrl, width: 1200, height: 630 }]
        : [],
      locale: 'pt_BR',
      type: 'website',
    },
    robots: manifest.isPublished
      ? { index: true, follow: true }
      : { index: false, follow: false },
    alternates: { canonical: url },
  };
}
```

**2. Wire into `app/[slug]/page.tsx` (extends the existing `generateMetadata`):**

```typescript
export async function generateMetadata({ params }: HotsitePageProps): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);
  return buildHotsiteMetadata({ manifest, slug });
}
```

Also add JSON-LD structured data (`LocalBusiness` schema) to the rendered output of `page.tsx` (home page only):
```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "[manifest.tenant.name]",
  "url": "[SITE_URL]/[slug]"
}
```

**3. Wire into `app/[slug]/booking/page.tsx` (extends the existing `generateMetadata`) — always `noindex`:**

```typescript
export async function generateMetadata({ params }: BookingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);
  return {
    ...buildHotsiteMetadata({ manifest, slug, path: '/booking' }),
    title: manifest.isPublished ? 'Agendar serviço' : 'Em breve — BeloAuto',
    robots: { index: false, follow: false },
  };
}
```

**4. Published hotsites listing endpoint (new — Platform context):**

- **Backend:** `GET /internal/tenants/published-hotsites` — new use case (e.g. `ListPublishedHotsitesUseCase`) joining `platform.tenants` and `platform.hotsite_configs` (same context, same schema — not a cross-context join). Returns one entry per tenant where `tenants.is_active = true AND hotsite_configs.is_published = true`:
  ```json
  { "items": [ { "slug": "lavacar-beloauto", "updatedAt": "2026-06-10T12:00:00.000Z" } ] }
  ```
  `updatedAt` = `hotsite_configs.updated_at` (ISO-8601 UTC). Gated by the global `InternalApiGuard` (`X-Internal-Key`) like all `/internal/*` routes.
- **BFF:** `GET /platform/published-hotsites` on `PlatformPublicController`, `@Public()`, calls the internal endpoint via `BackendHttpService`. New response type `HotsiteSitemapEntryListResponse` (`@beloauto/types`).
- **Frontend fetcher:** `fetchPublishedHotsiteSlugs()` in `apps/web/lib/api/platform.ts`.
- Both new endpoints need `.http` files per CLAUDE.md §7.

**5. `app/sitemap.ts`:**

```typescript
import type { MetadataRoute } from 'next';
import { fetchPublishedHotsiteSlugs } from '@/lib/api/platform';
import { SITE_URL } from '@/lib/hotsite/seo';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { items } = await fetchPublishedHotsiteSlugs();
  return items.map(({ slug, updatedAt }) => ({
    url: `${SITE_URL}/${slug}`,
    lastModified: updatedAt,
  }));
}
```

**6. `app/robots.ts`:**

```typescript
import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/hotsite/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/dashboard', '/auth'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
```

**Acceptance criteria:**
- [ ] `/[slug]` `<title>` is `"[Tenant Name] — Agendamento Online"` — not generic `"BeloAuto"`
- [ ] `/[slug]` `og:image` uses `manifest.branding.logoUrl` when available
- [ ] `/[slug]` `og:locale` is `pt_BR`
- [ ] `/[slug]` has JSON-LD `<script type="application/ld+json">` with `LocalBusiness` schema in the rendered document
- [ ] `/[slug]` unpublished → `<meta name="robots" content="noindex, nofollow">`
- [ ] `/[slug]` `canonical` URL is `${SITE_URL}/[slug]`
- [ ] `/[slug]/booking` always has `<meta name="robots" content="noindex, nofollow">`, regardless of `isPublished`
- [ ] Both `generateMetadata` implementations reuse the ISR-cached manifest fetch — no extra network call
- [ ] `GET /internal/tenants/published-hotsites` returns only tenants with `is_active = true AND hotsite_configs.is_published = true`; excludes inactive tenants and unpublished/draft hotsites
- [ ] `GET /platform/published-hotsites` (BFF, public) mirrors the same filtered list, `{ items: [{ slug, updatedAt }] }`
- [ ] Tenant-isolation: a tenant with `is_active = false` or `hotsite_configs.is_published = false` does NOT appear in `/platform/published-hotsites`
- [ ] `app/sitemap.ts` lists every published tenant slug with `lastmod` from `hotsite_configs.updated_at`
- [ ] `app/robots.ts` references the sitemap and disallows `/dashboard`, `/auth`
- [ ] `NEXT_PUBLIC_SITE_URL` added to `apps/web/.env.example` and `.env.local`; `SITE_URL` constant used everywhere instead of a hardcoded domain

**Dependencies:** M12-S01 (HotsiteConfig repository/use-case patterns), M12-S03

---

### M12-S10 — Hotsite public image storage: bucket separation + booking-photo featuring + publish revalidation ✅ Done

**Agent:** `backend-ts` + `bff-ts`  
**Complexity:** M  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § branding, § GALLERY, § manifest caching; `docs/14-API_CONTRACTS.md` § hotsite media

**Description:**  
Corrects a gap identified before M12-S03 starts consuming the manifest contract. M12-S01/S02 routed hotsite branding/layout images through the same "private bucket + freshly-regenerated read-signed URL at display time" pattern documented for booking attachments (`docs/14-API_CONTRACTS.md`). That pattern is correct for booking photos — they're genuinely private — but wrong for hotsite images, which are public marketing assets by definition. Worse, it actively conflicts with the manifest's caching strategy (`Cache-Control: public, max-age=300`, Next.js ISR, future CDN per `docs/15` §10): a cached manifest would embed signed URLs that can expire before the cache revalidates, serving broken images to visitors. (As of this story, `GetHotsiteManifestUseCase` doesn't yet resolve `filePath` → any URL at all — it returns the raw stored path — so this is a "settle the contract before the frontend builds on it" fix, not a behavioral regression.)

This story:
1. Gives hotsite images a separate **public** bucket with fixed, permanently-cacheable addresses (no signed-URL regeneration, no expiry) — booking photos keep the existing private/signed-read pattern untouched.
2. Implements the backend mechanism for `GalleryImage.source: 'booking'` (speced in `docs/15` §4 but never given an implementation path): admin selects a completed booking's before **or** after photo to feature, and the backend copies it into the public bucket at the moment of selection — not a live reference (which would reintroduce the same caching conflict and couple the gallery's lifecycle to the booking's).
3. Wires hotsite publish/unpublish to trigger on-demand Next.js revalidation, so changes go live immediately rather than waiting up to 5 minutes for ISR.

**Backend changes:**
- New public GCS bucket (e.g. `beloauto-hotsite-public-${var.environment}` / `GCS_PUBLIC_BUCKET_NAME`), `allUsers: roles/storage.objectViewer`, fronted by Cloud CDN per the existing scaling plan (`docs/22-TECH_STACK_DECISIONS.md`). New env var `GCS_PUBLIC_BASE_URL` (default `https://storage.googleapis.com`; local `.env` sets `http://localhost:4443` to match the `fake-gcs-server` `-external-url` in `docker/docker-compose.yml`) — see `getPublicUrl()` below
- `IStorageService` (shared port, `storage.service.port.ts`) gains:
  - `getPublicUrl(storagePath: string): string` — pure one-line template `${GCS_PUBLIC_BASE_URL}/${GCS_PUBLIC_BUCKET_NAME}/${storagePath}`; no GCS API round-trip, no expiry, **no environment branching**: the emulator's `-external-url` gives it the same `<base>/<bucket>/<path>` serving shape as real public GCS buckets, so only the configured base differs between dev and prod — exactly like `DB_HOST`/`FRONTEND_URL`/`GCS_BUCKET_NAME` already do
  - `copy(sourcePath: string, destinationPath: string): Promise<void>` — server-side object copy, private bucket → public bucket (`file.copy()`)
- `GenerateHotsiteImageSignedUrlUseCase` generates the upload signed URL **against the public bucket** — this is the single point where the image's destination is decided, since a signed URL is cryptographically bound to a specific bucket+path; everything downstream (storing `filePath`, resolving to a public URL) only needs the static fact "hotsite images live in the public bucket," not a per-request decision
- `GetHotsiteManifestUseCase` / `GetHotsiteContentUseCase` resolve every stored `filePath` (`branding.logoUrl`, module `backgroundImageUrl`/`imageUrl`/`avatarUrl`, `GalleryImage.url`) to a permanent public URL via `getPublicUrl()` before returning — both the public manifest and the admin endpoint use the same resolution, one code path regardless of `GalleryImage.source`
- New use case `FeatureBookingPhotoUseCase` + BFF endpoint `POST /v1/tenants/hotsite/gallery/feature-booking-photo` — `{ bookingId, photoUrl }`:
  - Loads the `Booking` by `(tenantId, bookingId)` via a new platform-side port `IBookingLookupPort` (`application/ports/booking-lookup.port.ts`), implemented by `BookingLookupAdapter` (`infrastructure/cross-context/`) — which injects a new `BookingQueryService` exported from `booking.module.ts`. This is the documented cross-context pattern (`docs/AGENT_PATTERNS.md` §8 — "`XxxQueryService` — export only when another context's adapter injects it"; canonical example `customer.module.ts` → `CustomerQueryService`/`CustomerInfoAdapter`), **not** the older direct-`DataSource` precedent in `ServiceCatalogAdapter`/`ServiceInfoAdapter`. The port returns a minimal summary `{ id, customerId, beforeServicePhotoUrls, afterServicePhotoUrls } | null` — works identically for guest-originated (`customerId: null`) and authenticated-customer bookings; `tenantId` is the only isolation boundary
  - Derives `photoType` **server-side** by checking whether `photoUrl` is present in `booking.beforeServicePhotoUrls` or `booking.afterServicePhotoUrls` — never trusts a client-supplied label. A `photoUrl` found in neither list → `400` (this doubles as the "does this photo actually belong to this booking" integrity check)
  - Copies the file to `tenants/<tenantId>/hotsite/gallery/<uuid>/<fileName>` in the public bucket via `IStorageService.copy()`
  - Returns `{ filePath, url, photoType }`
- `UpdateHotsiteContentUseCase`'s `exists()` check now validates every gallery image — `source: 'upload'` and `source: 'booking'` alike — against the public bucket uniformly (no branching by origin)
- `PublishHotsiteUseCase` / `UnpublishHotsiteUseCase` call a new internal port `IFrontendRevalidationPort` after persisting, hitting `${FRONTEND_URL}/api/revalidate?secret=${HOTSITE_REVALIDATE_SECRET}&slug=<tenant.slug>` for that tenant. New env var `HOTSITE_REVALIDATE_SECRET` (≥32 chars — same convention as `PLATFORM_ADMIN_KEY`/`INTERNAL_API_KEY`) is the shared secret verified by the route built in M12-S03 — **both stories must use this exact name**. The adapter **catches and logs** any failure (network error, 404, secret mismatch) — publish/unpublish always succeed regardless, both because ISR's 5-minute fallback already covers the gap and because M12-S10 ships *before* M12-S03's route exists (see `Blocks` below), so the call is expected to 404 until that story lands

**`GalleryImage` contract addition** (`packages/types/src/hotsite.ts`, `docs/15` §4 — JSONB `data` field, no migration required):
```typescript
interface GalleryImage {
  url: string;
  caption?: string;
  source: 'booking' | 'upload';
  bookingId?: string;                 // present when source === 'booking'
  photoType?: 'before' | 'after';     // present when source === 'booking' — derived server-side, lets the frontend label "Antes"/"Depois"
}
```

**Acceptance criteria:**
- [ ] `POST /v1/tenants/hotsite/images/signed-url` issues an upload URL targeting the public bucket; the resulting object resolves to a permanent public address (no expiry, no regeneration)
- [ ] `GET /v1/tenants/slug/:slug` (public manifest) returns `branding.logoUrl` / module `*Url` / `GalleryImage.url` as resolved public URLs — not raw `filePath` strings
- [ ] `GET /v1/tenants/hotsite` (admin) returns the same resolved public URLs — one resolution code path for both endpoints
- [ ] `POST /v1/tenants/hotsite/gallery/feature-booking-photo` copies the selected photo into the public bucket and returns `{ filePath, url, photoType }`; only `MANAGER` role — `STAFF` returns `403`
- [ ] `photoType` is correctly derived as `'before'` or `'after'` depending on which list (`beforeServicePhotoUrls` / `afterServicePhotoUrls`) the submitted `photoUrl` is found in
- [ ] A `photoUrl` not present in either list on the target booking → `400`
- [ ] Featuring works identically for a guest-originated booking (`customerId: null`) and an authenticated-customer booking — only `tenantId` gates access
- [ ] Tenant isolation: a `MANAGER` JWT scoped to Tenant A cannot feature a photo from Tenant B's booking — `404`/`400`, and Tenant B's data is unaffected
- [ ] A featured gallery image persists independently of the source booking — archiving/deleting the booking does not break the gallery entry
- [ ] `UpdateHotsiteContentUseCase` `exists()` validates all gallery images (both `source` values) against the public bucket uniformly
- [ ] Publishing or unpublishing a hotsite triggers revalidation of `/<slug>` — the change is visible immediately, without waiting for ISR's 5-minute window
- [ ] Booking-photo signed-URL flow (private bucket, regenerate-at-display, 15-minute expiry, `IStorageService.exists()` checks from M12-S02) is unchanged — this story touches hotsite-owned paths only

**Dependencies:** M12-S01, M12-S02, M115-S01  
**Blocks:** M12-S03 — changes the manifest's `*Url` field contract (resolved public URL vs. raw `filePath`); must land first

---

### M12-S11 — Hotsite branding: button color overrides ✅ Done

> **Implementation note:** folded into the current `feat/M12-S04-hero-module` branch (PR #98) — this story modifies `HeroModule.tsx`, which that branch introduces, so it ships as part of the same PR rather than a separate `feat/M12-S11-*` branch.

**Agent:** `backend-ts` + `frontend-ts`  
**Complexity:** M  
**Docs to load:** `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` § Branding & Design Token System · `docs/14-API_CONTRACTS.md` § Tenant Hotsite Manifest / Hotsite Admin Management

**Description:**  
Add two optional hex tokens, `buttonBackgroundColor` and `buttonTextColor`, so a tenant's CTA button color can be set independently of `primaryColor`. Today every button color is derived from `primaryColor` + `buttonStyle` via `BTN_STYLES` in `apply-branding.ts`. When a section's background is also `var(--ba-primary)` (e.g. the `left-aligned` HERO variant, or `centered` without a background image), a `filled` button's fill and border become identical to the section behind it — the button is effectively invisible. These two fields are optional overrides: when unset, `applyBranding()` produces output identical to today (zero impact on existing tenants); when set, they take precedence. For `outline`/`ghost` styles — which have no permanent fill to recolor — `buttonBackgroundColor` instead drives a **hover-fill** effect via a new `--ba-btn-hover-bg` token.

**Field semantics:**
- `buttonBackgroundColor?: string` (hex):
  - `buttonStyle: 'filled'` — overrides `--ba-btn-bg` **and** `--ba-btn-border` (the button's permanent fill/border color)
  - `buttonStyle: 'outline' | 'ghost'` — sets the new `--ba-btn-hover-bg` token: the button's background fills with this color **on hover only**; the resting state stays `transparent` (unchanged)
  - Unset → `--ba-btn-hover-bg` defaults to `--ba-btn-bg` for `filled` (hover is a visual no-op, since the background doesn't change) and to `transparent` for `outline`/`ghost` (today's behavior — `hover:opacity-90` remains the only hover effect, byte-identical output)
- `buttonTextColor?: string` (hex) — overrides `--ba-btn-text` for all three styles, and additionally `--ba-btn-border` for `outline` (border mirrors text in the outline style, same as today's `var(--ba-primary)` derivation). Text color does **not** change on hover — same trust-the-palette assumption as `filled`'s white-on-`primaryColor` default; the admin picks a `buttonBackgroundColor` hover-fill that contrasts with their chosen `buttonTextColor`.

**New CSS token:** `--ba-btn-hover-bg`, consumed by `HeroModule.tsx`'s CTA via a Tailwind arbitrary-value hover class.

**Backend (`apps/backend/src/contexts/platform/`):**
- `HotsiteBranding` (`domain/hotsite-config.aggregate.ts`) — add `buttonBackgroundColor?: string; buttonTextColor?: string;`
- `validateBranding()` — if either field is present, validate via `HexColor.isValid` (same `PlatformDomainError` message pattern as the 4 existing hex fields: `primaryColor`, `secondaryColor`, `backgroundColor`, `textColor`); absent values are not validated
- **Not** added to `DEFAULT_HOTSITE_BRANDING` — purely additive; existing tenant rows (jsonb without these keys) remain valid, no migration required
- `HotsiteBrandingSchema` (`application/dtos/update-hotsite-content.dto.ts`) — add both fields as `.optional()` hex-validated strings (schema is already `.partial()`)

**BFF (`apps/bff/src/tenants/hotsite-admin.controller.ts`):**
- `HotsiteBrandingBodySchema` is a separate `.partial()` Zod object (default "strip" mode) that re-validates the branding payload before forwarding it to the backend. Add `buttonBackgroundColor`/`buttonTextColor` as `z.string().regex(HEX_COLOR_REGEX)` here too — without this, `PATCH /v1/tenants/hotsite` silently drops both fields (Zod strips unrecognized keys by default), so the "persists and round-trips" AC would fail end-to-end despite backend/frontend tests passing.
- `hotsite-admin.controller.spec.ts` — add a `describe('UpdateHotsiteContentBodySchema', ...)` block asserting both fields round-trip through `.parse()` unstripped, and that invalid hex values fail `.safeParse()`.

**Shared types (`packages/types/src/hotsite.ts`):**
- `HotsiteBrandingResponse` — add `buttonBackgroundColor?: string; buttonTextColor?: string;`

**Frontend (`apps/web/lib/hotsite/apply-branding.ts`):**
- `--ba-btn-bg`, `--ba-btn-text`, `--ba-btn-border`, and the new `--ba-btn-hover-bg` derive from the override fields when present, falling back to the current `BTN_STYLES`-derived values / defaults otherwise (per the field semantics above)

**Frontend (`apps/web/components/hotsite/HeroModule.tsx`):**
- CTA `<a>` className gains `hover:bg-[var(--ba-btn-hover-bg)]` (Tailwind arbitrary value referencing the new token); `transition-opacity` becomes `transition-colors` (or is extended) so the hover background-color change animates smoothly
- `HeroModule.spec.tsx` — assert the CTA className includes `hover:bg-[var(--ba-btn-hover-bg)]`

**Docs:**
- Update `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §2 — add the 2 new fields and `--ba-btn-hover-bg` to the `HotsiteBranding` token definition snippet and the `applyBranding()` CSS variable mapping snippet, with a one-line note on the filled-fill / outline-ghost-hover-fill semantics
- Update `docs/14-API_CONTRACTS.md` — add `buttonBackgroundColor`/`buttonTextColor` (both optional) to the canonical `branding` JSON example shared by the public manifest and `GET/PATCH /v1/tenants/hotsite`, with a one-line validation note

**Acceptance criteria:**
- [ ] `buttonBackgroundColor`/`buttonTextColor` both unset → `applyBranding()` output identical to current behavior for all 3 `buttonStyle` values, including `--ba-btn-hover-bg` (regression — existing `apply-branding.spec.ts` cases unchanged)
- [ ] `buttonStyle: 'filled'`, `buttonBackgroundColor: '#fbbf24'` → `--ba-btn-bg` = `--ba-btn-border` = `--ba-btn-hover-bg` = `#fbbf24`
- [ ] `buttonStyle: 'filled'`, `buttonTextColor: '#0f172a'` → `--ba-btn-text` = `#0f172a`
- [ ] `buttonStyle: 'outline'`, `buttonTextColor: '#0f172a'` → `--ba-btn-text` = `--ba-btn-border` = `#0f172a`
- [ ] `buttonStyle: 'outline'`, `buttonBackgroundColor: '#fbbf24'` → `--ba-btn-bg` remains `transparent`; `--ba-btn-hover-bg` = `#fbbf24`
- [ ] `buttonStyle: 'outline'`, `buttonBackgroundColor` unset → `--ba-btn-hover-bg` = `transparent` (current hover behavior preserved)
- [ ] `buttonStyle: 'ghost'`, `buttonTextColor: '#0f172a'` → `--ba-btn-text` = `#0f172a`; `--ba-btn-border` remains `transparent`
- [ ] `buttonStyle: 'ghost'`, `buttonBackgroundColor: '#fbbf24'` → `--ba-btn-hover-bg` = `#fbbf24`
- [ ] `PATCH /v1/tenants/hotsite` with `branding: { buttonBackgroundColor: "#fbbf24" }` persists and round-trips via `GET /v1/tenants/hotsite` and the public manifest
- [ ] `buttonBackgroundColor: "notacolor"` → `400` (invalid hex)
- [ ] Existing tenant rows (no `buttonBackgroundColor`/`buttonTextColor` in stored jsonb) — a PATCH that doesn't touch these fields continues to succeed (no `validateBranding()` regression for missing optional fields)
- [ ] `HeroModule.spec.tsx` — CTA `<a>` className includes `hover:bg-[var(--ba-btn-hover-bg)]`
- [ ] `tsc --noEmit` passes across the monorepo (`apps/backend`, `packages/types`, `apps/web`)

**Dependencies:** M12-S02, M12-S03, M12-S04

---

### M12-S12 — ESLint: react-hooks + jsx-a11y rules for apps/web ✅ Done

**Agent:** `frontend-ts`  
**Complexity:** S  
**Docs to load:** `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` § linting, `docs/CODE_STANDARDS.md`

**Description:**  
`docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` §3 mandates `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y` for `apps/web`, but neither is installed anywhere in the monorepo. Without `react-hooks`, Rules-of-Hooks violations (conditional hooks, stale closures from missing `useEffect`/`useMemo`/`useCallback` deps) go undetected until runtime — a real risk once M12-S07 (booking form state) and M13 (TanStack Query hooks throughout the dashboard) land. Without `jsx-a11y`, accessibility issues (missing `alt`, invalid ARIA attributes, non-interactive elements with click handlers, etc.) aren't caught in CI — relevant since BeloAuto hotsites are public-facing for small businesses unlikely to run their own a11y audits.

**What to do:**
- Add `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y` to `apps/web` devDependencies
- Apply both plugins' recommended flat-config presets in `apps/web/eslint.config.js`, scoped to `apps/web` only — do **not** touch `packages/config/eslint-base.js` (backend/BFF have no JSX or hooks)
- Fix any violations the new rules surface in existing code (`HeroModule.tsx`, `[slug]/page.tsx`, `[slug]/layout.tsx`, `Footer.tsx`, etc.) — mechanical fixes only (e.g. `alt` text, hook dependency arrays); no behavioral changes
- No `// eslint-disable` comments — if a rule produces a false positive, narrow the rule's config instead

**Acceptance criteria:**
- [ ] `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y` present in `apps/web` devDependencies
- [ ] Recommended rule sets from both plugins applied in `apps/web/eslint.config.js`, scoped to `apps/web`'s `.tsx`/`.ts` files
- [ ] `pnpm lint` (apps/web) passes with zero errors/warnings
- [ ] Any pre-existing violations surfaced by the new rules are fixed, not suppressed
- [ ] `pnpm type-check` and `pnpm test` (apps/web) continue to pass

**Dependencies:** None — tooling-only, independent of other M12 stories
