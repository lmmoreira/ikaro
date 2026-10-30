# Hotsite Dynamic Architecture - Ikaro

> **When to load:** building or changing the tenant hotsite: the server-driven manifest, branding and design tokens, the module library and its data contracts, Next.js routing and SSR, manifest caching, adding a module and SEO; the authenticated dashboard is in `docs/DASHBOARD_FRONTEND_ARCHITECTURE.md`, endpoints in `docs/API_CONTRACTS.md`; it also covers the planned Billing surfaces: the `TRIAL_SIGNUP_CTA` module, the public `/ikaro-trial` pages and the suspended-tenant "Unavailable" hotsite variant.
> **Tags:** web, bff, prototypes

## Overview

Ikaro provides each tenant with a professional, high-conversion hotsite. To support unique visual identities and varied content needs while maintaining a single codebase, we use a **Server-Driven Hotsite Manifest** strategy.

The frontend is a **Rendering Engine** — it reads a manifest from the BFF describing what to show, in what order, and how it should look. No code deployment is needed when a tenant changes their site.

---

## 1. The Hotsite Manifest Pattern

### Manifest Schema

```typescript
// packages/types/src/hotsite.ts
// Simplified — the real contract is `HotsiteManifestResponse extends HotsiteResponse`,
// with additional `business`, `localization`, and optional `booking` fields not shown here.

interface HotsiteResponse {
  branding: HotsiteBrandingResponse;
  layout: HotsiteModuleResponse[];   // ordered — rendered top to bottom
  seo: HotsiteSeoResponse;
  isPublished: boolean;
}

interface HotsiteManifestResponse extends HotsiteResponse {
  tenant: TenantInfoResponse;
  business: HotsiteBusinessInfoResponse;
  localization: HotsiteLocalizationResponse;
  booking?: HotsiteBookingSettingsResponse;
}
```

> **Planned with Billing (UC-122):** `isPublished` becomes the *effective* value — the manager's flag `&&` the tenant being operational (not `SUSPENDED`) — so a suspended tenant gets the same minimal unpublished payload (still `200`, branding kept). The contract note is in `docs/API_CONTRACTS.md` § Billing — Access Resolution and Suspended-State Effects.

Each `layout` entry is `{ type, enabled, data, presentation? }` (TD56). `data` is the module's business content; `presentation` is an optional, closed **section presentation** — a *sibling* of `data`, never a key inside it — described under *Section presentation* in §4. An entry without it renders exactly as it did before TD56. Everything TD56 added fits inside the existing `layout` JSONB: no new top-level manifest key and no migration.

The `layout` array is **ordered and fully controlled by the admin**. The admin can add, remove, and reorder modules freely from the dashboard. The page renders exactly in that order, full-width, top to bottom.

---

## 2. Branding & Design Token System

> **Scope boundary — read this before writing any component that uses colour.**
>
> `--ba-*` CSS custom properties are **hotsite-only**. They are injected by `applyBranding()` inside `app/[slug]/layout.tsx` and are valid exclusively within the `/[slug]/` route subtree — public hotsite pages and all hotsite module components (`shells/hotsite/components/**`).
>
> They are **never** available in:
> - The staff dashboard (`app/dashboard/**`, `shells/dashboard/components/**`)
> - The customer logged-in area (`app/[slug]/my-account/**`, `features/customer/components/**`)
>
> Both of those shells belong to the **SaaS product** whose colours are fixed and not per-tenant — they use Tailwind utility classes and shadcn/ui design tokens (`--primary`, `--secondary`, etc.), not the hotsite branding palette. When in doubt: if a component is visible to a logged-in staff member or inside a protected shell, it does not use `--ba-*`.

Instead of exposing raw CSS to the admin, we use a **semantic design token** system. The admin configures a set of branding tokens (the 11 core tokens below plus optional button-color overrides and visual-rhythm/brand-identity fields) — some are direct values (color pickers, font selectors), others are semantic choices (e.g. "Rounded" instead of "8px"). These tokens are injected as CSS custom properties and inherited by every module automatically.

### Token Definition

```typescript
// packages/types/src/hotsite.ts

interface HotsiteBrandingResponse {
  // — Direct values (admin uses pickers) —
  primaryColor: string;       // hex — buttons, links, highlights
  secondaryColor: string;     // hex — section backgrounds, accents
  backgroundColor: string;    // hex — page background, default #ffffff
  textColor: string;          // hex — body text, default #111827
  headingFontFamily: string;  // e.g. "Playfair Display, serif"
  bodyFontFamily: string;     // e.g. "Inter, sans-serif"
  logoUrl: string;            // GCS URL

  // — Semantic choices (admin picks from options) —
  borderRadius: 'sharp' | 'rounded' | 'pill' | 'soft';
  buttonRadius?: 'sharp' | 'rounded' | 'pill'; // defaults to borderRadius
  headingWeight?: 400 | 500 | 600 | 700 | 800 | 900; // default 700
  headingTransform?: 'none' | 'uppercase'; // default none
  buttonStyle:  'filled' | 'outline' | 'ghost';
  spacing:      'compact' | 'comfortable' | 'spacious';
  shadowStyle:  'none' | 'subtle' | 'strong';

  // — Optional button color overrides (M12-S11) — see "Button Color Tokens" below —
  buttonBackgroundColor?: string; // hex
  buttonTextColor?: string;       // hex

  // — Visual rhythm (optional) —
  heroBgStyle?: 'primary' | 'background';   // hero section background; default primary
  alternateSectionBg?: boolean;              // alternate every other enabled module's background ('alt' variant)
  dividerStyle?: 'none' | 'gradient' | 'solid'; // divider rendered between sections

  // — Brand identity (optional; used by the brand-card rightPanel in hero/booking-cta) —
  brandName?: string;
  brandTagline?: string;
}
```

`alternateSectionBg` is not a CSS variable: the page model (`buildHotsiteModuleRenderPlan(layout, alternateSectionBg)`) uses it to give every second enabled module that participates in alternation the `'alt'` background variant.

### Font Allow-List

Fonts are pre-loaded at build time via `next/font/google` in `apps/web/features/platform/hotsite/font-config.ts`. The manifest stores a font key (e.g. `"Playfair Display"`); `applyBranding()` resolves it to the matching CSS variable. No runtime CDN link, no LGPD exposure.

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
| `"Manrope"` | Manrope | Rounded display headings — Mimo Pet |
| `"DM Sans"` | DM Sans | Body copy across the six template prototypes |

`font-config.ts` exports `FONT_VARIABLES` (array of CSS variable class names, applied to `<body className>`) and `FONT_MAP` (key → CSS variable string, e.g. `{ "Inter": "var(--font-inter)" }`). Unknown keys fall back to `"Inter"`.

### CSS Variable Mapping

The `applyBranding(branding)` helper (called in `app/[slug]/layout.tsx`) resolves semantic choices to CSS variables. Takes `HotsiteBrandingResponse` from `@ikaro/types`.

```typescript
// apps/web/features/platform/hotsite/apply-branding.ts

const BORDER_RADIUS = { sharp: '0px', rounded: '8px', soft: '24px', pill: '9999px' };
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
    '--ba-btn-radius':    BORDER_RADIUS[branding.buttonRadius ?? branding.borderRadius],
    // Emitted only when set: an unset weight leaves each heading its own (semibold card titles stay 600)
    ...(branding.headingWeight ? { '--ba-heading-weight': String(branding.headingWeight) } : {}),
    ...(branding.headingTransform ? { '--ba-heading-transform': branding.headingTransform } : {}),
    '--ba-section-py':    SECTION_PY[branding.spacing],
    '--ba-shadow':        SHADOW[branding.shadowStyle],
    '--ba-btn-variant':   branding.buttonStyle,
    // + --ba-btn-bg / --ba-btn-text / --ba-btn-border / --ba-btn-hover-bg (see "Button Color Tokens" below)
    '--ba-hero-bg':       deriveHeroBg(branding),        // primaryColor, or backgroundColor when heroBgStyle === 'background'
    '--ba-hero-text':     deriveHeroTextColor(branding), // whichever of backgroundColor/textColor contrasts better with the hero bg
    '--ba-divider':       deriveDivider(branding),       // gradient | secondaryColor | 'none' from dividerStyle
  } as React.CSSProperties;
}
```

### Button Color Tokens

`applyBranding()` also derives four button tokens — `--ba-btn-bg`, `--ba-btn-text`, `--ba-btn-border`, `--ba-btn-hover-bg` — from `buttonStyle`, plus two **optional** overrides, `buttonBackgroundColor` and `buttonTextColor` (both hex). When both are unset, the output is exactly the `buttonStyle`-only derivation below.

| `buttonStyle` | `--ba-btn-bg` | `--ba-btn-text` | `--ba-btn-border` | `--ba-btn-hover-bg` |
|---|---|---|---|---|
| `filled`  | `var(--ba-primary)` | `#ffffff` | `var(--ba-primary)` | = `--ba-btn-bg` |
| `outline` | `transparent` | `var(--ba-primary)` | `var(--ba-primary)` | `transparent` |
| `ghost`   | `transparent` | `var(--ba-primary)` | `transparent` | `transparent` |

Overrides:
- `buttonBackgroundColor` — for `filled`, replaces `--ba-btn-bg` **and** `--ba-btn-border` (a permanent fill); for `outline`/`ghost`, it instead sets `--ba-btn-hover-bg` — the resting `bg` stays `transparent`, and the button fills with this color **on hover only**.
- `buttonTextColor` — replaces `--ba-btn-text` for all three styles, and `--ba-btn-border` for `outline` only. Text color does not change on hover.

Module components consume these via inline `style` (e.g. `backgroundColor: 'var(--ba-btn-bg)'`) plus a Tailwind arbitrary-value hover class, `hover:bg-[var(--ba-btn-hover-bg)]`.

**Rule for module authors:** Every module must use only `var(--ba-*)` variables for colors, fonts, radius, spacing, and shadows. Never hardcode visual values. This guarantees every tenant's branding is applied consistently across all modules with zero extra work.

**This rule is not limited to the dynamic per-tenant modules above** — it applies to every component rendered inside the hotsite tree, including persistent chrome that isn't part of the per-tenant module list (`HotsiteAuthBar`, and any future shared hotsite nav/footer). `HotsiteAuthBar`'s staff-area link hardcoded `color: 'rgba(17,24,39,0.4)'` instead of `var(--ba-text)` — it rendered fine for tenants whose branding happened to read dark-on-light, then went invisible the first time a tenant picked a dark `--ba-secondary` (M13-S14 follow-up; see `docs/ANTI_PATTERNS.md`).

