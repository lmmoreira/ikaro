# Hotsite Dynamic Architecture - BeloAuto

## Overview

BeloAuto provides each tenant with a professional, high-conversion hotsite. To support unique visual identities and varied content needs while maintaining a single codebase, we use a **Server-Driven Hotsite Manifest** strategy.

The frontend is a **Rendering Engine** — it reads a manifest from the BFF describing what to show, in what order, and how it should look. No code deployment is needed when a tenant changes their site.

---

## 1. The Hotsite Manifest Pattern

### Manifest Schema

```typescript
// packages/types/src/hotsite.ts

interface HotsiteManifest {
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  branding: HotsiteBranding;
  layout: HotsiteModule[];   // ordered — rendered top to bottom
  isPublished: boolean;
}
```

The `layout` array is **ordered and fully controlled by the admin**. The admin can add, remove, and reorder modules freely from the dashboard. The page renders exactly in that order, full-width, top to bottom.

---

## 2. Branding & Design Token System

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
}
```

### CSS Variable Mapping

The `applyBranding(branding)` helper (called in `app/[slug]/layout.tsx`) resolves semantic choices to CSS variables:

```typescript
// apps/web/lib/hotsite/apply-branding.ts

const BORDER_RADIUS = { sharp: '0px', rounded: '8px', pill: '9999px' };
const SECTION_PY    = { compact: '3rem', comfortable: '5rem', spacious: '8rem' };
const SHADOW        = {
  none:   'none',
  subtle: '0 1px 3px rgba(0,0,0,0.10)',
  strong: '0 4px 16px rgba(0,0,0,0.20)',
};
const BUTTON_VARIANT = { filled: 'filled', outline: 'outline', ghost: 'ghost' };

export function applyBranding(branding: HotsiteBranding): React.CSSProperties {
  return {
    '--ba-primary':       branding.primaryColor,
    '--ba-secondary':     branding.secondaryColor,
    '--ba-background':    branding.backgroundColor,
    '--ba-text':          branding.textColor,
    '--ba-heading-font':  branding.headingFontFamily,
    '--ba-body-font':     branding.bodyFontFamily,
    '--ba-radius':        BORDER_RADIUS[branding.borderRadius],
    '--ba-section-py':    SECTION_PY[branding.spacing],
    '--ba-shadow':        SHADOW[branding.shadowStyle],
    '--ba-btn-variant':   BUTTON_VARIANT[branding.buttonStyle],
  } as React.CSSProperties;
}
```

**Rule for module authors:** Every module must use only `var(--ba-*)` variables for colors, fonts, radius, spacing, and shadows. Never hardcode visual values. This guarantees every tenant's branding is applied consistently across all modules with zero extra work.

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

The `FOOTER` is always rendered automatically from tenant settings — it is **not** part of the `layout` array.

### Module Type Union

```typescript
// packages/types/src/hotsite.ts

type HotsiteModuleType =
  | 'HERO'
  | 'SERVICE_LIST'
  | 'GALLERY'
  | 'TESTIMONIALS'
  | 'BOOKING_CTA'
  | 'ABOUT'
  | 'CONTACT';

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
  backgroundImageUrl?: string;           // GCS URL — uploaded via dashboard
  ctaLabel: string;                      // e.g. "Agendar agora"
  ctaTarget: 'booking' | 'service-list'; // scroll target on click
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
}

