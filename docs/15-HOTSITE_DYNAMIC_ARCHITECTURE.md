# Hotsite Dynamic Architecture - Ikaro

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

Instead of exposing raw CSS to the admin, we use a **semantic design token** system. The admin configures 10 tokens — some are direct values (color pickers, font selectors), others are semantic choices (e.g. "Rounded" instead of "8px"). These tokens are injected as CSS custom properties and inherited by every module automatically.

### Token Definition

```typescript
// packages/types/src/hotsite.ts

interface HotsiteBranding {
  // — Direct values (admin uses pickers) —
  primaryColor: string;       // hex — buttons, links, highlights
  secondaryColor: string;     // hex — section backgrounds, accents
  backgroundColor: string;    // hex — page background, default #ffffff
  textColor: string;          // hex — body text, default #111827
  headingFontFamily: string;  // e.g. "Playfair Display, serif"
  bodyFontFamily: string;     // e.g. "Inter, sans-serif"
  logoUrl: string;            // GCS URL

  // — Semantic choices (admin picks from options) —
  borderRadius: 'sharp' | 'rounded' | 'pill';
  buttonStyle:  'filled' | 'outline' | 'ghost';
  spacing:      'compact' | 'comfortable' | 'spacious';
  shadowStyle:  'none' | 'subtle' | 'strong';

  // — Optional button color overrides (M12-S11) — see "Button Color Tokens" below —
  buttonBackgroundColor?: string; // hex
  buttonTextColor?: string;       // hex
}
```

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

`font-config.ts` exports `FONT_VARIABLES` (array of CSS variable class names, applied to `<body className>`) and `FONT_MAP` (key → CSS variable string, e.g. `{ "Inter": "var(--font-inter)" }`). Unknown keys fall back to `"Inter"`.

### CSS Variable Mapping

The `applyBranding(branding)` helper (called in `app/[slug]/layout.tsx`) resolves semantic choices to CSS variables. Takes `HotsiteBrandingResponse` from `@ikaro/types`.

```typescript
// apps/web/features/platform/hotsite/apply-branding.ts

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

**Common mistake — partial pairing (caught in M13-S42 review):** setting `color: var(--ba-text)` on an element without *also* setting `backgroundColor: var(--ba-background)` (or `--ba-secondary` for a card/surface) on that same element silently falls back to the page's unbranded white default — `--ba-text` is calibrated against the **tenant's own** background, not against white. A dark-themed tenant (e.g. BeloAuto: `textColor: #FFFFFF`, `backgroundColor: #0A0A0A`) renders invisible white-on-white text wherever this pairing is missed. Symmetrically, any element with `backgroundColor: var(--ba-primary)` must pair it with `color: var(--ba-btn-text)` — never a hardcoded `#fff`/`text-white` — since `buttonTextColor` exists specifically so a tenant can fix poor contrast on their own primary color (BeloAuto's `#F5A800` orange needs dark text, not white, hence their explicit `buttonTextColor: #0A0A0A` override). Copying markup from the static prototypes (`plan/journey/shared/*.html`) is the most common way this slips in — those mockups are deliberately non-branding-aware and hardcode literal `white`/`black`.

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
| `HERO` | First impression + primary CTA | Manifest |
| `SERVICE_LIST` | Showcase services with prices | Booking context (live) |
| `GALLERY` | Before/after results | Admin-curated (booking photos + custom uploads) |
| `TESTIMONIALS` | Social proof | Manifest |
| `BOOKING_CTA` | Secondary call-to-action section | Manifest |
| `ABOUT` | Business / team story | Manifest |
| `CONTACT` | Address, phone, social, map | Tenant settings |
| `CHATBOT` | AI-assisted FAQ widget, scoped to the tenant's own business data | Booking context (live services) + tenant settings (`knowledgeText`), assembled BFF-side — never in the manifest, see § CHATBOT below |
| `LEAD_FORM` | Lead-capture form (manager-authored questions), teaser only in the manifest | Live question catalog fetched separately at `/[slug]/lead-form`, see § LEAD_FORM below |

The `FOOTER` is always rendered automatically from tenant settings — it is **not** part of the `layout` array.

### Module Type Union

```typescript
// packages/types/src/enums.ts — re-exported (not redeclared) from packages/types/src/hotsite.ts

type HotsiteModuleType =
  | 'HERO'
  | 'SERVICE_LIST'
  | 'GALLERY'
  | 'TESTIMONIALS'
  | 'BOOKING_CTA'
  | 'ABOUT'
  | 'CONTACT'
  | 'FOOTER'
  | 'CHATBOT'
  | 'LEAD_FORM';

interface HotsiteModule {
  type: HotsiteModuleType;
  enabled: boolean;   // false = skip rendering without removing from layout
  data: HotsiteModuleData[HotsiteModuleType];
}
```