**Common mistake — partial pairing (caught in M13-S42 review):** setting `color: var(--ba-text)` on an element without *also* setting `backgroundColor: var(--ba-background)` (or `--ba-secondary` for a card/surface) on that same element silently falls back to the page's unbranded white default — `--ba-text` is calibrated against the **tenant's own** background, not against white. A dark-themed tenant (e.g. BeloAuto: `textColor: #FFFFFF`, `backgroundColor: #0A0A0A`) renders invisible white-on-white text wherever this pairing is missed. Symmetrically, any element with `backgroundColor: var(--ba-primary)` must pair it with `color: var(--ba-btn-text)` — never a hardcoded `#fff`/`text-white` — since `buttonTextColor` exists specifically so a tenant can fix poor contrast on their own primary color (BeloAuto's `#F5A800` orange needs dark text, not white, hence their explicit `buttonTextColor: #0A0A0A` override). Copying markup from the static prototypes (`journeys/shared/*.html`) is the most common way this slips in — those mockups are deliberately non-branding-aware and hardcode literal `white`/`black`.

### What different token combinations produce

| Business | primaryColor | borderRadius | buttonStyle | spacing | shadowStyle |
|---|---|---|---|---|---|
| Car wash (bold) | `#f97316` | `sharp` | `filled` | `compact` | `strong` |
| Dental clinic | `#2563eb` | `rounded` | `outline` | `spacious` | `subtle` |
| Beauty salon | `#db2777` | `pill` | `filled` | `comfortable` | `none` |
| Mechanic | `#1e293b` | `sharp` | `ghost` | `compact` | `strong` |

---

## 3. Module Library

### Available Modules

| Module type | Purpose | Content source |
|---|---|---|
| `NAVIGATION` | Same-page section links in the top bar (TD56) — page chrome, always the first `layout` entry, not a section | Manifest |
| `HERO` | First impression + primary CTA | Manifest |
| `SERVICE_LIST` | Showcase services with prices | Booking context (live) |
| `GALLERY` | Before/after results | Admin-curated (booking photos + custom uploads) |
| `TESTIMONIALS` | Social proof | Manifest |
| `BOOKING_CTA` | Secondary call-to-action section | Manifest |
| `ABOUT` | Business / team story | Manifest |
| `CONTENT_BLOCK` | One editorial block with a closed set of six variants — trust grid, process steps, collage, technical callout, image and immersive statements (TD56) | Manifest |
| `CONTACT` | Address, phone, social, map | Tenant settings |
| `CHATBOT` | AI-assisted FAQ widget, scoped to the tenant's own business data | Booking context (live services) + tenant settings (`knowledgeText`), assembled BFF-side — never in the manifest, see § CHATBOT below |
| `LEAD_FORM` | Lead-capture form (manager-authored questions), teaser only in the manifest | Live question catalog fetched separately at `/[slug]/lead-form`, see § LEAD_FORM below |
| `TRIAL_SIGNUP_CTA` *(planned with Billing)* | A call-to-action block on Ikaro's **own** tenant hotsite only (title, optional text, button): the button always opens the public trial page `/ikaro-trial` (UC-127, UC-131). Not a billable feature | Manifest — see § TRIAL_SIGNUP_CTA below |
| `FOOTER` | Closing footer: business info, links and a surface-only `presentation` (`surface`, `customColor`) | Manifest + tenant business info (see § FOOTER; appended disabled by `materializeLayout`) |

The `FOOTER` is a layout module like the others: its data is `FooterModuleData` (§4), and a tenant whose saved layout lacks it gets one appended, disabled, by `materializeLayout` (`MODULE_ORDER` in `apps/web/features/platform/hotsite/default-layout.ts` fixes the order of the missing types), so the manager can enable it in the Layout tab; `app/[slug]/page.tsx` renders it from its `data` plus the tenant's business info.

**Twelve types, each a singleton.** A layout holds at most one entry per type, so at most 12. `MODULE_ORDER` validates a pasted layout's `type` values and its length, and `materializeLayout` adds every missing type as a disabled row — `NAVIGATION` in front (the backend requires it first), the others at the end — so the Layout list and the visual structure list always show all twelve. *(Planned with Billing: a 13th type, `TRIAL_SIGNUP_CTA`, exists only for the platform-owner tenant — `PLATFORM_OWNER_TENANT_SLUG` — so every other tenant's layout still holds at most 12 and the Layout list shows twelve rows; § TRIAL_SIGNUP_CTA below.)*

### Module Type Union

```typescript
// packages/types/src/enums.ts — re-exported (not redeclared) from packages/types/src/hotsite.ts

type HotsiteModuleType =
  | 'NAVIGATION'      // always first; page chrome, not a section
  | 'HERO'
  | 'SERVICE_LIST'
  | 'GALLERY'
  | 'TESTIMONIALS'
  | 'BOOKING_CTA'
  | 'ABOUT'
  | 'CONTENT_BLOCK'
  | 'CONTACT'
  | 'FOOTER'
  | 'CHATBOT'
  | 'LEAD_FORM';
  // planned with Billing, platform-owner tenant only: 'TRIAL_SIGNUP_CTA' (UC-131)

// Shared contract (packages/types/src/hotsite.ts) — what the BFF returns and the web consumes:
interface HotsiteModuleResponse {
  type: HotsiteModuleType;
  enabled: boolean;   // false = skip rendering without removing from layout
  data: Record<string, unknown>;   // parsed per-type on the web side
  presentation?: HotsiteModulePresentation;   // optional section presentation, see §4
}
```

The typed `HotsiteModule { type; enabled; data: HotsiteModuleData; presentation? }` and the `HotsiteModuleData` union exist only in the backend domain (`apps/backend/src/contexts/platform/domain/hotsite-config.types.ts`); they are not part of the shared `@ikaro/types` contract.

---

## 4. Module Data Contracts (TypeScript)

All interfaces live in `packages/types/src/hotsite.ts` and are shared between the BFF, backend, and frontend.

### HERO

```typescript
interface HeroModuleData {
  variant: 'centered' | 'left-aligned' | 'immersive';  // default: 'centered'; 'immersive' added by TD56 (a "split" opening is 'left-aligned' + rightPanel 'image', not a variant)
  title: string;
  subtitle?: string;
  eyebrow?: string;
  backgroundImageUrl?: string | null;    // GCS URL — uploaded via dashboard
  backgroundImagePosition?: 'left' | 'center' | 'right'; // object-position focal point, default 'center' (M18-S04)
  contentPositionX?: 'left' | 'center' | 'right'; // default 'center'; only affects 'centered' variant (M18-S05)
  contentPositionY?: 'top' | 'center' | 'bottom'; // default 'center'; applies to both variants (M18-S05)
  ctaLabel: string;                      // e.g. "Agendar agora"
  ctaTarget: 'booking-form' | 'service-list' | 'gallery' | 'testimonials' | 'about' | 'contact';
  secondaryCtaLabel?: string;
  secondaryCtaTarget?: 'booking-form' | 'service-list' | 'gallery' | 'testimonials' | 'about' | 'contact';
  rightPanel?: 'none' | 'image' | 'brand-card'; // left-aligned variant only
}
```

### SERVICE_LIST

```typescript
interface ServiceListModuleData {
  title?: string;        // section heading, default "Nossos Serviços"
  eyebrow?: string;      // short label above the heading
  showPrices: boolean;
  showPoints: boolean;   // show loyalty points per service
  layout: 'grid' | 'list' | 'numbered' | 'feature-cards';  // default: 'grid'; the last two added by TD56
  cardColumns?: 2 | 3;                 // feature-cards; omitted keeps two columns
  cardTone?: 'plain' | 'tinted' | 'ruled'; // tinted uses contrast-checked brand tints; ruled is the specialty-card layout
  itemAction?: 'details' | 'booking' | 'none';   // what a card does; omitted => 'none' (today's behaviour). 'booking' links the card to /{slug}/booking?serviceId=<id> (label: itemCtaLabel, default "Agendar"); 'details' links the card to the service's own page /{slug}/servicos/{publicSlug} (label: itemCtaLabel, default "Ver detalhes") — only for a service whose page is published (its public-list `publicSlug` is non-null); any other service keeps the booking action under the default "Agendar" label, so a card never links to a page that does not exist
  itemCtaLabel?: string;                          // <= 40 chars
  detailPage?: ServiceDetailPageSettings;         // look of every public service detail page, closed set
}

interface ServiceDetailPageSettings {
  heroStyle: 'cover' | 'compact';
  galleryLayout: 'grid' | 'featured';
  showPrice: boolean;
  showDuration: boolean;
  showLoyaltyPoints: boolean;
  bookingCtaLabel?: string;                       // <= 40 chars
}
```

Data is fetched live from the Booking context — not stored in the manifest. The manifest only stores display preferences.

### GALLERY

```typescript
interface GalleryImage {
  url: string;                        // public, permanently-cacheable URL — see "Image hosting & URL resolution" below
  caption?: string;
  source: 'booking' | 'upload';
  bookingId?: string;                 // present when source === 'booking'
  photoType?: 'before' | 'after';     // present when source === 'booking' — derived server-side from which photo list (before/after) the original came from; lets the frontend label "Antes"/"Depois"
  width?: number;                     // natural pixel width — captured at upload/pick time (M18-S06); absent for images stored before that story
  height?: number;                    // natural pixel height — same as width; the pair drives layout: 'masonry' tile sizing, absent falls back to a fixed square box
}

interface GalleryModuleData {
  title?: string;            // default "Nossos Resultados"
  eyebrow?: string;          // short label above the heading
  images: GalleryImage[];    // admin-curated ordered list
  layout: 'grid' | 'masonry' | 'featured' | 'portfolio';   // default: 'grid'; 'portfolio' added by TD56
  maxVisible: number;        // default 6 — "ver mais" shown if images.length > maxVisible
  featuredPosition?: 'left' | 'right';   // only meaningful when layout === 'featured' — which side images[0] (the large tile) renders on; default 'left' (M18-S07)
}
```

`featured` accepts three, four or five images. It keeps the five-image composition unchanged; fewer than three render as `grid`. The editor enables it at three images.