interface GalleryModuleData {
  title?: string;            // default "Nossos Resultados"
  images: GalleryImage[];    // admin-curated ordered list
  layout: 'grid' | 'masonry';   // default: 'grid'
  maxVisible: number;        // default 6 — "ver mais" shown if images.length > maxVisible
}
```

**Image hosting & URL resolution (M12-S10 — read this before M12-S02's original framing):**
Hotsite images are **public marketing assets** — unlike booking photos, there is no privacy reason to gate them. They live in a separate **public** GCS bucket with fixed, permanently-cacheable addresses (`IStorageService.getPublicUrl()` — a pure string template, no signed URL, no expiry, no regeneration). This is what makes the manifest's `Cache-Control: public, max-age=300` + Next.js ISR + future CDN (§10) actually safe to rely on: nothing inside the cached payload can expire mid-cache-window. `GetHotsiteManifestUseCase`/`GetHotsiteContentUseCase` resolve every stored `filePath` (`branding.logoUrl`, module `*Url` fields, `GalleryImage.url`) to this public address before returning — one resolution path, used identically by the public manifest and the admin endpoint, regardless of `GalleryImage.source`.

Booking photos remain on the **private** bucket with the original "fresh read-signed URL generated at display time, never stored, 15-minute expiry" pattern (`docs/14-API_CONTRACTS.md`) — that pattern is correct *there* because those images genuinely must stay private. Hotsite images simply don't follow it.

**Image sources (both available in the dashboard editor):**
- **Custom upload:** Admin uploads their own images (e.g. Canva-edited before/after, logo, hero/CTA backgrounds, about photos) via `POST /v1/tenants/hotsite/images/signed-url` (M12-S02, retargeted to the public bucket by M12-S10). Same upload mechanics as M115-S01 — 15-minute *upload*-URL expiry, content-type lock, 10 MB cap — behind a hotsite-specific endpoint and path convention: `tenants/<tenantId>/hotsite/<purpose>/<uuid>/<fileName>`, where `purpose` groups assets by what they're for (`branding | hero | gallery | about | booking-cta`). The upload-URL expiry is irrelevant once the file lands — the resulting object gets a permanent public address, not another expiring URL.
- **From bookings (`source: 'booking'`):** Admin browses a completed booking's photos — **before** (`beforeServicePhotoUrls`, from UC-001/UC-002) *and* after (`afterServicePhotoUrls`, from UC-009) are both selectable, since a compelling "before/after" showcase needs both — and features one via `POST /v1/tenants/hotsite/gallery/feature-booking-photo { bookingId, photoUrl }` (M12-S10). The backend derives `photoType` itself by checking which list the photo came from (never trusts a client-supplied label — also doubles as an integrity check: a `photoUrl` absent from both lists is rejected), then **copies** the object from the private booking-photos path into the public bucket. It's a copy, not a live reference: the featured image becomes an independent, permanent editorial choice, decoupled from whatever later happens to the source booking (archival, customer-initiated erasure under LGPD, disputes, etc.) — and avoiding a live reference is also what keeps it consistent with the "no expiring URLs in a cached manifest" rule above. This works identically for guest-originated bookings (`customerId: null`) and authenticated-customer bookings; `tenantId` is the only access boundary that matters.
- **Existence check before persisting:** Pre-signed URLs let the browser upload straight to GCS, bypassing the backend — so nothing guarantees the `filePath` the admin later submits in `PATCH /v1/tenants/hotsite` actually exists (closed tab, failed `PUT`, hand-crafted request). `UpdateHotsiteContentUseCase` calls `IStorageService.exists()` on every non-empty image path (`branding.logoUrl`, module `backgroundImageUrl`/`imageUrl`/`avatarUrl`, and **all** `GALLERY` images regardless of `source` — both `upload` and the copies produced by `feature-booking-photo` resolve to public-bucket paths) before persisting, rejecting unresolvable paths with `400 hotsite-image-not-uploaded`. The same gap exists — and is fixed the same way — for booking photo paths (M12-S02 also retrofits `IStorageService.exists()` into the four booking use cases that accept `photoUrls`/`*ServicePhotoUrls`).

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
  title: string;                  // e.g. "Pronto para brilhar?"
  subtitle?: string;
  ctaLabel: string;               // e.g. "Agendar agora"
  backgroundImageUrl?: string;    // GCS URL, optional overlay background
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
  showMap: boolean;        // Google Maps embed using address from tenant settings
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    whatsapp?: string;     // full number with country code
  };
}
```

Contact data (address, phone, email) is pulled from `tenants.settings` at render time — the admin edits it once in the tenant settings page, not per-module.

---

## 5. Next.js Routing & SSR Strategy

The hotsite lives inside the same `apps/web/` Next.js app as the dashboard, separated by route prefix.

**Route:** `app/[slug]/` (Next.js App Router dynamic segment)

```
https://beloauto.com/autowash-pro          → app/[slug]/page.tsx
https://beloauto.com/autowash-pro/booking  → app/[slug]/booking/page.tsx
https://beloauto.com/dashboard             → app/dashboard/ (requires auth)
```

**`app/[slug]/layout.tsx`** — fetches manifest and applies full branding token set:

```typescript
import { fetchManifest } from '@/lib/api/tenant';
import { applyBranding } from '@/lib/hotsite/apply-branding';

export default async function HotsiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const manifest = await fetchManifest(params.slug);

  return (
    <html lang="pt-BR">
      <body style={applyBranding(manifest.branding)}>
        {children}
      </body>
    </html>
  );
}
```

**`app/[slug]/page.tsx`** — renders enabled modules in manifest order:

```typescript
import {
  HeroModule, ServiceListModule, GalleryModule,
  TestimonialsModule, BookingCtaModule, AboutModule, ContactModule,
} from '@/components/hotsite';
import { Footer } from '@/components/hotsite/Footer';

const MODULE_MAP: Record<HotsiteModuleType, React.ComponentType<{ data: any; slug: string }>> = {
  HERO:         HeroModule,
  SERVICE_LIST: ServiceListModule,
  GALLERY:      GalleryModule,
  TESTIMONIALS: TestimonialsModule,
  BOOKING_CTA:  BookingCtaModule,
  ABOUT:        AboutModule,
  CONTACT:      ContactModule,
};

export default async function HotsitePage({ params }: { params: { slug: string } }) {
  const manifest = await fetchManifest(params.slug);

  return (
    <main>
      {manifest.layout
        .filter((m) => m.enabled)
        .map((m) => {
          const Component = MODULE_MAP[m.type];
          return Component ? <Component key={m.type} data={m.data} slug={params.slug} /> : null;
        })}
      <Footer slug={params.slug} />
    </main>
  );
}
```

