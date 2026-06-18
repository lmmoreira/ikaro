# M12 — Hotsite Frontend: Implementation Details (Developer Reference)

> **Who this is for:** A developer continuing work on `apps/web` (M13+ dashboard, future hotsite stories) who wants to understand *why* M12 is built the way it is — not just what files exist. Pairs with `docs/lean/WEB_LEAN.md` (concept-by-concept learning journal) and `plan/M12-HOTSITE-FRONTEND_IMPLEMENTATION_DETAILS_IA.md` (token-efficient artifact reference).

---

## What M12 Built

- **M12-S01** — `HotsiteConfig` aggregate (Platform context) + public manifest endpoint `GET /v1/tenants/slug/:slug`: 10-token `branding` object, ordered `layout` of typed modules, `isPublished` flag. `DEFAULT_HOTSITE_BRANDING` covers tenants that haven't configured a hotsite yet.
- **M12-S02** — UC-027 admin hotsite management: `UpdateHotsiteContentUseCase`, `PublishHotsiteUseCase`/`UnpublishHotsiteUseCase`, `GenerateHotsiteImageSignedUrlUseCase`. Publish is gated by `IStorageService.exists()` checks on every referenced image (`HotsiteImageNotUploadedError`/`BookingPhotoNotUploadedError`).
- **M12-S03** — The Next.js foundation: `app/[slug]/layout.tsx` + `page.tsx`, ISR (`revalidate: 300`), `applyBranding()` → CSS custom properties, 8-font allow-list via `next/font/google`, shared `@ikaro/types` package, on-demand revalidation route (`/api/revalidate`).
- **M12-S04** — First module component, `HeroModule`, plus the component-testing infrastructure every later module reuses: Vitest + jsdom + `@testing-library/react`, global `next/image`/`next/font/google` aliases.
- **M12-S05** — `ServiceListModule`; `fetchServices(slug)`; `HotsiteServiceResponse`/`HotsiteServiceListResponse` promoted to `@ikaro/types`; new `ServicesPublicController`.
- **M12-S06** — `GalleryModule`, `TestimonialsModule`, `AboutModule`, `ContactModule`; `BusinessInfo`/`BusinessInfoAddress` VOs on `tenants.settings`; the Islands Pattern (`GalleryGrid`, `TestimonialsCarousel`); Markdown rendering via `react-markdown` + `rehype-sanitize`.
- **M12-S07** — `BookingCtaModule` + the full 4-step booking form (`components/booking/*`); `AddressLookup` port with a ViaCEP adapter; 3-step signed-URL photo upload; `@ikaro/types` booking/schedule/money contracts replaced wholesale.
- **M12-S08** — Root `app/not-found.tsx` (404 for unknown slugs) and `Unavailable` component ("Em breve" for unpublished hotsites) — two distinct `200`/`404` outcomes that were previously conflated.
- **M12-S09** — Per-tenant SEO: `seo jsonb` column on `hotsite_configs`, `buildHotsiteMetadata`/`buildLocalBusinessJsonLd`/`toJsonLdScript`, `app/sitemap.ts`/`app/robots.ts`, `ListPublishedHotsitesUseCase`.
- **M12-S10** — Separate public GCS bucket for hotsite images (permanent URLs, no signed-URL expiry); `FeatureBookingPhotoUseCase` (promote a completed booking's photo into the gallery); publish/unpublish trigger on-demand revalidation.
- **M12-S11** — `buttonBackgroundColor`/`buttonTextColor` branding overrides + new `--ba-btn-hover-bg` token, so CTA buttons stay visible against a primary-colored section background.
- **M12-S12** — `eslint-plugin-react-hooks` + `eslint-plugin-jsx-a11y` wired into `apps/web/eslint.config.js`.

---

## The Hotsite Manifest: One Endpoint, Many Consumers

Every tenant's public hotsite is driven by a single response shape, `HotsiteManifestResponse` (`packages/types/src/hotsite.ts`):

```typescript
interface HotsiteManifestResponse {
  tenant: { name: string; slug: string };
  branding: HotsiteBrandingResponse;       // 10 design tokens
  layout: HotsiteModuleResponse[];          // ordered, typed modules
  isPublished: boolean;
  business: HotsiteBusinessInfoResponse;    // phone/email/address/social links
  seo: { title: string | null; description: string | null };
  localization: { language: string };
}
```

**Backend analogy:** this is a single "page DTO" — like a NestJS controller returning one aggregated read model instead of forcing the client to call five endpoints. The `HotsiteController` (`infrastructure/controllers/hotsite.controller.ts`) assembles it via `GetHotsiteManifestUseCase`, which reads the `HotsiteConfig` aggregate (`branding` + `layout`, both JSONB) and the `Tenant` aggregate's `settings.business_info`.

**Why one endpoint instead of "branding API" + "modules API" + "business info API"?** `[slug]/layout.tsx` and `[slug]/page.tsx` both need this data on every request (subject to ISR caching). One `fetch()` with `next: { revalidate: 300 }` means Next.js deduplicates and caches a single response — splitting it into multiple endpoints would multiply round trips without buying independent cache lifetimes (they all change together, on publish).

The **same shape** (minus tenant-internal fields) is also returned by the **admin** endpoint `GET /v1/tenants/hotsite` — `GetHotsiteContentUseCase` shares the image-resolution logic with `GetHotsiteManifestUseCase` so there is exactly one code path that turns a stored `filePath` into a URL (see "Image Storage" below).

---

## Module Components: Data-Driven Layout

`HotsiteConfig.layout` is a JSON array of `{ type: HotsiteModuleType; data: unknown }`. `[slug]/page.tsx` doesn't know what modules exist — it iterates the array and looks up each `type` in `MODULE_MAP`:

```typescript
// lib/hotsite/module-schemas.ts
const MODULE_DATA_SCHEMAS: Partial<Record<HotsiteModuleType, z.ZodType>> = {
  HERO: HeroModuleDataSchema,
  SERVICE_LIST: ServiceListModuleDataSchema,
  GALLERY: GalleryModuleDataSchema,
  TESTIMONIALS: TestimonialsModuleDataSchema,
  ABOUT: AboutModuleDataSchema,
  CONTACT: ContactModuleDataSchema,
  BOOKING_CTA: BookingCtaModuleDataSchema,
};
```

For each layout entry, `isValidModuleData(type, data)` runs the matching Zod schema. **Valid → render. Invalid or unrecognized type → skip that module, render the rest of the page.** This mirrors `ZodValidationPipe` on an HTTP boundary, except the "untrusted input" is JSONB the *admin* wrote via the dashboard (M13), not an HTTP client — a typo in a module's `data` shouldn't take down the whole public hotsite.

**The `satisfies z.ZodType<XxxModuleData>` pattern** keeps the Zod schema and the TypeScript interface from drifting: if `HeroModuleData` in `@ikaro/types` gains a field but `HeroModuleDataSchema` doesn't, `satisfies` produces a **compile-time** error at the schema definition — caught by `tsc`, not discovered when a tenant's hero section silently stops rendering a field.

**Adding a new module type** is a 4-step checklist: (1) add `XxxModuleData` to `packages/types/src/hotsite.ts`, (2) add `XxxModuleDataSchema satisfies z.ZodType<XxxModuleData>` to `MODULE_DATA_SCHEMAS`, (3) add the component to `MODULE_MAP`, (4) write `XxxModule.spec.tsx`. Skipping step 2 means `isValidModuleData` returns `true` for *anything* (including `null`), and the component receives garbage props.

---

## Branding: A Design-Token System Built on CSS Custom Properties

`HotsiteBrandingResponse` is 10 admin-configurable fields (`primaryColor`, `secondaryColor`, `backgroundColor`, `textColor`, `headingFontFamily`, `bodyFontFamily`, `borderRadius`, `spacing`, `shadowStyle`, `buttonStyle`, plus M12-S11's optional `buttonBackgroundColor`/`buttonTextColor`). `applyBranding()` (`lib/hotsite/apply-branding.ts`) turns these into ~15 `--ba-*` CSS custom properties, applied once via inline `style` on `[slug]/layout.tsx`'s root `<div>`. Every module component then writes plain CSS referencing `var(--ba-primary)`, `var(--ba-radius)`, etc.

**Backend analogy:** this is a *mapper*, the same role as a TypeORM repository's `toDomain()`/`toEntity()` — it translates one representation (admin-facing enum values like `borderRadius: 'rounded'`) into another (`--ba-radius: 8px`) at a single seam, so the 7+ module components never need to know the enum exists.

**Why CSS variables instead of, say, Tailwind config or inline conditionals per component?** Tailwind's config is static at build time — it can't vary per *request* (per tenant). CSS custom properties can be set per-element at render time and inherited by every descendant, so one `applyBranding()` call at the layout root re-themes the entire subtree. Each module then uses **static** Tailwind classes (`bg-[var(--ba-primary)]`) — Tailwind sees a fixed class name; the *value* the variable resolves to varies per tenant.

**M12-S11's button-color overrides** are a worked example of extending this system without breaking existing tenants. `deriveButtonTokens()`:

```typescript
function deriveButtonTokens(branding: HotsiteBrandingResponse): ButtonTokens {
  const base = BTN_STYLES[branding.buttonStyle] ?? BTN_STYLES.filled;
  const { buttonBackgroundColor, buttonTextColor } = branding;
  const isFilled = branding.buttonStyle === 'filled';
  const isOutline = branding.buttonStyle === 'outline';

  const bg = isFilled && buttonBackgroundColor ? buttonBackgroundColor : base.bg;
  const border =
    isFilled && buttonBackgroundColor
      ? buttonBackgroundColor
      : (isOutline && buttonTextColor) || base.border;
  const text = buttonTextColor ?? base.text;
  const hoverBg = isFilled ? bg : (buttonBackgroundColor ?? 'transparent');

  return { bg, text, border, hoverBg };
}
```

Two optional fields, both `undefined` for every pre-existing tenant row (no migration needed — JSONB just doesn't have the keys). When `undefined`, every branch above falls through to `base.*` — **byte-identical output to before S11**. The new `--ba-btn-hover-bg` token solves a real bug: a `filled` button on a section whose background is *also* `var(--ba-primary)` (e.g. `HeroModule`'s `left-aligned` variant) was invisible — same fill color as its surroundings. Now an admin can set a contrasting `buttonBackgroundColor`.

**The trap this story almost fell into:** the BFF's `hotsite-admin.controller.ts` has its **own** `.partial()` Zod schema (`HotsiteBrandingBodySchema`) that re-validates the `PATCH /v1/tenants/hotsite` body before forwarding to the backend. Zod objects strip unrecognized keys by default — adding a field to the backend's `HotsiteBrandingSchema` *and* `packages/types` but forgetting the BFF schema means the field is silently dropped at the BFF hop. Backend tests pass (the backend never sees the field), frontend tests pass (the frontend sends it), and the end-to-end "persists and round-trips" acceptance criterion is the only thing that catches it. **Whenever you add a field to a branding/content shape that crosses the BFF, grep for every Zod schema describing that shape — there's often more than one.**

---

## The Islands Pattern: Server-Rendered Content, Client-Side Interactivity

`GalleryModule` and `TestimonialsModule` are Server Components — they receive fully-resolved `data`/`business` props and return JSX synchronously, no `'use client'`. But a gallery needs a "Ver mais" expand button, and a testimonials carousel needs prev/next controls — both require `useState`.

The solution is to split each into two files:

```
GalleryModule.tsx      (server) — renders <section>, all <img> tags, passes images[] down
  └── GalleryGrid.tsx  ('use client') — thin wrapper: useState for "expanded", toggles
                                         a data-attribute, CSS shows/hides extras
```

**Backend analogy:** this is the same instinct as keeping a NestJS controller thin and pushing logic into a use case — except inverted. Here, the *parent* (server) does all the heavy lifting (fetching is already done by the time it renders; it just maps data to markup), and the *child* (client) is the minimal "island" of interactivity. The smaller the client island, the less JavaScript ships to the browser — `GalleryModule`'s `<img>` tags are server-rendered HTML; only the expand/collapse *behavior* is client-side.

The expand/collapse itself uses a **CSS data-attribute pattern**, not conditional rendering: all images render in the initial HTML (good for SEO/LCP — search engines see every image), extras get `data-gallery-extra` and a class that sets `display: none` until the wrapper has `data-gallery-expanded="true"`. Clicking "Ver mais" just flips one attribute — no re-render of the image list, no layout shift from images mounting late.

---

## The Booking Form: Multi-Step State on the Client

`BookingForm.tsx` is the most stateful component in the codebase — a `'use client'` component owning **all** state for a 4-step wizard:

```typescript
type Step = 1 | 2 | 3 | 4;
const [step, setStep] = useState<Step>(1);
const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
const [selectedDate, setSelectedDate] = useState<string | null>(null);
const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
const [personalInfo, setPersonalInfo] = useState<PersonalInfoValue>(emptyPersonalInfo());
const [status, setStatus] = useState<BookingSubmissionStatus>('idle');
```

**Backend analogy:** if a NestJS use case were a long-running saga with multiple steps, each step's "input" would be validated and persisted before moving to the next — but the *whole saga* would still be one transaction context. `BookingForm` is that saga's in-memory context: each step component (`ServiceSelectionStep`, `PersonalInfoStep`, etc.) is a "pure function of props" that calls back up via `onChange`/`onNext`/`onBack` — they never hold their own copies of shared state ("lifting state up"). This is *the* idiomatic React pattern for multi-step forms: one owner, many dumb children.

Step 2 is the trickiest because it's a **two-phase fetch**: selecting services doesn't fetch slots directly — it first fetches a 14-day *availability summary* (`fetchAvailabilitySummary` → `DaySummary[]`, rendered as a horizontal carousel of day-cards), and only *after* the user picks a day does `AvailabilityCarousel` trigger `fetchAvailability(slug, date, serviceIds)` for that day's actual time slots. This avoids fetching 14 days × N slots upfront when the user will only look at 1-2 days.

**Error handling crosses a layer boundary deliberately.** `createBooking()` throws a custom `CreateBookingError` (with a `.status` field) rather than a generic `Error`:

```typescript
try {
  await createBooking(slug, payload);
  setStatus('success');
} catch (err) {
  if (err instanceof CreateBookingError && err.status === 409) {
    setStatus('idle');
    setStep2Error('Horário indisponível, escolha outro');
    setStep(2);          // ← send the user back to re-pick a slot
    return;
  }
  setStatus('error');
  setErrorMessage('Não foi possível enviar sua solicitação. Tente novamente.');
}
```

A `409` (the slot was taken by someone else between Step 2 and Step 4) isn't a generic failure — it's actionable, so the UI routes the user back to the step where they can fix it. This is the frontend's version of mapping a domain error to a specific recovery path, the same spirit as `mapXxxError` on the backend, just with UI navigation instead of an HTTP status code as the "effect."

---

## Ports & Adapters on the Frontend: Address Lookup

The CEP (Brazilian postal code) autofill is implemented as a port + adapter, the same pattern as `IStorageService`/`GcsSignedUrlAdapter` on the backend:

```typescript
// lib/address/address-lookup.port.ts
export interface AddressLookup {
  lookup(cep: string): Promise<AddressLookupResult | null>;
}

// lib/address/viacep-address-lookup.adapter.ts
export const viaCepAddressLookup: AddressLookup = {
  async lookup(cep) {
    const digits = digitsOnly(cep);
    if (digits.length !== 8) return null;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.erro || !data.logradouro) return null;
      return { street: data.logradouro, neighborhood: data.bairro ?? '', city: data.localidade ?? '', state: data.uf ?? '' };
    } catch {
      return null;
    }
  },
};
```

`AddressFields` takes `addressLookup: AddressLookup = viaCepAddressLookup` as a **prop with a default**. There's no DI container in Next.js (unlike NestJS, where you'd register a provider token) — a default-valued constructor parameter is the idiomatic frontend equivalent. Production code never passes the prop and gets ViaCEP; tests pass `new InMemoryAddressLookup({ '01001000': {...} })` and get deterministic, network-free results. If Ikaro ever switches to a paid/Google-based address API, only the adapter file and the default change — `AddressFields` and every caller are untouched.

Every failure mode — network error, CEP not found (`{ erro: true }`), malformed response — collapses to `null`. The caller's contract is simple: `null` means "couldn't autofill, let the user type it manually." No error ever blocks form progress; CEP lookup is a convenience, not a validation gate.

---

## SEO: Making Each Tenant Discoverable

Before M12-S09, every tenant's hotsite rendered `<title>Ikaro</title>` — useless for Google search or WhatsApp link previews, both critical for small Brazilian businesses. The fix has three layers:

**1. Per-page metadata via `generateMetadata`.** Next.js calls this *server-side function* (not a static export) before rendering, letting metadata depend on fetched data:

```typescript
// app/[slug]/page.tsx
export async function generateMetadata({ params }: HotsitePageProps): Promise<Metadata> {
  const { slug } = await params;          // Next.js 16: params is a Promise
  const manifest = await fetchManifest(slug);  // same ISR-cached call page.tsx itself makes
  return buildHotsiteMetadata({ manifest, slug });
}
```

Because `fetchManifest` uses `next: { revalidate: 300 }`, Next.js **deduplicates** this call with the one `page.tsx`'s render makes for the same request — `generateMetadata` does not double the network traffic.

**2. Tenant-configurable overrides.** `buildHotsiteMetadata` computes a *default* title/description (`"<Tenant Name> — Agendamento Online em <City>, <State>"`), but `manifest.seo.title`/`manifest.seo.description` — new `jsonb` columns on `hotsite_configs` (migration `1748400000001-AddSeoToHotsiteConfigs`), edited via the admin dashboard — take precedence when set. Defaults mean a tenant who never touches SEO settings still gets a reasonable, location-aware title; an ambitious tenant can write their own copy for search ranking.

**3. Structured data and crawl directives.** `[slug]/page.tsx` embeds a `LocalBusiness` JSON-LD block via `toJsonLdScript()` — which exists *solely* to escape `<` to `<`, because `JSON.stringify` will happily emit a literal `</script>` if a tenant's name contains that string, breaking out of the `<script type="application/ld+json">` tag (a real XSS vector — tenant-controlled data ends up in this string). `app/sitemap.ts` and `app/robots.ts` are **file-convention routes** — Next.js recognizes these filenames and serves `/sitemap.xml`/`/robots.txt` automatically, no manual route registration. `sitemap.ts` calls a new endpoint, `GET /platform/published-hotsites` (backed by `ListPublishedHotsitesUseCase`, joining `tenants` and `hotsite_configs` *within* the Platform context — not a cross-context join), to enumerate every `is_active && is_published` tenant.

The booking page (`[slug]/booking/page.tsx`) is **always** `noindex, nofollow` regardless of `isPublished` — there's no SEO value in a search engine indexing a multi-step form, and indexing it could expose draft/unpublished tenants' booking URLs.

---

## Two Kinds of "Not Ready": 404 vs Unpublished

M12-S08 fixed a conflation that existed since M12-S01: both "this slug doesn't exist" and "this tenant exists but hasn't published yet" returned the same `404`, discarding the branding data needed to render anything tenant-specific for the second case.

```
Unknown slug          → TenantNotFoundError → notFound() in [slug]/layout.tsx → root app/not-found.tsx (generic, Ikaro-branded)
isPublished: false     → 200, minimal stub  → [slug]/page.tsx renders <Unavailable /> ("Em breve", tenant-branded)
```

The **stub response** for unpublished tenants is deliberately minimal — `{ branding: config.branding, layout: [], isPublished: false, business: <all-null> }`. It skips `imageUrlResolver.resolve()` and the tenant/`business_info` lookup entirely, because `<Unavailable />` only needs `branding` (for its `var(--ba-*)` tokens, so the placeholder is on-brand) — `layout`/`business` would otherwise leak the admin's *draft* content through a **public, unauthenticated** endpoint. The full draft state remains available to the admin via the authenticated `GET /v1/tenants/hotsite`.

The Next.js routing detail worth internalizing: **`app/[slug]/not-found.tsx` cannot catch a `notFound()` call made inside `app/[slug]/layout.tsx`** — Next.js only lets an *ancestor* segment's `not-found.tsx` handle a `notFound()` thrown by a segment's own layout. Hence `app/not-found.tsx` lives at the **root**, one level above `[slug]`.

---

## Image Storage: Public vs Private Buckets

M12-S01/S02 routed *all* hotsite images (logos, hero backgrounds, gallery photos) through the same private-bucket-plus-signed-URL pattern used for booking attachment photos. That's correct for booking photos (genuinely private, customer-specific) but wrong for marketing assets that are public by definition — and it actively conflicted with ISR: a cached manifest (`Cache-Control: public, max-age=300`) could embed a signed URL that **expires before the cache revalidates**, serving broken images.

M12-S10's fix: hotsite images get a **separate public GCS bucket** (`GCS_PUBLIC_BUCKET_NAME`, `allUsers: roles/storage.objectViewer`) with permanent addresses:

```typescript
// IStorageService — new method, pure string template, no GCS API call
getPublicUrl(storagePath: string): string {
  return `${GCS_PUBLIC_BASE_URL}/${GCS_PUBLIC_BUCKET_NAME}/${storagePath}`;
}
```

`GenerateHotsiteImageSignedUrlUseCase` issues the **upload** signed URL against the public bucket — a signed URL is cryptographically bound to a bucket+path, so this is the *only* point where "hotsite images live in the public bucket" is decided. Everything downstream (`GetHotsiteManifestUseCase`/`GetHotsiteContentUseCase` calling `getPublicUrl()` on every stored `filePath`) just needs that static fact, not a per-request branch.

**The "feature a booking photo" use case** (`FeatureBookingPhotoUseCase`, `POST /v1/tenants/hotsite/gallery/feature-booking-photo`, `MANAGER`-only) is the interesting cross-context piece: an admin wants to put a *customer's before/after photo* (private bucket, booking-owned) into the *public gallery* (public bucket, hotsite-owned). Rather than a live reference (which would re-create the caching problem and couple the gallery's lifecycle to the booking's), the use case **copies** the object:

```typescript
// 1. Look up the booking via a port — Platform context doesn't own Booking
const booking = await this.bookingLookup.findById(tenantId, bookingId);
// 2. Derive photoType server-side — never trust the client's label
const photoType = booking.beforeServicePhotoUrls.includes(photoUrl) ? 'before'
                : booking.afterServicePhotoUrls.includes(photoUrl) ? 'after'
                : throwBadRequest();
// 3. Copy private → public bucket
await storage.copy(photoUrl, `tenants/${tenantId}/hotsite/gallery/${uuid}/${fileName}`);
```

`IBookingLookupPort` → `BookingLookupAdapter` injecting `BookingQueryService` is the cross-context "query service" pattern (`docs/AGENT_PATTERNS.md` §8): Platform's adapter depends on a *service* the Booking context explicitly exports for this purpose, never on Booking's repository. The resulting `GalleryImage` (`{ url, source: 'booking', bookingId, photoType }`) is a snapshot — archiving the source booking later doesn't break the gallery entry, because the public-bucket copy is independent.

Finally, **publish/unpublish now trigger on-demand revalidation** (`IFrontendRevalidationPort` → `FrontendRevalidationAdapter` → `GET ${FRONTEND_URL}/api/revalidate?slug=...`), so a published change is visible immediately instead of waiting up to 5 minutes for ISR. The adapter **always** catches and logs failures — a `404` (route not deployed yet) or network error must never fail the publish/unpublish operation itself; ISR's timeout is the fallback.

---

## Testing Strategy for a Next.js Frontend

M12 established (and M12-S12 hardened) the testing approach for `apps/web`, distinct from the backend/BFF's Jest setup:

| What | How | Why |
|---|---|---|
| `lib/**` (pure functions, fetchers) | Vitest, `node` environment, no annotation | No DOM needed |
| `components/hotsite/**`, `components/booking/**` | Vitest + `@testing-library/react`, `// @vitest-environment jsdom` per file | Module components are synchronous, prop-driven — testable like any React component |
| `app/**/page.tsx`, `app/**/layout.tsx` | **Not unit-tested** — Playwright E2E only | Require Next.js runtime (`notFound()`, `cookies()`, ISR) unavailable in jsdom |

`next/font/google` and `next/image` are **global aliases** in `vitest.config.ts` (`resolve.alias`), not per-file `vi.mock()` — both have **module-evaluation side effects** (the font loader runs the moment the module is imported, before any test code executes), so a per-file mock is registered too late. `next/navigation`/`next/cache`, by contrast, only matter at *call* time and use ordinary per-file `vi.mock()`.

The booking form's component tests (`AvailabilityCarousel`, `SlotPicker`, `AddressFields`, `PhotoUpload`, `BookingForm`) all `vi.spyOn(globalThis, 'fetch')` to control API responses — and `AddressFields` specifically swaps in `InMemoryAddressLookup` rather than mocking `fetch` for ViaCEP, exercising the port/adapter seam described above. The full booking happy-path (all 4 steps against a running backend) is **Playwright-only**, deferred to M16-S06 — component tests verify each step's logic in isolation, E2E verifies they compose correctly.

M12-S12 added `eslint-plugin-react-hooks` (catches conditional hooks, missing `useEffect`/`useMemo`/`useCallback` dependencies — exactly the bugs a stateful component like `BookingForm` is prone to) and `eslint-plugin-jsx-a11y` (missing `alt`, invalid ARIA, non-interactive elements with click handlers), both scoped to `apps/web/eslint.config.js` only — `packages/config/eslint-base.js` is shared with the backend/BFF, which have no JSX or hooks to lint.