**Image hosting & URL resolution (M12-S10 — read this before M12-S02's original framing):**
Hotsite images are **public marketing assets** — unlike booking photos, there is no privacy reason to gate them. They live in a separate **public** GCS bucket with fixed, permanently-cacheable addresses (`IStorageService.getPublicUrl()` — a pure string template, no signed URL, no expiry, no regeneration). This is what makes the manifest's `Cache-Control: public, max-age=300` + Next.js ISR + future CDN (§10) actually safe to rely on: nothing inside the cached payload can expire mid-cache-window. `GetHotsiteManifestUseCase`/`GetHotsiteContentUseCase` resolve every stored `filePath` (`branding.logoUrl`, `seo.ogImageUrl` (M18-S03), module `*Url` fields, `GalleryImage.url`) to this public address before returning — one resolution path, used identically by the public manifest and the admin endpoint, regardless of `GalleryImage.source`.

Booking photos remain on the **private** bucket with the original "fresh read-signed URL generated at display time, never stored, 15-minute expiry" pattern (`docs/API_CONTRACTS.md`) — that pattern is correct *there* because those images genuinely must stay private. Hotsite images simply don't follow it.

**Image sources (both available in the dashboard editor):**
- **Custom upload:** Admin uploads their own images (e.g. Canva-edited before/after, logo, hero/CTA backgrounds, about photos) via `POST /v1/tenants/hotsite/images/signed-url` (M12-S02, retargeted to the public bucket by M12-S10). Same upload mechanics as M115-S01 — 15-minute *upload*-URL expiry, content-type lock, 10 MB cap — behind a hotsite-specific endpoint and path convention: `tenants/<tenantId>/hotsite/<purpose>/<uuid>/<fileName>`, where `purpose` groups assets by what they're for (`branding | hero | gallery | about | booking-cta | testimonials | seo-og-image | lead-form | content-block | section-background | service-profile` (M18-S03, extended M20-S08 and TD56); the one closed list is `HOTSITE_IMAGE_PURPOSES` in `packages/types/src/hotsite.ts`, which the backend DTO and the BFF schema build their Zod enum from). The upload-URL expiry is irrelevant once the file lands — the resulting object gets a permanent public address, not another expiring URL.
- **From bookings (`source: 'booking'`):** Admin browses a completed booking's photos — **before** (`beforeServicePhotoUrls`, from UC-001/UC-002) *and* after (`afterServicePhotoUrls`, from UC-009) are both selectable, since a compelling "before/after" showcase needs both — and features one via `POST /v1/tenants/hotsite/gallery/feature-booking-photo { bookingId, photoUrl }` (M12-S10). The backend derives `photoType` itself by checking which list the photo came from (never trusts a client-supplied label — also doubles as an integrity check: a `photoUrl` absent from both lists is rejected), then **copies** the object from the private booking-photos path into the public bucket. It's a copy, not a live reference: the featured image becomes an independent, permanent editorial choice, decoupled from whatever later happens to the source booking (archival, customer-initiated erasure under LGPD, disputes, etc.) — and avoiding a live reference is also what keeps it consistent with the "no expiring URLs in a cached manifest" rule above. This works identically for guest-originated bookings (`customerId: null`) and authenticated-customer bookings; `tenantId` is the only access boundary that matters.
- **Existence check before persisting:** Pre-signed URLs let the browser upload straight to GCS, bypassing the backend — so nothing guarantees the `filePath` the admin later submits in `PATCH /v1/tenants/hotsite` actually exists (closed tab, failed `PUT`, hand-crafted request). `UpdateHotsiteContentUseCase` calls `IStorageService.exists()` on every non-empty image path (`branding.logoUrl`, `seo.ogImageUrl` (M18-S03), module `backgroundImageUrl`/`imageUrl`/`avatarUrl`, and **all** `GALLERY` images regardless of `source` — both `upload` and the copies produced by `feature-booking-photo` resolve to public-bucket paths) before persisting, rejecting unresolvable paths with `400 PLATFORM_HOTSITE_IMAGE_NOT_UPLOADED`. The same gap exists — and is fixed the same way — for booking photo paths (M12-S02 also retrofits `IStorageService.exists()` into the four booking use cases that accept `photoUrls`/`*ServicePhotoUrls`).

### TESTIMONIALS

```typescript
interface Testimonial {
  authorName: string;
  text: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  avatarUrl?: string | null;    // GCS URL, optional (null clears it)
}

interface TestimonialsModuleData {
  title?: string;        // default "O que nossos clientes dizem"
  eyebrow?: string;      // short label above the heading
  items: Testimonial[];
  layout: 'grid' | 'carousel' | 'editorial-quote';  // default: 'grid'; 'editorial-quote' added by TD56
}
```

An explicitly empty `title` hides the heading; an omitted title still shows the default.

### BOOKING_CTA

```typescript
interface BookingCtaModuleData {
  variant?: 'centered' | 'left-aligned' | 'immersive';  // default: 'centered'; 'immersive' added by TD56
  title: string;                  // e.g. "Pronto para brilhar?"
  subtitle?: string;
  eyebrow?: string;
  ctaLabel: string;               // e.g. "Agendar agora"
  backgroundImageUrl?: string | null;    // GCS URL, optional overlay background / left-aligned right-panel image
  backgroundImagePosition?: 'left' | 'center' | 'right'; // object-position focal point, default 'center' (M18-S05, same treatment as HeroModuleData)
  carouselDays?: number;          // day-carousel window size, only relevant when datePickerType is 'carousel'
  datePickerType?: 'carousel' | 'calendar'; // default: 'carousel'
  bgStyle?: 'primary' | 'background';      // default: 'primary'
  rightPanel?: 'none' | 'brand-card';      // left-aligned variant only, default: 'none'
  contentPositionX?: 'left' | 'center' | 'right'; // default 'center'; only affects 'centered' variant (M18-S05)
  contentPositionY?: 'top' | 'center' | 'bottom'; // default 'center'; applies to both variants (M18-S05)
}
```

### ABOUT

```typescript
interface AboutModuleData {
  title: string;                          // e.g. "Sobre nós" | "Conheça o Dr. Silva"
  body: string;                           // markdown supported
  eyebrow?: string;                       // short label above the heading
  imageUrl?: string | null;               // GCS URL — team/owner photo (null clears it)
  imagePosition: 'left' | 'right';       // default: 'right'
  variant?: 'split' | 'editorial' | 'bleed'; // TD56; omitted => 'split' (today's behaviour); imagePosition applies inside 'split' and 'bleed'. 'bleed' = edge-to-edge photo column beside the copy, stacked on mobile
}
```

Useful for any business type: car wash owner story, dentist bio, salon team photo, mechanic certifications.

### CONTACT

```typescript
interface ContactModuleData {
  title?: string;          // default "Fale conosco"
  eyebrow?: string;        // short label above the heading
  showAddress: boolean;
  showPhone: boolean;
  showWhatsapp: boolean;
  showEmail: boolean;
  showMap: boolean;        // Google Maps embed using address from tenants.settings.businessInfo
  showInstagram?: boolean; // show the Instagram link from business.socialLinks
  showFacebook?: boolean;  // show the Facebook link from business.socialLinks
  displayStyle?: 'list' | 'icon-cards';
  whatsappCtaLabel?: string; // label of the WhatsApp call-to-action button
}
```

Social links (whatsapp, instagram, facebook) are **not stored in `ContactModuleData`**. They come from `tenants.settings.businessInfo.socialLinks`, resolved into `manifest.business.socialLinks` by `GetHotsiteManifestUseCase`. The admin edits them once on the tenant settings page — `ContactModule` renders them based on `business.socialLinks`.

`ContactModuleData` (manifest `layout[].data`) only carries **display preferences** — which sections to show. The actual **values** (address, phone, email, social links) live in `tenants.settings.businessInfo` (`docs/TENANTS_SETTINGS_SCHEMA.md` §6) — the admin edits them once on the tenant settings page (UC-026), not per-module.

`GetHotsiteManifestUseCase` resolves `tenants.settings.businessInfo` into a top-level `business` field on the manifest (camelCased, sibling of `tenant`/`branding`/`layout`):

```typescript
// packages/types/src/hotsite.ts
interface HotsiteBusinessInfoAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zipCode: string;
}

interface HotsiteBusinessInfoSocialLinks {
  whatsapp: string | null;   // validated phone number — used in wa.me/ links
  instagram: string | null;  // free-form URL / handle
  facebook: string | null;   // free-form URL / handle
}

interface HotsiteBusinessInfoResponse {
  phone: string | null;
  email: string | null;
  address: HotsiteBusinessInfoAddress | null;
  socialLinks: HotsiteBusinessInfoSocialLinks | null;
}

interface HotsiteManifestResponse extends HotsiteResponse {
  tenant: TenantInfoResponse;
  business: HotsiteBusinessInfoResponse;
  // (partial: the full manifest also carries `localization` and `booking?`, see section 1)
}
```

`business` is always present; any of `phone`/`email`/`address` may be `null` if the admin hasn't filled them in yet.

**`ContactModule` rendering rules:**
- `showAddress` → render `business.address` (formatted as "Rua, Número - Bairro, Cidade - UF, CEP"); section omitted if `business.address` is `null`, even when `showAddress: true`
- `showPhone` → render `business.phone` (formatted); omitted if `null`
- `showEmail` → render `business.email` as a `mailto:` link; omitted if `null`
- `showWhatsapp` → render a `https://wa.me/<digits>` link using `business.socialLinks.whatsapp`; omitted if `null`
- `business.socialLinks.instagram` / `business.socialLinks.facebook` → rendered as links when present **and** the matching `showInstagram` / `showFacebook` flag is not `false` (an omitted flag means shown, for backward compatibility; `apps/web/shells/hotsite/components/ContactModule.tsx`)
- `showMap` → embeds `https://maps.google.com/maps?q=<urlencoded address>&output=embed` (keyless query-based embed, no Google Maps API key needed) using `business.address`; omitted if `business.address` is `null`, even when `showMap: true`

### FOOTER

```typescript
interface FooterModuleData {
  tagline?: string;
  copyrightNote?: string;
  showWhatsapp?: boolean;
}
```

`FooterModuleData` lives in `packages/types/src/hotsite.ts`; the footer shows the tenant's business info (see § CONTACT above) alongside these fields.

### CHATBOT

```typescript
interface ChatbotModuleData {
  variant?: 'bubble' | 'inline';         // widget placement, default 'bubble'
  accentColor?: 'primary' | 'secondary'; // maps to var(--ba-*), no raw hex
  botName?: string;                      // shown in the widget header, defaults to the tenant's own name if unset
  welcomeMessage?: string;               // first message shown when the chat opens, default a generic greeting
}
```

Same split as `ContactModuleData`, made explicit: `ChatbotModuleData` only carries fields **rendered verbatim to every visitor** — `botName`/`welcomeMessage` are shown exactly as typed, same category as `HeroModuleData.title`. Everything cost/security-sensitive is deliberately excluded from this module data and fetched separately:
- `tenants.settings.chatbot.knowledgeText` (`docs/TENANTS_SETTINGS_SCHEMA.md` §7) — edited on the tenant settings page (UC-026), not the module editor, same reason `ContactModuleData` excludes `businessInfo`
- The 8 volume/cost caps + `llmProvider`/`llmModel` — not editable anywhere in the admin UI for MVP; fixed platform defaults, optional Ikaro-only per-tenant override (`docs/TENANTS_SETTINGS_SCHEMA.md` §7)

**Why this split matters more here than for `CONTACT`:** the manifest is public and cached for 5 minutes (`Cache-Control: public, max-age=300`, § 2 above). Shipping `maxConversationsPerDay` or the raw `knowledgeText` into that payload would mean any visitor could read a tenant's cost-control settings and internal FAQ notes directly from the JSON response, whether or not the widget UI shows them.

**Availability is not derived from the manifest at all.** Unlike every other module, whether the `CHATBOT` widget actually renders depends on live, uncached state (per-tenant caps, LLM provider health, platform-wide spend/balance breakers) that can change from one request to the next — the `enabled: false` flag only covers the "admin turned this module off" case. The widget makes its own always-fresh pre-flight call on mount (`GET /public/platform/chatbot/status`, UC-034) before rendering anything; see `docs/API_CONTRACTS.md` § Chatbot Widget for the full contract and `docs/USE_CASES.md` UC-033/UC-034 for the three widget states (not available / active / interrupted).

**Module-config screen carries a standing disclosure, not shown for any other module type:** since availability depends on a platform-wide LLM provider account being funded and healthy — not just this tenant's own settings — the `CHATBOT` module's own config screen (`/dashboard/hotsite`, per-module drill-down) shows a permanent info note that a temporary provider/credit shortfall can disable the widget automatically, no tenant action needed. It also shows a red banner (not a permanent note — conditional) when this tenant's own daily conversation cap was already reached today (`docs/USE_CASES.md` UC-027 A5, `docs/API_CONTRACTS.md` § Chatbot Cap Status).

The canonical behavior and abuse-prevention rules are split by concern: `docs/USE_CASES.md` UC-033–UC-036, `docs/API_CONTRACTS.md` § Chatbot Widget, and `docs/TENANTS_SETTINGS_SCHEMA.md` § Chatbot.

### LEAD_FORM

```typescript
interface LeadFormModuleData {
  title: string;                          // e.g. "Fale com a gente"
  subtitle?: string;
  eyebrow?: string;
  ctaLabel: string;                       // e.g. "Preencher formulário"
  variant?: 'centered' | 'left-aligned' | 'immersive';  // default 'centered' — mirrors BookingCtaModuleData
  backgroundImageUrl?: string | null;
  backgroundImagePosition?: 'left' | 'center' | 'right';
  bgStyle?: 'primary' | 'background';     // default 'primary'
}
```

**Why the module data stays this small:** the manifest is public and cached 5 minutes (`Cache-Control: public, max-age=300`, §2 above). Embedding up to 20 questions (each with up to 10 options) would bloat every cached manifest fetch for the vast majority of visitors who never open the form — the same reasoning `SERVICE_LIST` already applies (display preferences only in the manifest; `services` fetched live via `fetchServices()`). The full question catalog is fetched only when a visitor actually reaches `/[slug]/lead-form` (`GET /public/platform/lead-form/:slug`, `docs/API_CONTRACTS.md` § Lead Form Widget).

**Placement:** `LEAD_FORM` is a normal entry in the `layout` array, reordered by the admin like every other module — not a special-cased widget.

**Disabled-module handling at the dedicated page:** unlike `CHATBOT` (whose availability is always live/uncached), `/[slug]/lead-form` checks the manifest's `layout` array directly for a `LEAD_FORM` module with `enabled: true` and renders the existing `<Unavailable/>` component when absent/disabled. This is genuinely new logic added by this module — no prior hotsite module had a dedicated page that checked its own `enabled` flag this way (`/[slug]/booking` only checks `manifest.isPublished`, never `BOOKING_CTA.enabled`).

Canonical rationale, domain model, and behavior: `docs/DOMAIN_MODEL.md` § `LeadFormConfig`/`LeadFormSubmission`, `docs/USE_CASES.md` UC-037–UC-043, and `docs/API_CONTRACTS.md` § Lead Form.

### TRIAL_SIGNUP_CTA (planned with Billing — platform-owner tenant only)

> **PLANNED, NOT YET BUILT.** The module is a call to action with **no form**: the multi-step signup flow (Turnstile, Google, details, provisioning — UC-127) is a page, `/ikaro-trial`, not a hotsite section. Manager flow: UC-131. It is not a billable feature (no price, no entitlement); Ikaro's own tenant is `exempt`.

```typescript
// Mirrors BookingCtaModuleData's vocabulary (variant / title / subtitle / ctaLabel) — no second naming scheme.
interface TrialSignupCtaModuleData {
  variant?: 'centered' | 'left-aligned';   // default 'centered'
  title: string;                           // 1..80 chars
  subtitle?: string;                       // optional, <= 200 chars
  ctaLabel: string;                        // 1..30 chars, default "Testar grátis por 14 dias"
}
```

- **No `href` field.** The module always links to `/ikaro-trial` (the language follows the hotsite's); a configurable URL would turn it into a generic button.
- **Section background** is not a data field: it is the section-level `presentation.surface` (`background`, `secondary`, `primary` or `custom`, with `customColor` for `custom`) that every other module uses, a sibling of `data`. The editor panel maps "Título" to `title`, "Descrição" to `subtitle`, "Texto do botão" to `ctaLabel`, the alignment to `variant`, "Fundo da seção" to `presentation.surface` and "Exibir esta seção" to the module's `enabled`.
- **Restriction to the platform-owner tenant.** `hotsite-layout.rules.ts` rejects a `TRIAL_SIGNUP_CTA` entry on any tenant whose slug is not `PLATFORM_OWNER_TENANT_SLUG` (an env var validated in `env.validation.ts`, never hardcoded). The check is server-side (the error code and `violations[]` shape for a rejected entry are decided at story discovery); the editor also hides the module from the add-module list for other tenants by asking the backend whether the tenant is the platform owner instead of comparing a slug on the client. How the editor asks is decided at story discovery. This is a deliberate exception inside a generic engine; the risk (a foreign tenant advertising Ikaro signup) is low and closed cheaply.
- **Never in a template.** A template could be applied to a foreign tenant, so the catalogue must not carry it and template application must not carry it (whether application ignores or rejects such an entry is decided at story discovery, § 12); the catalogue spec `packages/hotsite-templates/src/catalogue.spec.ts` ("lists all twelve module types exactly once") compares every template layout to the full `HOTSITE_MODULE_TYPES` registry, so a 13th type makes it fail for all six templates until it carries an explicit exclusion for this type.
- **Touch points** beyond the §7 checklist: the backend mirror `apps/backend/src/contexts/platform/domain/hotsite-config.types.ts`, `hotsite-layout.rules.ts` (per-type singleton rule, the `presentation` allow-list and the owner restriction), `page-model.ts` and `default-layout.ts` on the web, and `packages/hotsite-templates`. The render component is a server component rendered through `HotsiteSectionShell`, using `var(--ba-*)` only.

---

### NAVIGATION (TD56)

```typescript
interface NavigationModuleData {
  items: { label: string; target: 'service-list' | 'gallery' | 'testimonials' | 'about' | 'contact' }[];
  cta?: { label: string; target: 'booking-form' | 'lead-form' }; // header button, 1–30 characters
}
```

Page chrome, **not a section**: it is always the first `layout` entry, it never takes part in section alternation or dividers, and the public page and the editor preview hand its links to the top bar (`HotsiteAuthBar`) instead of rendering it in the section flow — one header only. `label` is 1–30 characters, at most 6 items. Item targets are the existing same-page anchors (`#service-list`, `#gallery`, …); booking and lead form are separate CTA routes. The optional CTA appears on desktop and in the mobile menu and links to `/{slug}/booking` or `/{slug}/lead-form`. The module has its own `enabled` toggle and is pinned first (the layout editor offers no drag handle for it).

Rules, each owned by exactly one layer:

| Rule | Owner |
|---|---|
| closed shape: item count, label length, target set, no unknown keys | `NavigationModuleDataSchema` in `packages/types/src/hotsite-schemas.ts`, imported by both `@ikaro/validation` (`HotsiteModuleSchema`) and `apps/web` |
| `NAVIGATION` is the first entry | `HotsiteConfig` → `HotsiteNavigationNotFirstError` (`PLATFORM_HOTSITE_NAVIGATION_NOT_FIRST`); the Manifesto tab also rejects it (`navigationNotFirst`) because it would break the layout editor at once |
| every item's target (and a `lead-form` header `cta`, which needs an enabled `LEAD_FORM`) is an **enabled** module of the same layout (checked only while `NAVIGATION` itself is enabled — a disabled navigation renders nothing) | `HotsiteConfig` → `HotsiteNavigationTargetNotEnabledError` (`PLATFORM_HOTSITE_NAVIGATION_TARGET_NOT_ENABLED`); the web shows it on Publish |
| at render, only items whose target section made it into the render plan become links | `resolveHotsiteNavigation(layout, plan)` in `page-model.ts` |

### CONTENT_BLOCK (TD56)

One singleton module whose `data` is a discriminated union on `variant`; every variant is a strict object (unknown keys rejected).

```typescript
// common to all six
interface ContentBlockCommon {
  align?: 'left' | 'center' | 'right';
  eyebrow?: string;                // <= 60
  title: string;                   // <= 120
  body?: string;                   // <= 1000, restricted Markdown — never HTML
  cta?: { label: string /* <= 40 */; target: 'booking-form' | 'service-list' | 'gallery' | 'testimonials' | 'about' | 'contact' };
}
// trust-grid          appearance?: 'rule' | 'tiles'; items 2-6 x { label <= 60; description? <= 140 }
// process-steps       appearance?: 'plain' | 'ruled'; items 2-6 x { title <= 60; body <= 240; label? <= 30 }
// collage-callout     images 2-4 x { url; alt? <= 120 }          (empty alt = decorative)
// technical-callout   factsPlacement?: 'side' | 'kicker'; facts? 0-4 x { value <= 20; label <= 40 }
// image-statement     (no extra fields; imagery comes from presentation.background)
// immersive-statement (no extra fields)
```

`collage-callout.images[].url` is the only image slot inside `CONTENT_BLOCK.data`; it is walked by the same image-path code as every other slot (below).

### Section presentation (TD56)

An optional object next to `data` that controls a module's full-width section. Every field is optional and omitted fields resolve to the renderer's current defaults, so a module without it renders exactly as before.

```typescript
interface HotsiteModulePresentation {
  surface?: 'background' | 'secondary' | 'primary' | 'custom';
  customColor?: string;            // strict #RRGGBB; required when surface is 'custom', rejected otherwise
  contentWidth?: 'narrow' | 'standard' | 'wide' | 'full';
  minHeight?: 'auto' | 'sm' | 'md' | 'lg' | 'viewport';
  padding?: 'none' | 'compact' | 'comfortable' | 'spacious';
  background?: { imageUrl: string | null; position?: 'left' | 'center' | 'right' };
  overlay?:                        // a separate layer, a sibling of background
    | { type: 'none' }
    | { type: 'solid'; color: string; opacity: number }                       // opacity 0..1
    | { type: 'linear-gradient'; direction: 'to-right' | 'to-left' | 'to-bottom' | 'to-top';
        fromColor: string; fromOpacity: number; toColor: string; toOpacity: number };
}
```

Which modules accept it:

| | `presentation` | `presentation.background` |
|---|---|---|
| `SERVICE_LIST`, `GALLERY`, `TESTIMONIALS`, `ABOUT`, `CONTACT`, `CONTENT_BLOCK` | yes | yes |
| `HERO`, `BOOKING_CTA`, `LEAD_FORM` | yes | **no** — they keep `data.backgroundImageUrl`, so one section never has two competing background images |
| `FOOTER` | `surface` and optional `customColor` only | no |
| `NAVIGATION`, `CHATBOT` | **no** | no |

`overlay` is accepted wherever `presentation` is, and is drawn over whichever background image the section has (its own, or `presentation.background`); with no image it tints the section surface. Violations are `HotsitePresentationNotAllowedError` / `HotsitePresentationBackgroundNotAllowedError` from `HotsiteConfig` (`hotsite-layout.rules.ts`); the closed shape is the schema's.

**Precedence with today's switches:** an explicit `presentation.surface` always wins; when absent, `branding.alternateSectionBg` (`bgVariant`), `branding.heroBgStyle` and each module's own `bgStyle` behave exactly as before. `CONTENT_BLOCK` alternates like `ABOUT`/`TESTIMONIALS` unless it sets a surface. An **invalid** `presentation` at render time is ignored (the module renders with defaults); it never removes the module the way malformed `data` does.

For a full-bleed photo with copy over it, use `variant: 'centered'`, `contentPositionX: 'left'`, `data.backgroundImageUrl` and `presentation.overlay` on `HERO` or `BOOKING_CTA`. Their `left-aligned` variant instead draws the image in a separate side panel.

**Contrast.** `deriveSectionTokens()` (`apply-branding.ts`) derives a section's text, card and divider colours from its surface — the better-contrasting of the branding background/text colours, falling back to black or white — so text and card text always meet 4.5:1 and nothing is rejected. They are scoped custom properties (`--ba-section-*`) set on the section element, never an override of the global `--ba-*` tokens. A photo with an explicit overlay derives text tokens from the overlay colour and opacity at the copy's horizontal or vertical anchor, composited over the section surface. Averaging the entire gradient would choose dark text for Clínica Lume's dark left edge over a light surface. The renderer applies a minimum scrim to a photo without an explicit overlay. `sectionTints()` derives three tinted card and tile backgrounds from the brand and the actual section surface, then pairs each with text meeting 4.5:1.

**Text over an overlay and the top bar (TD56 Story 6).** When a section has a background photo and an explicit `presentation.overlay`, its text tokens are derived from the overlay colour and opacity at the copy's content anchor (`contentPositionX/Y`, else `align`) composited over the section surface (`deriveOverlayTextTokens`), so a dark overlay on a light palette gets light text with no `surface: custom` workaround. The top bar, navigation and footer read `--ba-secondary-text`, `--ba-secondary-divider` and `--ba-secondary-accent`, which fall back to a readable colour when `textColor` is close to `secondaryColor`; `FOOTER.presentation.surface` (and `customColor`) chooses an intentional footer surface.

### Validation: where each layer stops (TD56)

`HotsiteModuleSchema` (`packages/validation/src/hotsite-modules.ts`) is one `z.discriminatedUnion('type')` over all twelve types and replaces the former unconstrained `data: z.record()`. The two TD56 types (`NAVIGATION`, `CONTENT_BLOCK`), the section `presentation` and the service detail-page settings are strict objects defined **once**, in `packages/types/src/hotsite-schemas.ts`, and imported by both `@ikaro/validation` and `apps/web` (which never imports `@ikaro/validation`). The ten older modules use loose objects whose declared keys are fully validated (required fields, enums, bounds) while unknown keys are tolerated — as the web schemas always did — and stay an independent mirror in `module-schemas.ts`; the fixtures in `@ikaro/types/testing/hotsite-module-contract` are run by both specs, so a case accepted by one set and rejected by the other fails a test. A stored layout that violated the old web schemas is rejected on its next save.

**Image slots.** Every place a module can hold an image path — `data.backgroundImageUrl`, `data.imageUrl`, testimonial `avatarUrl`, gallery `images[].url`, `collage-callout` `images[].url`, `presentation.background.imageUrl` — is walked by `HotsiteImagePathsService.collect`/`mapPaths`, `HotsiteImageUrlResolver` and the web mirrors (`mapHotsiteImageFields` and its callers). The table in the contract fixtures is run through all of them.

**Fonts.** `branding.headingFontFamily` / `bodyFontFamily` must be one of the registry keys in `HOTSITE_FONT_FAMILIES` (`packages/types/src/hotsite.ts`, the §2 allow-list) or the default every new tenant is created with (`HOTSITE_LEGACY_DEFAULT_FONT_FAMILY`, `'Inter, sans-serif'`, which the renderer resolves to Inter). A new font is added to that tuple and to `font-config.ts`, whose spec pins the two lists together.

---

## 5. Next.js Routing & SSR Strategy

The hotsite lives inside the same `apps/web/` Next.js app as the dashboard, separated by route prefix.

**Route:** `app/[slug]/` (Next.js App Router dynamic segment)

```
https://<ikaro-domain>/autowash-pro          → app/[slug]/page.tsx
https://<ikaro-domain>/autowash-pro/booking  → app/[slug]/booking/page.tsx
https://<ikaro-domain>/autowash-pro/booking/availability-alert → app/[slug]/booking/availability-alert/page.tsx (M23-S31)
https://<ikaro-domain>/autowash-pro/lead-form → app/[slug]/lead-form/page.tsx
https://<ikaro-domain>/autowash-pro/servicos/massagem-relaxante → app/[slug]/servicos/[serviceSlug]/page.tsx (TD56-S03, UC-109 — see § Per-page metadata)
https://<ikaro-domain>/autowash-pro/login    → app/[slug]/login/page.tsx
https://<ikaro-domain>/autowash-pro/my-account/* → app/[slug]/my-account/ (customer shell — docs/DASHBOARD_FRONTEND_ARCHITECTURE)
https://<ikaro-domain>/dashboard             → app/dashboard/ (requires auth)
```

**`app/[slug]/layout.tsx`** — fetches manifest and applies full branding token set:

```typescript
import { fetchManifest } from '@/features/platform/api.server';
import { applyBranding } from '@/features/platform/hotsite/apply-branding';
import { getActiveFontVariables } from '@/features/platform/hotsite/font-config';
// … plus the locale, formatting and message helpers

export default async function HotsiteLayout({ children, params }: HotsiteLayoutProps) {
  const { slug } = await params;  // Next.js 16: params is a Promise
  const manifest = await fetchManifest(slug);
  // locale, currency, timezone and date/time formats come from manifest.localization

  return (
    <div
      id="hotsite-root"
      style={{ ...applyBranding(manifest.branding), fontFamily: 'var(--ba-body-font)' }}
      className={getActiveFontVariables(
        manifest.branding.headingFontFamily,
        manifest.branding.bodyFontFamily,
      ).join(' ')}
    >
      <LocaleProvider locale={locale} messages={messages}>
        <FormattingProvider locale={locale} currency={currency} timezone={timezone} /* … */>
          {/* InformationCompletionPrompt, then */ children}
        </FormattingProvider>
      </LocaleProvider>
    </div>
  );
}
```

The `<html>` and `<body>` elements live in the root `app/layout.tsx`, not in this layout; the hotsite layout wraps its pages in `#hotsite-root` so the `--ba-*` token set applies only inside the hotsite tree.

**`app/[slug]/page.tsx`** — renders enabled modules in manifest order. The page does not map module types to components itself: `buildHotsiteModuleRenderPlan()` (`apps/web/features/platform/hotsite/page-model.ts`) does the generic `enabled` filter and parsing once, and each plan item is rendered by **`HotsiteModuleView`** (`apps/web/shells/hotsite/components/HotsiteModuleView.tsx`), the single type → component switch. The editor's preview renders through the very same view (adding only its selection wrapper), so what a manager sees is what gets published, and a module type added to the union without a case no longer type-checks (TD56-S02). Earlier revisions of this page were a `MODULE_MAP` table and then a per-type `else if` chain inside `page.tsx`; neither exists any more.

```typescript
// apps/web/app/[slug]/page.tsx (real shape, simplified)
import {
  buildHotsiteModuleRenderPlan,
  resolveHotsiteNavigation,
} from '@/features/platform/hotsite/page-model';
import { HotsiteAuthBar } from '@/shells/hotsite/components/HotsiteAuthBar';
import { HotsiteModuleView } from '@/shells/hotsite/components/HotsiteModuleView';

export default async function HotsitePage({
  params,
}: {
  params: Promise<{ slug: string }>;  // Next.js 16: params is a Promise
}) {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);
  // The enabled filter, the per-section alternating background (`bgVariant`), the validated
  // `presentation` and — for a section that sets `presentation.surface` — its scoped contrast
  // tokens (`sectionTokens`, from the tenant's branding), once, for every module.
  const plan = buildHotsiteModuleRenderPlan(
    manifest.layout,
    manifest.branding.alternateSectionBg ?? false,
    manifest.branding,
  );
  // NAVIGATION is page chrome, not a section: its links go to the top bar, never into the plan.
  const navigation = resolveHotsiteNavigation(manifest.layout, plan);

  return (
    <main>
      <HotsiteAuthBar slug={slug} logoUrl={manifest.branding.logoUrl} tenantName={displayName} navigation={navigation} />
      {plan.map((item, index) => (
        <HotsiteModuleView key={`${item.parsed.type}-${index}`} item={item} slug={slug} /* …tenant name, brand, logo, business, services */ />
      ))}
    </main>
  );
}
```

**Section shell.** Every full-width section renders through **`HotsiteSectionShell`** (`apps/web/shells/hotsite/components/HotsiteSectionShell.tsx`). It reads the module's `presentation` and falls back to the module's own legacy choice (`bgVariant` / `bgStyle` / `--ba-hero-bg`), so a module without `presentation` renders the markup and styles it always did:

| `presentation` field | Effect |
|---|---|
| `surface` | Section background and text come from the scoped `--ba-section-bg` / `--ba-section-text` / `--ba-section-card-bg` / `--ba-section-divider` tokens `deriveSectionTokens()` computes (contrast ≥ 4.5:1). They are set on that one `<section>`, never on the page root, so the global `--ba-*` layer is untouched. An explicit `surface` wins over `bgVariant`, `bgStyle` and the hero tokens. Modules read `var(--ba-section-text, var(--ba-text))`-style fallbacks, so without a surface nothing changes. |
| `contentWidth` | Bounds the inner content container: `narrow` `max-w-3xl`, `standard` `max-w-7xl` (today's), `wide` `max-w-[90rem]`, `full` none. Hero, Booking CTA and Lead Form lay out their own stage, so it narrows or widens their text column or grid instead. |
| `minHeight`, `padding` | `minHeight` sets a minimum height (`viewport` = `100vh`) and centres a flow section's content; `padding` overrides only the vertical padding, never the 1.5rem gutter. |
| `background` (+ `overlay`) | An image behind a section that has none of its own, drawn as a separate layer; the overlay (`solid` or `linear-gradient`) is a further non-interactive layer above it (`pointer-events: none`). A section with a photo behind its text that opted into `presentation` but has no overlay (absent or `none`) gets a built-in minimum scrim. A module that never set `presentation` is never given one, so existing photo sections are unchanged. |

Sections stay viewport-wide: their background, colour and divider belong to the full-width section, and only the inner content is width-bounded.

**Navigation.** `NAVIGATION` links and its optional CTA render inside the one top bar, never as a second header: `HotsiteAuthBar` (all three of its states — loading skeleton, signed-out, signed-in) and the editor preview's inert `HotsiteAuthBarSignedOut` both host `HotsiteNavigation`, which shows them inline from `md` up and in a `<details>` menu below it (closing on Escape, an outside click and a link tap). Section-link hrefs are absolute to the home page (`/{slug}#service-list`), so they work from `/booking` and `/booking/availability-alert`, whose pages resolve the same links with `resolveManifestNavigation(manifest)`. `/lead-form` shows none when its public manifest stubs `layout: []`.

**Strong variants.** The closed `variant` / `layout` values added by TD56 are real layouts, not labels: Hero / Booking CTA / Lead Form `immersive` (the centered composition pinned bottom-left over a full-bleed photo, taller, larger title), Service List `numbered` (ordered price menu) and `feature-cards`, Gallery `portfolio` (an asymmetric 12-column rhythm repeating every four tiles), Testimonials `editorial-quote` (pull-quotes in the heading font), About `editorial` (a single long-form column) and `bleed` (a full-height photo column beside the copy, no radius, stacked on mobile). `CONTENT_BLOCK` renders its six variants in `ContentBlockModule.tsx`; manager-written Markdown (About, CONTENT_BLOCK bodies, the service long description in a later story) goes through the one restricted renderer, `RestrictedMarkdown` (paragraphs, emphasis, lists and links; no raw HTML, no images; links `rel="noopener noreferrer nofollow"`).

### Booking flow architecture (`/[slug]/booking`, M22–M23)

The booking page is a hotsite page (it uses `--ba-*` branding and `BrandHeader`), but its flow is driven by a **step engine**, not a fixed form. `BookingForm` (and `BookingFormWithDeepLink`, which reads the availability-alert email's query string client-side while the server page keeps ignoring `searchParams`) composes the steps in `features/booking/components/public/`; the pure step logic lives in `features/booking/model/booking-steps.ts`.

- **Step list is computed from the chosen services.** `DEFAULT_BOOKING_STEPS` is `services → availability → personal → confirmation`. The engine inserts, per the basket: a `duration` step (`VariableDurationStep`) for a `CUSTOMER_SELECTED` duration policy, one `picker:<serviceId>:<legIndex>` step per `CUSTOMER_CHOICE` resource requirement or leg (`ResourcePickerStep` / `ResourcePicker`; `LegItineraryStep` for a multi-leg journey), and an `intake` step (`IntakeAnswersStep`, `IntakeAttendeesList`) when a service has an active intake schema.
- **Data comes from the public read APIs** (BFF `GET /v1/public/services`, `/public/services/:id/resource-options`, `/quote` and `/intake-schema`, plus the requirement-aware `GET /v1/schedule/availability` — `docs/API_CONTRACTS.md`), fetched by the booking page and its step components; the submit payload is built by `model/booking-payload.ts` and posted to `POST /v1/bookings` (guest) or `/v1/bookings/authenticated`.
- **Outcome:** `BookingSubmittedDetails` is the success box (booking details, who/what/when).
- **Availability alert ("Avise-me quando abrir"):** a button on the calendar step links to `/[slug]/booking/availability-alert`, a page of the booking flow (`AvailabilityAlertPage`, `AvailabilityAlertShell`, `NewAvailabilityAlertForm`). With no session it shows `AvailabilityAlertLoginGate`; the alert email's deep link (M23-S44) returns the customer to the booking page with the window pre-selected.
- **Branding boundary:** these components render under the hotsite tree and may read `--ba-*`; the staff reschedule/no-show and the customer `my-account` screens that reuse some of the same pickers must stay on the fixed SaaS palette (`docs/DASHBOARD_FRONTEND_ARCHITECTURE.md` §2).

### Unpublished state (M12-S08)

When `manifest.isPublished === false`, `page.tsx` renders `<Unavailable />` (`apps/web/shells/hotsite/components/Unavailable.tsx`) instead of the module list — a generic "Em breve" placeholder. Because `app/[slug]/layout.tsx` has already applied `applyBranding(manifest.branding)`, `<Unavailable />` inherits the tenant's `var(--ba-*)` tokens automatically — for a freshly-provisioned tenant these resolve to `DEFAULT_HOTSITE_BRANDING`, so no special-casing is needed.

> **Planned with Billing (UC-122):** this same page is what a `SUSPENDED` tenant's visitors see, so it must never reveal why the hotsite is unavailable. `Unavailable` gains the top bar (`HotsiteAuthBar`: team login and customer login, which it does not render today) and a reason-neutral "Página não publicada" copy variant, and it keeps inheriting the tenant's branding. Every public hotsite route renders it (`[slug]`, `booking`, `booking/availability-alert`, `lead-form` — via the stubbed empty layout of an unpublished manifest — and `servicos/[serviceSlug]`). The "Página não publicada" copy applies only when the hotsite is not (effectively) published: `lead-form` also renders `Unavailable` on a published hotsite whose lead-form module is disabled, and that case keeps the "Em breve" copy. Customer and team sign-in stay reachable because `[slug]/login` and `[slug]/my-account` never check `isPublished`. The journey is `journeys/guest/unpublished-hotsite.md`.

This differs from the **unknown-slug** case (`app/not-found.tsx`, root-level, M12-S08): there, `fetchManifest()` calls `notFound()` inside `app/[slug]/layout.tsx` before it ever renders, so no manifest/branding is available and the 404 page uses static Ikaro styling instead of `var(--ba-*)` tokens. The page must live at the `app/` root rather than `app/[slug]/` because Next.js does not let a segment's own `not-found.tsx` catch a `notFound()` thrown by that segment's own `layout.tsx`.


### The `/ikaro-trial` pages (planned with Billing)

> **PLANNED, NOT YET BUILT** (UC-127, UC-128, UC-131). The public trial pages are served at `/ikaro-trial` and are **branded as the Ikaro tenant**: they take the platform-owner tenant's hotsite branding through the same `applyBranding()` path as any tenant page, so they look like Ikaro's own hotsite. Because `--ba-*` tokens exist only under the hotsite tree, the pages are implemented inside it (under `app/[slug]/…`, for the owner slug only; any other slug gets `notFound()`), and the public URL `/ikaro-trial` is a Next.js rewrite to `/{PLATFORM_OWNER_TENANT_SLUG}/ikaro-trial/*`; the rewrite mechanism is decided at story discovery. They are **independent of `isPublished`**: if the owner tenant's hotsite is unpublished they still render, because they only need the branding from the manifest (the owner tenant is `exempt` and cannot be suspended). The Turnstile widget needs the same CSP allowance as the lead-form page, scoped to every page a visitor could soft-navigate from, because the CTA reaches `/ikaro-trial` through a `next/link` and CSP is only re-read on a fresh top-level navigation (`docs/ENGINEERING_RULES_FRONTEND.md` § CSP allowances for a new external UI resource); the exact wording is decided at story discovery. The module that links to these pages is § TRIAL_SIGNUP_CTA.

---

## 6. Manifest Caching

Next.js has **two independent caches** for hotsite requests:

- **Full Route Cache** (`export const revalidate` on the page/layout) — caches the final rendered HTML
- **Data Cache** (`next: { revalidate: N }` on individual `fetch()` calls) — caches individual API responses

**Today only the Data Cache is in effect.** The root layout sets `export const dynamic = 'force-dynamic'` (`apps/web/app/layout.tsx`; it keeps `PublicEnvScript`'s values from being frozen at build time, TD29), so a production `next build` reports every route, `/[slug]` and `/[slug]/booking` included, as `ƒ` (dynamic). The Full Route Cache never stores the HTML, and the page-level `export const revalidate = 300` has no effect on it. That export stays a literal, in sync with the constant below, so the route behaves as described here if the layout ever stops forcing dynamic rendering. What is cached is the manifest and services data, which the hotsite and the booking page share. (Verified with the `next build` route table, M23-S44, 2026-10-10.)

Both must use the **same TTL** or they diverge. Use the shared constant from `apps/web/features/platform/hotsite/revalidate.ts`:

```typescript
// apps/web/features/platform/hotsite/revalidate.ts
export const HOTSITE_REVALIDATE_SECONDS = 300;
```

```typescript
// apps/web/app/[slug]/page.tsx  (and the booking/, booking/availability-alert/, login/ and lead-form/ page.tsx files; the layout has no `revalidate`)
// Next.js statically analyses segment config exports — imported variables are not resolved.
// Must be a literal. Keep in sync with HOTSITE_REVALIDATE_SECONDS in features/platform/hotsite/revalidate.ts.
export const revalidate = 300;
```

```typescript
// apps/web/features/platform/api.server.ts — server-only ('server-only' import), used by every
// [slug] page/layout. next.revalidate/next.tags only mean anything for a server-rendered fetch,
// so this lives in its own server-only module rather than the isomorphic api.ts (below).
import { HOTSITE_REVALIDATE_SECONDS, hotsiteManifestCacheTag } from '@/features/platform/hotsite/revalidate';
import { bffPublicFetch } from '@/shared/lib/api/bff-server';

export async function fetchManifestResponse(slug: string): Promise<Response> {
  const isDev = process.env.NODE_ENV === 'development';
  return bffPublicFetch(`/public/platform/manifest/${slug}`, {
    next: {
      revalidate: isDev ? 0 : HOTSITE_REVALIDATE_SECONDS,
      tags: [hotsiteManifestCacheTag(slug)],
    },
  });
}

// Memoized per request with React cache(): the layout, the page and their generateMetadata()
// each call this for the same slug, and without the memo each fired its own network round-trip.
export const fetchManifest = cache(async (slug: string): Promise<HotsiteManifestResponse> => {
  const res = await fetchManifestResponse(slug);

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Failed to fetch manifest for slug "${slug}"`);

  return res.json() as Promise<HotsiteManifestResponse>;
});
```

`apps/web/features/platform/api.ts` (no `server-only`/`client-only` suffix distinction in the filename, but client-only in practice — imports `bffClient`, which asserts `'client-only'`) exports a separate `fetchManifestClient()` for the one caller that needs the manifest from the browser: `HotsitePreviewCanvas.tsx` (through `usePreviewSupplementaryData`), the dashboard's live-preview-while-editing canvas, embedded by both the visual editor and the detailed editor's `HotsitePreview` page. It carries no `next.revalidate`/`next.tags` — Next's Data Cache doesn't exist in the browser, so those options would be silently ignored there anyway; the preview is deliberately always-fresh, not cached. `features/platform/hotsite/api/services.ts`/`services.server.ts` follow the identical split for the services list.

The `isDev ? 0` guard disables caching in `NODE_ENV=development` so local edits are reflected immediately without cache busting.

**Cache behaviour:**
- First request → the manifest (and services) are fetched from the BFF and cached in the Data Cache for 300 s
- Subsequent requests within 5 min → served from the Data Cache (no BFF call)
- After 5 min → revalidated in the background, stale served in the meantime
- Admin publishes/unpublishes (UC-027) → triggers on-demand revalidation (`revalidatePath('/[slug]')` plus `revalidateTag(…, { expire: 0 })` for the manifest, services and published-slugs tags, via a secured `/api/revalidate` route, M12-S10) — changes go live immediately rather than waiting for the 5-minute Data Cache window
- Image URLs embedded in the manifest (`branding.logoUrl`, `seo.ogImageUrl`, module `*Url`, `GalleryImage.url`) are **permanent public addresses** (M12-S10 — see §4 "Image hosting & URL resolution"), not expiring signed URLs — this is what makes caching the manifest payload itself safe; nothing inside it can go stale mid-window

**Rule:** Never hardcode `300` or any revalidation number in a `fetch()` call or page export — always import from `features/platform/hotsite/revalidate.ts` so all TTLs move together.

> **Correction (M23-S44, 2026-10-10):** the ISR rationale in the next two paragraphs predates the root layout's `force-dynamic` (see the bold note at the start of this section). Every route already renders per request, so reading `cookies()`/`headers()` in the `[slug]` tree would no longer change the HTML's rendering mode, and no ISR cache of the HTML exists to lose. The pattern stays the compliant one — `HotsiteAuthBar` resolves its auth state after hydration — but the cost the paragraphs describe is not currently paid by anyone; what stays cached is the manifest and services data.

**Session-aware widgets must not break this cache (M13-S42).** Any UI that needs to know whether the current visitor is logged in (e.g. `HotsiteAuthBar`) must be a `'use client'` component that fetches its own auth state *after* hydration — via a same-origin proxy route, see `docs/DASHBOARD_FRONTEND_ARCHITECTURE.md` §4 — and must **never** call `cookies()` from `next/headers` anywhere in the `[slug]` page/layout server-render tree. Calling `cookies()` there forces Next.js to treat the whole route as dynamic per-request, silently disabling the ISR cache above for every visitor, not just logged-in ones.

**`headers()` is the same trap as `cookies()`.** Both are Next.js "Dynamic APIs" — calling either one anywhere in the `[slug]` page/layout server-render tree forces the whole route dynamic, silently disabling ISR (and any future CDN cache) the same way. This surfaced concretely in AUD-007 (`td/TD08-AUDIT-REMEDIATION-BACKLOG.md`): a per-request CSP nonce for the JSON-LD script (`shells/hotsite/components/JsonLdScript.tsx`) would require reading the nonce via `headers()` in `app/[slug]/page.tsx` — which would have quietly killed this page's ISR cache. The nonce was dropped in favor of a scoped `script-src 'unsafe-inline'` CSP exception instead; see that story for the full rationale. Treat any future need to read `headers()` (or `cookies()`) in this route tree as a caching regression to solve around, not a one-line addition.

**Status: compliant.** `HotsiteAuthBar` (`apps/web/shells/hotsite/components/HotsiteAuthBar.tsx`) is a `'use client'` component that resolves its auth state after hydration via `GET /api/session` — a thin same-origin proxy route that reads the httpOnly cookie server-side and forwards it to the BFF's `GET /auth/session` — it does not call `cookies()`/`headers()` in the `[slug]` server-render tree. The BFF endpoint owns the actual orchestration: it reads the JWT's role from `@CurrentUser()` (populated by its own guard chain) and calls exactly the one relevant backend lookup (`/staff/me` for STAFF/MANAGER, `/customers/me` for CUSTOMER) rather than guessing both — combining is a BFF-orchestration concern, not web's, per the project's cross-context-read priority order. While the fetch is in flight the component renders a loading skeleton rather than the unauthenticated markup, so an authenticated visitor never sees a flash of "logged out" content. (Previously violated the `cookies()`/`headers()` constraint until fixed alongside the `revalidateTag` fix below — found via a live staging debugging session, TD35 follow-up; the two separate `/api/staff/me`/`/api/customers/me` client fetches were first consolidated into web's own `/api/session`, then that combining logic was moved into the BFF once review flagged it as orchestration that didn't belong in web — same PR.)

**On-demand revalidation uses `revalidateTag`, not just `revalidatePath`.** `revalidatePath('/${slug}', 'page')` alone doesn't reliably clear `fetchManifestResponse`'s Data Cache entry for a route that's forced fully dynamic — see the note above. `app/api/revalidate/route.ts` also tags the manifest fetch (`hotsiteManifestCacheTag(slug)`) and calls `revalidateTag(tag, { expire: 0 })`. Next 16 requires a second argument here; a named profile like `'max'` means stale-while-revalidate (serves old content once more, refreshes in the background) — **not** immediate invalidation. `{ expire: 0 }` forces a blocking cache-miss on the next request instead.

**Debugging the Data Cache directly:** set `NEXT_PRIVATE_DEBUG_CACHE=1` when running `pnpm start` to see Next's actual cache hit/miss/expire/set decisions logged to the server's own terminal — far more reliable than inferring from upstream (BFF) request logs, which get lost in unrelated noise (e.g. browser `favicon.ico` auto-requests hitting the `[slug]` catch-all).

---

## 7. Adding a New Module (Developer Checklist)

Follow these steps in order. Every step is mandatory.

**1. Define the data contract**

Add the new module-type string to `HOTSITE_MODULE_TYPES` in `packages/validation/src/hotsite.ts` and a strict schema for it in `packages/types/src/hotsite-schemas.ts` and its entry in `HotsiteModuleSchema` (`packages/validation/src/hotsite-modules.ts`) — the spec there fails if a canonical type has no schema. The web registers the same schema (step 3), and the shared fixtures in `packages/types/src/testing/hotsite-module-contract.ts` get the matching cases. Also decide whether it accepts `presentation` and `presentation.background` (`hotsite-layout.rules.ts`), and add an entry to every exhaustive `Record<HotsiteModuleType, …>` (`MODULE_SCHEMAS` in `page-model.ts`, `MODULE_CONFIG_PANELS`, the `hotsite.layout.modules.*` labels) — the canonical source since TD37-S21. The backend domain type (`apps/backend/src/contexts/platform/domain/hotsite-config.types.ts`) and its `MODULE_TYPES` runtime Set both derive from it automatically; no separate backend edit needed. A module that only one tenant may hold (the planned `TRIAL_SIGNUP_CTA`, platform-owner tenant only) also adds its restriction to `hotsite-layout.rules.ts` and an explicit exclusion in the template catalogue spec (`catalogue.spec.ts`, which compares every template layout to the full registry).

In the **same commit**, also add the new member to `HotsiteModuleType` in `packages/types/src/enums.ts` — this is a deliberately independent, web-facing copy (never derived from `@ikaro/validation`, which `apps/web` must not depend on), but `packages/architecture-check`'s `closedEnumRegistry` detector requires it to always match the canonical source exactly, in both directions. Unlike `LEAD_FORM`'s original rollout (M20-S01 → M20-S07, staged across multiple PRs), a staged rollout for this enum is no longer supported — a member missing from either side fails `pnpm architecture-check`. Add the TypeScript data-shape interface itself to `packages/types/src/hotsite.ts` (alongside the other `XxxModuleData` interfaces, which `HotsiteModuleType` is only re-exported from — not declared in). Keep the `data` shape flat — avoid deep nesting.

**2. Build the React component**

Create `apps/web/shells/hotsite/components/XxxModule.tsx`. Rules:
- Use **only** `var(--ba-*)` CSS variables for colors, fonts, radius, spacing, shadows — never hardcode visual values
- **Section shell and content width:** render the module's `<section>` through `HotsiteSectionShell` (§ `app/[slug]/page.tsx` above) — it owns the full-width surface, background photo and overlay, minimum height and vertical padding, and bounds free-flowing content in the `max-w-7xl mx-auto` container (`presentation.contentWidth` changes the bound). A flow module passes `flow` and its legacy background/colour/padding and arranges content inside; a module with its own stage (Hero, Booking CTA, Lead Form) passes `selfLayout` and keeps its stage inside the `max-w-7xl` container. Any left/right positioning feature must anchor content *within* that container, never directly against the section's own edge — otherwise anchoring pushes content flush against the raw viewport edge on wide screens instead of respecting the site's usual content width (found only after M18-S05 shipped, via user feedback on a live wide-viewport screen — not caught by unit tests, which don't exercise real viewport widths).
- **Text and card colours:** use `sectionTextColor` / `sectionCardBackground()` (`module-styles.ts`), not a bare `var(--ba-text)`, so a section with an explicit `presentation.surface` follows its derived, contrast-safe tokens.

#### Implicit vs. explicit CSS defaults

  A field documented as "unset renders identically to today" must check whether today's behavior is an *explicit* class/value or an *implicit* engine default before wiring the field's own default through generically. A generic "unset → apply this field's default" derivation is only actually a no-op for elements whose current output already matches that default explicitly — an element relying on an implicit default (e.g. a flex container with no `justify-content` at all, which browsers resolve to `normal`/`flex-start`) gets a real, silent behavior change the moment an explicit value for that same default is applied to it. **M18-S05 precedent (2026-07-30):** `HeroModule.tsx`'s CTA row had no `justify-content` class at all pre-story — unlike its sibling elements, which already hardcoded `items-center`/`justify-center` explicitly. Applying the new `contentPositionX` field's `'center'` default uniformly would have silently added `justify-center` to that one row, changing its real rendered position despite the story's own "identical to today" requirement; fixed by special-casing that one element to only apply a class when the field is explicitly set. Found via user review after the first push, not caught by the original implementation. Before trusting "defaults to X is safe" for every affected element, check each element's *actual current* CSS output, not just the containing pattern's stated intent.

  Remaining rules for this component:
- Mobile-first responsive layout (Tailwind breakpoints: `sm`, `md`, `lg`)
- Accessible (WCAG 2.1 AA) — semantic HTML, `aria-label` where needed, sufficient color contrast
- Accept props: `data: XxxModuleData` and `slug: string`
- **Default to a server component** (no `'use client'`). Before marking the whole component client-side, identify the smallest interactive piece (e.g. a reveal button, carousel nav) and extract only that into a small `'use client'` child component, passed pre-rendered server content as `children` (the "islands" pattern) — keeps data fetching, image rendering (`next/image`), and markup server-rendered for SEO/LCP, and ships minimal client JS. Exception: when the entire module is interactive by nature (forms, real-time data, heavy animation), mark the whole module `'use client'` — forced splitting adds complexity without benefit.
- Write a Vitest unit test and a React Testing Library component test (`// @vitest-environment jsdom` at line 1)

**Islands pattern — concrete reference (`GalleryModule`/`GalleryGrid`):**

`GalleryModule` (server) renders all `<img>` elements and passes them as `children` to `GalleryGrid` (client). Key decisions:
- All images are in the SSR HTML; extras get `data-gallery-extra` attribute
- CSS rule `[data-gallery-expanded='false'] [data-gallery-extra] { display: none }` hides them — browser skips downloading hidden images (no LCP cost), but they're discoverable by crawlers
- Client component toggles `data-gallery-expanded` on the wrapper `<div>` — no React re-render removes images from the DOM
- Clicks use **event delegation** — single `onClick` on the wrapper div, reads `data-gallery-url`/`data-gallery-caption` from `e.target.closest('[data-gallery-url]')` — works across server-rendered children because React's event system is rooted at the document
- The `<dialog>` lightbox uses `open:flex` (**not** `flex`) — see ANTI_PATTERNS.md `<dialog className="flex">` entry

**3. Add a Zod schema to `module-schemas.ts`**

Add a `XxxModuleDataSchema` to `apps/web/features/platform/hotsite/module-schemas.ts` and register it in `MODULE_DATA_SCHEMAS`. Without this, `isValidModuleData('XXX', data)` returns `true` for any data including structurally invalid payloads — a malformed module will reach the component and may crash the page. Every `HotsiteModuleType` must have a schema registered before its story ships.

**4. Register the render branch**

Add a `case 'XXX':` to the switch in `apps/web/shells/hotsite/components/HotsiteModuleView.tsx` (importing the new module's component). The public page and the editor preview both render through that one view, so there is nothing to add in `app/[slug]/page.tsx` or in `renderHotsitePreviewModule`; the switch is exhaustive, so a type left out fails `tsc`. See § 3 "Module Type Union" and the `app/[slug]/page.tsx` section above.

**5. Add the admin configuration form**

Add a form panel for the new module inside the hotsite editor (UC-027, `apps/web/app/dashboard/hotsite/`). The form must allow the admin to fill in all `data` fields and toggle `enabled`.

**6. Update this document**

Add the module to the table in §3 and add its `data` interface to §4.

---

## 8. Local Development Workflow

```bash
pnpm infra:up && pnpm dev
```

Visit `http://localhost:3000/<tenant-slug>` to see any tenant's hotsite.

**Testing different branding / module configs:**
1. Provision tenants (UC-024) through `POST /internal/tenants` (operator-only; see `docs/RUNBOOKS.md`'s "Provision a tenant" flow), or load the local seed data with `pnpm db:seed` (there is no `tenant:create` script)
2. Visit `http://localhost:3000/autowash-pro` — each slug resolves its own manifest
3. Edit `hotsite_configs` directly in the local DB or use the dashboard at `http://localhost:3000/dashboard`

---

## 9. Deployment

**Runtime:** GCP Cloud Run (`ikaro-web`) — same service as the dashboard. One container handles all tenant slugs.

**Custom domains (post-MVP):** Cloud Run domain mapping allows `autowashpro.com.br` to point to the same service. Next.js middleware reads the `Host` header and uses it as the slug lookup key — no code changes needed.

**CI/CD:** Part of the shared pipelines (`pr-quality.yml`, `pr-tests.yml`, `deploy-staging.yml`, `deploy-production.yml`); `apps/web/` is built and deployed there. No separate hotsite pipeline. The one hotsite-specific deploy step is the template catalogue's image sync (§12): both `migrate-and-deploy` jobs upload any missing catalogue image to the public bucket before they migrate or deploy.

---

## 10. Extensibility Notes

The manifest pattern is designed to grow without rework:

| Future feature | How it fits |
|---|---|
| New module type | Add interface + component + add render branch in `app/[slug]/page.tsx` — rendering engine unchanged |
| Module layout variants | Add a `variant` field to the module's `data` interface — no manifest schema change |
| Deeper per-module theming | Add more `--ba-*` tokens to `applyBranding()` — all modules inherit automatically |
| Side-by-side columns | Wrap modules in a `ROW` container type with `columns` array — post-MVP |
| Drag-and-drop reorder | Admin UI change only — the ordered `layout` array already supports it |
| Custom domain per tenant | Cloud Run domain mapping + middleware Host header lookup — no code change |
| New business vertical | New module types + default layout presets per `businessType` — post-MVP |
| CDN / edge caching | Manifest endpoint already sets `Cache-Control: public, max-age=300`, and (since M12-S10) every image URL embedded in it is a permanent public-bucket address rather than an expiring signed URL — a CDN/edge layer (Cloud CDN, per `docs/TECH_STACK_DECISIONS.md`'s scaling plan) can front both the manifest and the public image bucket without changing the contract — post-MVP infra concern as hotsite traffic grows |

---

## 11. SEO & Discoverability (M12-S09)

### Site URL

`apps/web/features/platform/hotsite/seo.ts` exports `SITE_URL`, read from `NEXT_PUBLIC_SITE_URL` (`https://<ikaro-domain>` in production, `http://localhost:3000` in local dev). Every absolute URL used for canonical links, Open Graph, JSON-LD, and the sitemap is built from this constant — never hardcode `https://<ikaro-domain>`.

### Per-page metadata

`buildHotsiteMetadata({ manifest, slug, path? })` (also in `features/platform/hotsite/seo.ts`) builds a `Metadata` object (title, description, Open Graph, `robots`, `alternates.canonical`) from the manifest. Each route calls it from its own `generateMetadata` — **not** `app/[slug]/layout.tsx`. The layout is shared by `/[slug]` and `/[slug]/booking`, and Next.js does not deep-merge nested `openGraph`/`alternates` fields between a layout's and a page's `generateMetadata` — a layout-level canonical/OG `url` would leak into the booking page unchanged.

- `app/[slug]/page.tsx` — `buildHotsiteMetadata({ manifest, slug })`; canonical = `${SITE_URL}/${slug}`; `robots` follows `manifest.isPublished`
- `app/[slug]/servicos/[serviceSlug]/page.tsx` (TD56-S03, UC-109) — `buildHotsiteMetadata({ manifest, slug, path: '/servicos/<publicSlug>', override })`: the optional `override` (`title`, `description`, `ogImageUrl`) names the service (`<service> — <display name>`, its short description or the start of the long one, its cover image — the full URL the backend resolved, used as given: no web code composes a service image URL, `docs/API_CONTRACTS.md` Base Standards § 5) instead of the tenant's SEO identity; canonical is the detail URL; `robots` index only for a published hotsite + a published, active service, `noindex` for the unavailable state. The page and `generateMetadata()` share one `fetchServiceBySlug` (React `cache()`), which carries `hotsiteServicesCacheTag(slug)` — the tag service create/update already revalidates, so the route needs no `revalidate` handler change. Chrome: the same `HotsiteAuthBar` (with the NAVIGATION links), the page, and the `Footer` only when a FOOTER module is enabled; no chatbot widget. Its look is `SERVICE_LIST.data.detailPage` (defaults in `SERVICE_DETAIL_PAGE_DEFAULTS`, also used when the hotsite has no SERVICE_LIST); a Service List card set to `itemAction: 'details'` links to it only for a service whose `publicSlug` is non-null (published), else it keeps its booking action
- `app/[slug]/booking/page.tsx` — `buildHotsiteMetadata({ manifest, slug, path: '/booking' })`, with `title` overridden (`'Agendar serviço'` / `'Em breve — Ikaro'`) and `robots: { index: false, follow: false }` **always** — the booking flow is never indexed, regardless of publish status

**The one exception is `icons` (favicon, M18-S03):** `app/[slug]/layout.tsx` *does* define its own `generateMetadata()`, calling `buildHotsiteIconsMetadata(manifest)` (same file). This is safe specifically because `icons` is a field neither `page.tsx`'s `generateMetadata` nor `buildHotsiteMetadata()` ever sets — there's nothing for it to conflict with or get silently overridden by, unlike `openGraph`/`alternates` above, which both levels would need to touch. If a future change ever needs `icons` to vary by page (not just by tenant), move it back into `buildHotsiteMetadata()` and drop the layout-level `generateMetadata` instead of maintaining both.

Open Graph's `images` comes from `seo.ogImageUrl` (M18-S03) — a dedicated, auto-cropped-to-1200×630 field, decoupled from `branding.logoUrl` (which is small/square and only used for brand-mark rendering, never the share-image card). See §4 below for the full image-field list.

### Structured data

`app/[slug]/page.tsx` renders a `<script type="application/ld+json">` `LocalBusiness` block (`name: manifest.tenant.name`, `url: ${SITE_URL}/${slug}`) — home page only, not the booking page.

### Sitemap & robots

- `app/sitemap.ts` calls `fetchPublishedHotsiteSlugs()` (`apps/web/features/platform/api.server.ts`) and emits one entry per published tenant: `{ url: ${SITE_URL}/${slug}, lastModified: updatedAt }`, plus (TD56-S03) one `${SITE_URL}/${slug}/servicos/${publicSlug}` entry per active service whose public page is published — read from the same cached `fetchServices(slug)` the hotsite uses (web-side orchestration, no cross-tenant endpoint), ten tenants at a time. A tenant whose service list cannot be read is skipped (its home entry stays) so one failing tenant never breaks `/sitemap.xml`.
- *(Planned with Billing, UC-122: the sitemap list comes from `published-hotsites`, which gains an operational filter — a suspended tenant drops out — and the `robots` meta / `noindex` in each page's `generateMetadata` follow the effective `isPublished`; `app/robots.ts` itself is static and does not change.)*
- `app/robots.ts` allows `/`, disallows `/dashboard` and `/auth`, and references `${SITE_URL}/sitemap.xml`

### Published hotsites listing endpoint

`GET /v1/public/platform/published-hotsites` (BFF, `@Public()`, `PlatformPublicController`) → `{ items: Array<{ slug: string; updatedAt: string }> }`. Backed by `GET /internal/tenants/published-hotsites` (Platform context backend), returning one entry per tenant where `tenants.is_active = true AND hotsite_configs.is_published = true`, `updatedAt` = `hotsite_configs.updated_at` (ISO-8601 UTC). Full contract: `docs/API_CONTRACTS.md` § Published Hotsites Listing.

---

**Status:** Phase 2 - Technical Architecture — updated with full token system, typed module contracts, and developer extensibility guide.
**Validated:** Matches Multi-Tenancy Strategy, GCS photo upload flow (M115-S01), and UC-027 (admin manages hotsite).

---

## 12. Template Catalogue (TD56-S04)

> Adding a template, shipping a new version, the asset tools and the PR checklist: `packages/hotsite-templates/README.md`. The release and failure procedure for operators: `docs/RUNBOOKS.md` § Hotsite template catalogue.

A manager can start from one of six platform-owned compositions instead of configuring modules one at a time. The catalogue is data, not code: `packages/hotsite-templates/` holds each template's **structure** (`definitions/<id>.json`: module order, enabled set, variants, `presentation`, image paths, no visible text), its **text** (`copy/<locale>/<id>.json`, keyed `<MODULE_TYPE>.<dotted.path>`) and an append-only **asset manifest**; the image binaries live in the same package but ship only to the public bucket. The package README is the maintainer guide.

- **Templates never carry the planned `TRIAL_SIGNUP_CTA` module** (platform-owner tenant only, § TRIAL_SIGNUP_CTA): a template can be applied to any tenant, so template application must not carry that type (whether it ignores or rejects it is decided at story discovery), and the catalogue spec that compares every template layout to the full module registry (`catalogue.spec.ts`, "lists all twelve module types exactly once") needs an explicit exclusion for it.
- **Applying a template is a pure function** of the manager's current draft, the tenant and that tenant's language (`POST /v1/tenants/hotsite/templates/:templateId/apply`, `docs/API_CONTRACTS.md`). It returns a draft; nothing is saved, published or copied. What the draft keeps and what the template supplies: `docs/BUSINESS_LOGIC_REFERENCE.md` § Hotsite template application.
- **The result is an ordinary manifest.** Nothing in a tenant's saved config refers back to the catalogue except its image paths, so a later catalogue change never alters a tenant's site unless they apply a template again.
- **Catalogue images are shared, public, immutable and versioned**: `shared/hotsite-templates/<templateId>/v<n>/<file>.webp` in the existing public bucket (`ikaro-public-<env>`), referenced by every tenant that applied the template, never copied. A changed image ships as a new `v<n>`; a released object is never edited or removed. The path index that validation uses is the manifest (every released version), so a tenant on `v1` keeps saving after `v2` ships.
- **Resolving and saving** need no special handling beyond two rules: the image URL resolvers already build the public URL for any non-absolute path; and `stripResolvedImageUrls` (web) must recover `shared/hotsite-templates/…` from a resolved URL, or an applied draft cannot be saved.
- **Delivery** is the deploy pipelines' `sync-hotsite-template-assets` step (create-only, hash-checked, then verified over the public URL), not Terraform; immutability is enforced by a conditional `objectCreator` IAM grant (`infra/terraform/foundation`). Runbook: `docs/RUNBOOKS.md` § Hotsite template catalogue.
- **Adding a template, shipping a new version, retiring one**: the package README.