---

## 6. Manifest Caching

```typescript
// lib/api/tenant.ts
export async function fetchManifest(slug: string): Promise<HotsiteManifest> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BFF_URL}/tenants/slug/${slug}`,
    {
      headers: { 'X-Tenant-Slug': slug },
      next: { revalidate: 300 },  // ISR: revalidate every 5 minutes
    },
  );

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error('Failed to fetch manifest');

  return res.json();
}
```

**Cache behaviour:**
- First request → fetched from BFF, cached for 300 s
- Subsequent requests within 5 min → served from Next.js cache (no BFF call)
- After 5 min → revalidated in the background, stale served in the meantime
- Admin publishes/unpublishes (UC-027) → triggers on-demand revalidation (`revalidatePath('/[slug]')` via a secured `/api/revalidate` route, M12-S10) — changes go live immediately rather than waiting for the 5-minute ISR window
- Image URLs embedded in the manifest (`branding.logoUrl`, module `*Url`, `GalleryImage.url`) are **permanent public addresses** (M12-S10 — see §4 "Image hosting & URL resolution"), not expiring signed URLs — this is what makes caching the manifest payload itself safe; nothing inside it can go stale mid-window

---

## 7. Adding a New Module (Developer Checklist)

Follow these steps in order. Every step is mandatory.

**1. Define the data contract**

Add the TypeScript interface to `packages/types/src/hotsite.ts`. Add the new type to `HotsiteModuleType`. Keep the `data` shape flat — avoid deep nesting.

**2. Build the React component**

Create `apps/web/components/hotsite/XxxModule.tsx`. Rules:
- Use **only** `var(--ba-*)` CSS variables for colors, fonts, radius, spacing, shadows — never hardcode visual values
- Mobile-first responsive layout (Tailwind breakpoints: `sm`, `md`, `lg`)
- Accessible (WCAG 2.1 AA) — semantic HTML, `aria-label` where needed, sufficient color contrast
- Accept props: `data: XxxModuleData` and `slug: string`
- Write a Vitest unit test and a React Testing Library component test

**3. Register in MODULE_MAP**

Add the entry to `MODULE_MAP` in `apps/web/app/[slug]/page.tsx`.

**4. Add the admin configuration form**

Add a form panel for the new module inside the hotsite editor (UC-027, `apps/web/app/dashboard/settings/hotsite/`). The form must allow the admin to fill in all `data` fields and toggle `enabled`.

**5. Update this document**

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

**Runtime:** GCP Cloud Run (`beloauto-web`) — same service as the dashboard. One container handles all tenant slugs.

**Custom domains (post-MVP):** Cloud Run domain mapping allows `autowashpro.com.br` to point to the same service. Next.js middleware reads the `Host` header and uses it as the slug lookup key — no code changes needed.

**CI/CD:** Part of the `apps/web/` pipeline — `ci-frontend.yml` + `deploy-frontend.yml`. No separate pipeline.

---

## 10. Extensibility Notes

The manifest pattern is designed to grow without rework:

| Future feature | How it fits |
|---|---|
| New module type | Add interface + component + register in MODULE_MAP — rendering engine unchanged |
| Module layout variants | Add a `variant` field to the module's `data` interface — no manifest schema change |
| Deeper per-module theming | Add more `--ba-*` tokens to `applyBranding()` — all modules inherit automatically |
| Side-by-side columns | Wrap modules in a `ROW` container type with `columns` array — post-MVP |
| Drag-and-drop reorder | Admin UI change only — the ordered `layout` array already supports it |
| Custom domain per tenant | Cloud Run domain mapping + middleware Host header lookup — no code change |
| New business vertical | New module types + default layout presets per `businessType` — post-MVP |
| CDN / edge caching | Manifest endpoint already sets `Cache-Control: public, max-age=300`, and (since M12-S10) every image URL embedded in it is a permanent public-bucket address rather than an expiring signed URL — a CDN/edge layer (Cloud CDN, per `docs/22-TECH_STACK_DECISIONS.md`'s scaling plan) can front both the manifest and the public image bucket without changing the contract — post-MVP infra concern as hotsite traffic grows |

---

**Status:** Phase 2 - Technical Architecture — updated with full token system, typed module contracts, and developer extensibility guide.
**Validated:** Matches Multi-Tenancy Strategy, GCS photo upload flow (M115-S01), and UC-027 (admin manages hotsite).