---

## 4. Module Data Contracts (TypeScript)

All interfaces live in `packages/types/src/hotsite.ts` and are shared between the BFF, backend, and frontend.

### HERO

```typescript
interface HeroModuleData {
  variant: 'centered' | 'left-aligned';  // default: 'centered'
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
  showPrices: boolean;
  showPoints: boolean;   // show loyalty points per service
  layout: 'grid' | 'list';  // default: 'grid'
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
  images: GalleryImage[];    // admin-curated ordered list
  layout: 'grid' | 'masonry' | 'featured';   // default: 'grid'
  maxVisible: number;        // default 6 — "ver mais" shown if images.length > maxVisible
  featuredPosition?: 'left' | 'right';   // only meaningful when layout === 'featured' — which side images[0] (the large tile) renders on; default 'left' (M18-S07)
}
```

**Image hosting & URL resolution (M12-S10 — read this before M12-S02's original framing):**
Hotsite images are **public marketing assets** — unlike booking photos, there is no privacy reason to gate them. They live in a separate **public** GCS bucket with fixed, permanently-cacheable addresses (`IStorageService.getPublicUrl()` — a pure string template, no signed URL, no expiry, no regeneration). This is what makes the manifest's `Cache-Control: public, max-age=300` + Next.js ISR + future CDN (§10) actually safe to rely on: nothing inside the cached payload can expire mid-cache-window. `GetHotsiteManifestUseCase`/`GetHotsiteContentUseCase` resolve every stored `filePath` (`branding.logoUrl`, `seo.ogImageUrl` (M18-S03), module `*Url` fields, `GalleryImage.url`) to this public address before returning — one resolution path, used identically by the public manifest and the admin endpoint, regardless of `GalleryImage.source`.

Booking photos remain on the **private** bucket with the original "fresh read-signed URL generated at display time, never stored, 15-minute expiry" pattern (`docs/14-API_CONTRACTS.md`) — that pattern is correct *there* because those images genuinely must stay private. Hotsite images simply don't follow it.

**Image sources (both available in the dashboard editor):**
- **Custom upload:** Admin uploads their own images (e.g. Canva-edited before/after, logo, hero/CTA backgrounds, about photos) via `POST /v1/tenants/hotsite/images/signed-url` (M12-S02, retargeted to the public bucket by M12-S10). Same upload mechanics as M115-S01 — 15-minute *upload*-URL expiry, content-type lock, 10 MB cap — behind a hotsite-specific endpoint and path convention: `tenants/<tenantId>/hotsite/<purpose>/<uuid>/<fileName>`, where `purpose` groups assets by what they're for (`branding | hero | gallery | about | booking-cta | seo-og-image | lead-form` (M18-S03, extended M20-S08)). The upload-URL expiry is irrelevant once the file lands — the resulting object gets a permanent public address, not another expiring URL.
- **From bookings (`source: 'booking'`):** Admin browses a completed booking's photos — **before** (`beforeServicePhotoUrls`, from UC-001/UC-002) *and* after (`afterServicePhotoUrls`, from UC-009) are both selectable, since a compelling "before/after" showcase needs both — and features one via `POST /v1/tenants/hotsite/gallery/feature-booking-photo { bookingId, photoUrl }` (M12-S10). The backend derives `photoType` itself by checking which list the photo came from (never trusts a client-supplied label — also doubles as an integrity check: a `photoUrl` absent from both lists is rejected), then **copies** the object from the private booking-photos path into the public bucket. It's a copy, not a live reference: the featured image becomes an independent, permanent editorial choice, decoupled from whatever later happens to the source booking (archival, customer-initiated erasure under LGPD, disputes, etc.) — and avoiding a live reference is also what keeps it consistent with the "no expiring URLs in a cached manifest" rule above. This works identically for guest-originated bookings (`customerId: null`) and authenticated-customer bookings; `tenantId` is the only access boundary that matters.
- **Existence check before persisting:** Pre-signed URLs let the browser upload straight to GCS, bypassing the backend — so nothing guarantees the `filePath` the admin later submits in `PATCH /v1/tenants/hotsite` actually exists (closed tab, failed `PUT`, hand-crafted request). `UpdateHotsiteContentUseCase` calls `IStorageService.exists()` on every non-empty image path (`branding.logoUrl`, `seo.ogImageUrl` (M18-S03), module `backgroundImageUrl`/`imageUrl`/`avatarUrl`, and **all** `GALLERY` images regardless of `source` — both `upload` and the copies produced by `feature-booking-photo` resolve to public-bucket paths) before persisting, rejecting unresolvable paths with `400 hotsite-image-not-uploaded`. The same gap exists — and is fixed the same way — for booking photo paths (M12-S02 also retrofits `IStorageService.exists()` into the four booking use cases that accept `photoUrls`/`*ServicePhotoUrls`).

### TESTIMONIALS

```typescript
interface Testimonial {
  authorName: string;
  text: string;
  rating?: 1 | 2 | 3 | 4 | 5;
  avatarUrl?: string;    // GCS URL, optional
}

interface TestimonialsModuleData {
  title?: string;        // default "O que nossos clientes dizem"
  items: Testimonial[];
  layout: 'grid' | 'carousel';  // default: 'grid'
}
```

### BOOKING_CTA

```typescript
interface BookingCtaModuleData {
  variant?: 'centered' | 'left-aligned';  // default: 'centered'
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
  imageUrl?: string;                      // GCS URL — team/owner photo
  imagePosition: 'left' | 'right';       // default: 'right'
}
```

Useful for any business type: car wash owner story, dentist bio, salon team photo, mechanic certifications.

### CONTACT

```typescript
interface ContactModuleData {
  title?: string;          // default "Fale conosco"
  showAddress: boolean;
  showPhone: boolean;
  showWhatsapp: boolean;
  showEmail: boolean;
  showMap: boolean;        // Google Maps embed using address from tenants.settings.businessInfo
}
```

Social links (whatsapp, instagram, facebook) are **not stored in `ContactModuleData`**. They come from `tenants.settings.businessInfo.socialLinks`, resolved into `manifest.business.socialLinks` by `GetHotsiteManifestUseCase`. The admin edits them once on the tenant settings page — `ContactModule` renders them based on `business.socialLinks`.

`ContactModuleData` (manifest `layout[].data`) only carries **display preferences** — which sections to show. The actual **values** (address, phone, email, social links) live in `tenants.settings.businessInfo` (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §6) — the admin edits them once on the tenant settings page (UC-026), not per-module.

`GetHotsiteManifestUseCase` resolves `tenants.settings.businessInfo` into a top-level `business` field on the manifest (camelCased, sibling of `tenant`/`branding`/`layout`):

```typescript
// packages/types/src/hotsite.ts
interface HotsiteBusinessInfoResponse {
  phone: string | null;
  email: string | null;
  address: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  } | null;
  socialLinks: {
    whatsapp: string | null;   // validated phone number — used in wa.me/ links
    instagram: string | null;  // free-form URL / handle
    facebook: string | null;   // free-form URL / handle
  } | null;
}

interface HotsiteManifestResponse extends HotsiteResponse {
  tenant: TenantInfoResponse;
  business: HotsiteBusinessInfoResponse;
}
```

`business` is always present; any of `phone`/`email`/`address` may be `null` if the admin hasn't filled them in yet.

**`ContactModule` rendering rules:**
- `showAddress` → render `business.address` (formatted as "Rua, Número - Bairro, Cidade - UF, CEP"); section omitted if `business.address` is `null`, even when `showAddress: true`
- `showPhone` → render `business.phone` (formatted); omitted if `null`
- `showEmail` → render `business.email` as a `mailto:` link; omitted if `null`
- `showWhatsapp` → render a `https://wa.me/<digits>` link using `business.socialLinks.whatsapp`; omitted if `null`
- `business.socialLinks.instagram` / `business.socialLinks.facebook` → rendered as links when present, independent of the `showXxx` flags above
- `showMap` → embeds `https://maps.google.com/maps?q=<urlencoded address>&output=embed` (keyless query-based embed, no Google Maps API key needed) using `business.address`; omitted if `business.address` is `null`, even when `showMap: true`

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
- `tenants.settings.chatbot.knowledgeText` (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §7) — edited on the tenant settings page (UC-026), not the module editor, same reason `ContactModuleData` excludes `businessInfo`
- The 8 volume/cost caps + `llmProvider`/`llmModel` — not editable anywhere in the admin UI for MVP; fixed platform defaults, optional Ikaro-only per-tenant override (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §7)

**Why this split matters more here than for `CONTACT`:** the manifest is public and cached for 5 minutes (`Cache-Control: public, max-age=300`, § 2 above). Shipping `maxConversationsPerDay` or the raw `knowledgeText` into that payload would mean any visitor could read a tenant's cost-control settings and internal FAQ notes directly from the JSON response, whether or not the widget UI shows them.

**Availability is not derived from the manifest at all.** Unlike every other module, whether the `CHATBOT` widget actually renders depends on live, uncached state (per-tenant caps, LLM provider health, platform-wide spend/balance breakers) that can change from one request to the next — the `enabled: false` flag only covers the "admin turned this module off" case. The widget makes its own always-fresh pre-flight call on mount (`GET /public/platform/chatbot/status`, UC-034) before rendering anything; see `docs/14-API_CONTRACTS.md` § Chatbot Widget for the full contract and `docs/04-USE_CASES.md` UC-033/UC-034 for the three widget states (not available / active / interrupted).

**Module-config screen carries a standing disclosure, not shown for any other module type:** since availability depends on a platform-wide LLM provider account being funded and healthy — not just this tenant's own settings — the `CHATBOT` module's own config screen (`/dashboard/hotsite`, per-module drill-down) shows a permanent info note that a temporary provider/credit shortfall can disable the widget automatically, no tenant action needed. It also shows a red banner (not a permanent note — conditional) when this tenant's own daily conversation cap was already reached today (`docs/04-USE_CASES.md` UC-027 A5, `docs/14-API_CONTRACTS.md` § Chatbot Cap Status).

Full design rationale, cost model, and the ten-layer cap/abuse-prevention design: `docs/discovery/CHATBOT/CHATBOT.md`.

### LEAD_FORM

```typescript
interface LeadFormModuleData {
  title: string;                          // e.g. "Fale com a gente"
  subtitle?: string;
  eyebrow?: string;
  ctaLabel: string;                       // e.g. "Preencher formulário"
  variant?: 'centered' | 'left-aligned';  // default 'centered' — mirrors BookingCtaModuleData
  backgroundImageUrl?: string | null;
  backgroundImagePosition?: 'left' | 'center' | 'right';
  bgStyle?: 'primary' | 'background';     // default 'primary'
}
```

**Why the module data stays this small:** the manifest is public and cached 5 minutes (`Cache-Control: public, max-age=300`, §2 above). Embedding up to 20 questions (each with up to 10 options) would bloat every cached manifest fetch for the vast majority of visitors who never open the form — the same reasoning `SERVICE_LIST` already applies (display preferences only in the manifest; `services` fetched live via `fetchServices()`). The full question catalog is fetched only when a visitor actually reaches `/[slug]/lead-form` (`GET /public/platform/lead-form/:slug`, `docs/14-API_CONTRACTS.md` § Lead Form Widget).

**Placement:** `LEAD_FORM` is a normal entry in the `layout` array, reordered by the admin like every other module — not a special-cased widget.

**Disabled-module handling at the dedicated page:** unlike `CHATBOT` (whose availability is always live/uncached), `/[slug]/lead-form` checks the manifest's `layout` array directly for a `LEAD_FORM` module with `enabled: true` and renders the existing `<Unavailable/>` component when absent/disabled. This is genuinely new logic added by this module — no prior hotsite module had a dedicated page that checked its own `enabled` flag this way (`/[slug]/booking` only checks `manifest.isPublished`, never `BOOKING_CTA.enabled`).

Full design rationale, domain model, and use cases: `docs/discovery/lead-form-module/lead-form-module.md`, `docs/04-USE_CASES.md` UC-037–UC-043.

---

## 5. Next.js Routing & SSR Strategy

The hotsite lives inside the same `apps/web/` Next.js app as the dashboard, separated by route prefix.

**Route:** `app/[slug]/` (Next.js App Router dynamic segment)

```
https://<ikaro-domain>/autowash-pro          → app/[slug]/page.tsx
https://<ikaro-domain>/autowash-pro/booking  → app/[slug]/booking/page.tsx
https://<ikaro-domain>/dashboard             → app/dashboard/ (requires auth)
```

**`app/[slug]/layout.tsx`** — fetches manifest and applies full branding token set:

```typescript
import { fetchManifest } from '@/features/platform/hotsite/api/platform';
import { applyBranding } from '@/features/platform/hotsite/apply-branding';
import { FONT_VARIABLES } from '@/features/platform/hotsite/font-config';

export default async function HotsiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;  // Next.js 16: params is a Promise
}) {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);

  return (
    <html lang="pt-BR">
      <body
        style={applyBranding(manifest.branding)}
        className={FONT_VARIABLES.join(' ')}
      >
        {children}
      </body>
    </html>
  );
}
```

**`app/[slug]/page.tsx`** — renders enabled modules in manifest order. **Corrected 2026-08-08 (docs-audit, promoted via `/discovery-to-milestone` for the CHATBOT module):** the actual implementation is not a `MODULE_MAP` lookup table — it's a direct per-type component-import chain, fed by `buildHotsiteModuleRenderPlan()` (`apps/web/features/platform/hotsite/page-model.ts`), which does the generic `enabled` filter (the outcome this doc originally described is still accurate — no per-module logic needed for the on/off toggle — just not via the mechanism previously documented here):

```typescript
// apps/web/app/[slug]/page.tsx (real shape, simplified)
// Corrected 2026-08-08: the module components live under @/shells/hotsite/components/,
// not @/features/platform/hotsite/components/ — only buildHotsiteModuleRenderPlan()
// itself lives in the features/ slice. buildHotsiteModuleRenderPlan() also takes
// (layout, alternateSectionBg), not the whole manifest, and returns { parsed, bgVariant }
// items, not the parsed module directly.
import { buildHotsiteModuleRenderPlan } from '@/features/platform/hotsite/page-model';
import { HeroModule } from '@/shells/hotsite/components/HeroModule';
import { ServiceListModule } from '@/shells/hotsite/components/ServiceListModule';
import { ContactModule } from '@/shells/hotsite/components/ContactModule';
// ...one import per module component, including ChatbotModule once built
import { Footer } from '@/shells/hotsite/components/Footer';

export default async function HotsitePage({
  params,
}: {
  params: Promise<{ slug: string }>;  // Next.js 16: params is a Promise
}) {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);
  // does the enabled-filter, generically, once — also resolves each module's
  // alternating-section-background variant from the branding token
  const plan = buildHotsiteModuleRenderPlan(manifest.layout, manifest.branding.alternateSectionBg);

  return (
    <main>
      {plan.map(({ parsed, bgVariant }) => {
        let moduleEl = null;
        if (parsed.type === 'HERO') moduleEl = <HeroModule data={parsed.data} slug={slug} bgVariant={bgVariant} />;
        else if (parsed.type === 'SERVICE_LIST') moduleEl = <ServiceListModule data={parsed.data} slug={slug} bgVariant={bgVariant} />;
        else if (parsed.type === 'CONTACT') moduleEl = <ContactModule data={parsed.data} slug={slug} bgVariant={bgVariant} />;
        else if (parsed.type === 'CHATBOT') moduleEl = <ChatbotModule data={parsed.data} slug={slug} />;
        // ...one branch per module type
        else if (parsed.type === 'FOOTER') moduleEl = <Footer slug={slug} />; // FOOTER is one more branch here, not unconditionally appended outside the loop
        return moduleEl;
      })}
    </main>
  );
}
```

### Unpublished state (M12-S08)

When `manifest.isPublished === false`, `page.tsx` renders `<Unavailable />` (`apps/web/shells/hotsite/components/Unavailable.tsx`) instead of the module list — a generic "Em breve" placeholder. Because `app/[slug]/layout.tsx` has already applied `applyBranding(manifest.branding)`, `<Unavailable />` inherits the tenant's `var(--ba-*)` tokens automatically — for a freshly-provisioned tenant these resolve to `DEFAULT_HOTSITE_BRANDING`, so no special-casing is needed.

This differs from the **unknown-slug** case (`app/not-found.tsx`, root-level, M12-S08): there, `fetchManifest()` calls `notFound()` inside `app/[slug]/layout.tsx` before it ever renders, so no manifest/branding is available and the 404 page uses static Ikaro styling instead of `var(--ba-*)` tokens. The page must live at the `app/` root rather than `app/[slug]/` because Next.js does not let a segment's own `not-found.tsx` catch a `notFound()` thrown by that segment's own `layout.tsx`.

---

## 6. Manifest Caching

Next.js has **two independent caches** for hotsite requests:

- **Full Route Cache** (`export const revalidate` on the page/layout) — caches the final rendered HTML
- **Data Cache** (`next: { revalidate: N }` on individual `fetch()` calls) — caches individual API responses

Both must use the **same TTL** or they diverge. Use the shared constant from `apps/web/features/platform/hotsite/revalidate.ts`:

```typescript
// apps/web/features/platform/hotsite/revalidate.ts
export const HOTSITE_REVALIDATE_SECONDS = 300;
```

```typescript
// apps/web/app/[slug]/page.tsx  (and layout.tsx)
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

export async function fetchManifest(slug: string): Promise<HotsiteManifestResponse> {
  const isDev = process.env.NODE_ENV === 'development';
  const res = await bffPublicFetch(`/public/platform/manifest/${slug}`, {
    next: {
      revalidate: isDev ? 0 : HOTSITE_REVALIDATE_SECONDS,
      tags: [hotsiteManifestCacheTag(slug)],
    },
  });

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error('Failed to fetch manifest');

  return res.json();
}
```

`apps/web/features/platform/api.ts` (no `server-only`/`client-only` suffix distinction in the filename, but client-only in practice — imports `bffClient`, which asserts `'client-only'`) exports a separate `fetchManifestClient()` for the one caller that needs the manifest from the browser: `HotsitePreview.tsx`, the dashboard's live-preview-while-editing component. It carries no `next.revalidate`/`next.tags` — Next's Data Cache doesn't exist in the browser, so those options would be silently ignored there anyway; the preview is deliberately always-fresh, not cached. `features/platform/hotsite/api/services.ts`/`services.server.ts` follow the identical split for the services list.

The `isDev ? 0` guard disables caching in `NODE_ENV=development` so local edits are reflected immediately without cache busting.

**Cache behaviour:**
- First request → fetched from BFF, cached for 300 s
- Subsequent requests within 5 min → served from Next.js cache (no BFF call)
- After 5 min → revalidated in the background, stale served in the meantime
- Admin publishes/unpublishes (UC-027) → triggers on-demand revalidation (`revalidatePath('/[slug]')` via a secured `/api/revalidate` route, M12-S10) — changes go live immediately rather than waiting for the 5-minute ISR window
- Image URLs embedded in the manifest (`branding.logoUrl`, `seo.ogImageUrl`, module `*Url`, `GalleryImage.url`) are **permanent public addresses** (M12-S10 — see §4 "Image hosting & URL resolution"), not expiring signed URLs — this is what makes caching the manifest payload itself safe; nothing inside it can go stale mid-window

**Rule:** Never hardcode `300` or any revalidation number in a `fetch()` call or page export — always import from `features/platform/hotsite/revalidate.ts` so all TTLs move together.

**Session-aware widgets must not break this cache (M13-S42).** Any UI that needs to know whether the current visitor is logged in (e.g. `HotsiteAuthBar`) must be a `'use client'` component that fetches its own auth state *after* hydration — via a same-origin proxy route, see `docs/16-DASHBOARD_FRONTEND_ARCHITECTURE.md` §4 — and must **never** call `cookies()` from `next/headers` anywhere in the `[slug]` page/layout server-render tree. Calling `cookies()` there forces Next.js to treat the whole route as dynamic per-request, silently disabling the ISR cache above for every visitor, not just logged-in ones.

**`headers()` is the same trap as `cookies()`.** Both are Next.js "Dynamic APIs" — calling either one anywhere in the `[slug]` page/layout server-render tree forces the whole route dynamic, silently disabling ISR (and any future CDN cache) the same way. This surfaced concretely in AUD-007 (`td/TD08-AUDIT-REMEDIATION-BACKLOG.md`): a per-request CSP nonce for the JSON-LD script (`shells/hotsite/components/JsonLdScript.tsx`) would require reading the nonce via `headers()` in `app/[slug]/page.tsx` — which would have quietly killed this page's ISR cache. The nonce was dropped in favor of a scoped `script-src 'unsafe-inline'` CSP exception instead; see that story for the full rationale. Treat any future need to read `headers()` (or `cookies()`) in this route tree as a caching regression to solve around, not a one-line addition.

**Status: compliant.** `HotsiteAuthBar` (`apps/web/shells/hotsite/components/HotsiteAuthBar.tsx`) is a `'use client'` component that resolves its auth state after hydration via `GET /api/session` — a thin same-origin proxy route that reads the httpOnly cookie server-side and forwards it to the BFF's `GET /auth/session` — it does not call `cookies()`/`headers()` in the `[slug]` server-render tree. The BFF endpoint owns the actual orchestration: it reads the JWT's role from `@CurrentUser()` (populated by its own guard chain) and calls exactly the one relevant backend lookup (`/staff/me` for STAFF/MANAGER, `/customers/me` for CUSTOMER) rather than guessing both — combining is a BFF-orchestration concern, not web's, per the project's cross-context-read priority order. While the fetch is in flight the component renders a loading skeleton rather than the unauthenticated markup, so an authenticated visitor never sees a flash of "logged out" content. (Previously violated the `cookies()`/`headers()` constraint until fixed alongside the `revalidateTag` fix below — found via a live staging debugging session, TD35 follow-up; the two separate `/api/staff/me`/`/api/customers/me` client fetches were first consolidated into web's own `/api/session`, then that combining logic was moved into the BFF once review flagged it as orchestration that didn't belong in web — same PR.)

**On-demand revalidation uses `revalidateTag`, not just `revalidatePath`.** `revalidatePath('/${slug}', 'page')` alone doesn't reliably clear `fetchManifestResponse`'s Data Cache entry for a route that's forced fully dynamic — see the note above. `app/api/revalidate/route.ts` also tags the manifest fetch (`hotsiteManifestCacheTag(slug)`) and calls `revalidateTag(tag, { expire: 0 })`. Next 16 requires a second argument here; a named profile like `'max'` means stale-while-revalidate (serves old content once more, refreshes in the background) — **not** immediate invalidation. `{ expire: 0 }` forces a blocking cache-miss on the next request instead.

**Debugging the Data Cache directly:** set `NEXT_PRIVATE_DEBUG_CACHE=1` when running `pnpm start` to see Next's actual cache hit/miss/expire/set decisions logged to the server's own terminal — far more reliable than inferring from upstream (BFF) request logs, which get lost in unrelated noise (e.g. browser `favicon.ico` auto-requests hitting the `[slug]` catch-all).

---

## 7. Adding a New Module (Developer Checklist)

Follow these steps in order. Every step is mandatory.

**1. Define the data contract**

Add the new module-type string to `HOTSITE_MODULE_TYPES` in `packages/validation/src/hotsite.ts` — the canonical source since TD37-S21. The backend domain type (`apps/backend/src/contexts/platform/domain/hotsite-config.types.ts`) and its `MODULE_TYPES` runtime Set both derive from it automatically; no separate backend edit needed.

In the **same commit**, also add the new member to `HotsiteModuleType` in `packages/types/src/enums.ts` — this is a deliberately independent, web-facing copy (never derived from `@ikaro/validation`, which `apps/web` must not depend on), but `packages/architecture-check`'s `closedEnumRegistry` detector requires it to always match the canonical source exactly, in both directions. Unlike `LEAD_FORM`'s original rollout (M20-S01 → M20-S07, staged across multiple PRs), a staged rollout for this enum is no longer supported — a member missing from either side fails `pnpm architecture-check`. Add the TypeScript data-shape interface itself to `packages/types/src/hotsite.ts` (alongside the other `XxxModuleData` interfaces, which `HotsiteModuleType` is only re-exported from — not declared in). Keep the `data` shape flat — avoid deep nesting.

**2. Build the React component**

Create `apps/web/shells/hotsite/components/XxxModule.tsx`. Rules:
- Use **only** `var(--ba-*)` CSS variables for colors, fonts, radius, spacing, shadows — never hardcode visual values
- **Content-width convention:** any free-flowing content (not a full-bleed background image) must be nested in `mx-auto max-w-7xl` — the same container `ServiceListModule`/`AboutModule`/`ContactModule` already use, and `HeroModule`/`BookingCtaModule`'s "stage" div (M18-S05). The section's own padding (`px-6` or an equivalent inline `padding`) stays on the outer `<section>`; the `max-w-7xl mx-auto` layer wraps the content directly inside it. Any left/right positioning feature must anchor content *within* that container, never directly against the section's own edge — otherwise anchoring pushes content flush against the raw viewport edge on wide screens instead of respecting the site's usual content width (found only after M18-S05 shipped, via user feedback on a live wide-viewport screen — not caught by unit tests, which don't exercise real viewport widths).
- **Implicit vs. explicit CSS defaults:** a field documented as "unset renders identically to today" must check whether today's behavior is an *explicit* class/value or an *implicit* engine default before wiring the field's own default through generically. A generic "unset → apply this field's default" derivation is only actually a no-op for elements whose current output already matches that default explicitly — an element relying on an implicit default (e.g. a flex container with no `justify-content` at all, which browsers resolve to `normal`/`flex-start`) gets a real, silent behavior change the moment an explicit value for that same default is applied to it. **M18-S05 precedent (2026-07-30):** `HeroModule.tsx`'s CTA row had no `justify-content` class at all pre-story — unlike its sibling elements, which already hardcoded `items-center`/`justify-center` explicitly. Applying the new `contentPositionX` field's `'center'` default uniformly would have silently added `justify-center` to that one row, changing its real rendered position despite the story's own "identical to today" requirement; fixed by special-casing that one element to only apply a class when the field is explicitly set. Found via user review after the first push, not caught by the original implementation. Before trusting "defaults to X is safe" for every affected element, check each element's *actual current* CSS output, not just the containing pattern's stated intent.
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

Add an `else if (parsed.type === 'XXX')` branch (importing the new module's component) to the if/else-if chain in `apps/web/app/[slug]/page.tsx` — see § 3 "Module Type Union" above for the real, current shape of this chain (not a `MODULE_MAP` lookup table, corrected 2026-08-08).

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
1. Provision tenants via CLI (UC-024): `pnpm --filter backend tenant:create --slug autowash-pro ...`
2. Visit `http://localhost:3000/autowash-pro` — each slug resolves its own manifest
3. Edit `hotsite_configs` directly in the local DB or use the dashboard at `http://localhost:3000/dashboard`

---

## 9. Deployment

**Runtime:** GCP Cloud Run (`ikaro-web`) — same service as the dashboard. One container handles all tenant slugs.

**Custom domains (post-MVP):** Cloud Run domain mapping allows `autowashpro.com.br` to point to the same service. Next.js middleware reads the `Host` header and uses it as the slug lookup key — no code changes needed.

**CI/CD:** Part of the `apps/web/` pipeline — `ci-frontend.yml` + `deploy-frontend.yml`. No separate pipeline.

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
| CDN / edge caching | Manifest endpoint already sets `Cache-Control: public, max-age=300`, and (since M12-S10) every image URL embedded in it is a permanent public-bucket address rather than an expiring signed URL — a CDN/edge layer (Cloud CDN, per `docs/22-TECH_STACK_DECISIONS.md`'s scaling plan) can front both the manifest and the public image bucket without changing the contract — post-MVP infra concern as hotsite traffic grows |

---

## 11. SEO & Discoverability (M12-S09)

### Site URL

`apps/web/features/platform/hotsite/seo.ts` exports `SITE_URL`, read from `NEXT_PUBLIC_SITE_URL` (`https://<ikaro-domain>` in production, `http://localhost:3000` in local dev). Every absolute URL used for canonical links, Open Graph, JSON-LD, and the sitemap is built from this constant — never hardcode `https://<ikaro-domain>`.

### Per-page metadata

`buildHotsiteMetadata({ manifest, slug, path? })` (also in `features/platform/hotsite/seo.ts`) builds a `Metadata` object (title, description, Open Graph, `robots`, `alternates.canonical`) from the manifest. Each route calls it from its own `generateMetadata` — **not** `app/[slug]/layout.tsx`. The layout is shared by `/[slug]` and `/[slug]/booking`, and Next.js does not deep-merge nested `openGraph`/`alternates` fields between a layout's and a page's `generateMetadata` — a layout-level canonical/OG `url` would leak into the booking page unchanged.

- `app/[slug]/page.tsx` — `buildHotsiteMetadata({ manifest, slug })`; canonical = `${SITE_URL}/${slug}`; `robots` follows `manifest.isPublished`
- `app/[slug]/booking/page.tsx` — `buildHotsiteMetadata({ manifest, slug, path: '/booking' })`, with `title` overridden (`'Agendar serviço'` / `'Em breve — Ikaro'`) and `robots: { index: false, follow: false }` **always** — the booking flow is never indexed, regardless of publish status

**The one exception is `icons` (favicon, M18-S03):** `app/[slug]/layout.tsx` *does* define its own `generateMetadata()`, calling `buildHotsiteIconsMetadata(manifest)` (same file). This is safe specifically because `icons` is a field neither `page.tsx`'s `generateMetadata` nor `buildHotsiteMetadata()` ever sets — there's nothing for it to conflict with or get silently overridden by, unlike `openGraph`/`alternates` above, which both levels would need to touch. If a future change ever needs `icons` to vary by page (not just by tenant), move it back into `buildHotsiteMetadata()` and drop the layout-level `generateMetadata` instead of maintaining both.

Open Graph's `images` comes from `seo.ogImageUrl` (M18-S03) — a dedicated, auto-cropped-to-1200×630 field, decoupled from `branding.logoUrl` (which is small/square and only used for brand-mark rendering, never the share-image card). See §4 below for the full image-field list.

### Structured data

`app/[slug]/page.tsx` renders a `<script type="application/ld+json">` `LocalBusiness` block (`name: manifest.tenant.name`, `url: ${SITE_URL}/${slug}`) — home page only, not the booking page.

### Sitemap & robots

- `app/sitemap.ts` calls `fetchPublishedHotsiteSlugs()` (`lib/api/platform.ts`) and emits one entry per published tenant: `{ url: ${SITE_URL}/${slug}, lastModified: updatedAt }`
- `app/robots.ts` allows `/`, disallows `/dashboard` and `/auth`, and references `${SITE_URL}/sitemap.xml`

### Published hotsites listing endpoint

`GET /platform/published-hotsites` (BFF, `@Public()`, `PlatformPublicController`) → `{ items: Array<{ slug: string; updatedAt: string }> }`. Backed by `GET /internal/tenants/published-hotsites` (Platform context backend), returning one entry per tenant where `tenants.is_active = true AND hotsite_configs.is_published = true`, `updatedAt` = `hotsite_configs.updated_at` (ISO-8601 UTC). Full contract: `docs/14-API_CONTRACTS.md` § Published Hotsites Listing.

---

**Status:** Phase 2 - Technical Architecture — updated with full token system, typed module contracts, and developer extensibility guide.
**Validated:** Matches Multi-Tenancy Strategy, GCS photo upload flow (M115-S01), and UC-027 (admin manages hotsite).
