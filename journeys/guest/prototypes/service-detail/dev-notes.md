# Página do Serviço — Dev Notes

**Journey:** GUEST — Service Detail Page (`guest/service-detail.md`)
**UCs:** UC-109 (visitor), UC-013 A5 (manager side, `staff/prototypes/servicos/03g`–`03i`)
**Prototype:** `guest/prototypes/service-detail/` · **Story:** `TD56-S03` (🚧 not yet built)

## Routes and files

| Prototype file | Production |
|---|---|
| `01`, `01b`, `01c` | `app/[slug]/servicos/[serviceSlug]/page.tsx` → `shells/hotsite/components/ServiceDetailPage.tsx` (new) |
| `01d` | the same route, unavailable branch (same not-found treatment as other missing public pages; `noindex`) |
| `02` | `shells/hotsite/components/ServiceListModule.tsx` — `itemAction: 'details'` renders a link to the detail page using `publicSlug`; a service without `publicSlug` renders the booking action instead |
| nav bar | existing `HotsiteAuthBar` (NAVIGATION links desktop / menu mobile); the page renders no second header and no chatbot widget; `Footer` only when a FOOTER module is enabled |

The page inherits branding, locale and formatting from `app/[slug]/layout.tsx`. It must explicitly paint `backgroundColor: 'var(--ba-background)'` (hotsite full-page component rule).

## Data

| Need | Source |
|---|---|
| hotsite manifest, published flag, `SERVICE_LIST.data.detailPage` | existing manifest fetch (tag `hotsiteManifestCacheTag`) |
| the service | `GET /public/services/by-slug/:publicSlug` (BFF, tenant from `x-tenant-slug`) — name, short description, price, duration, loyalty points, `publicProfile` only; never booking configuration |
| `generateMetadata` | shares the page's fetch through React `cache()`; `buildHotsiteMetadata` gains an optional `title`/`description`/`ogImageUrl` override, `path: '/servicos/<slug>'` |
| sitemap | `sitemap.ts` lists one URL per service whose page is published, via the cached `fetchServices(slug)` per published tenant |

Cache: the by-slug fetch uses `hotsiteServicesCacheTag(slug)`, so the existing service create/update revalidation clears it; no `revalidate` route change is expected (every `apps/web` route renders per request) and a unit test pins the tag.

## `detailPage` settings → what changes (`01` vs `01b`)

| Setting | Values | Effect |
|---|---|---|
| `heroStyle` | `cover` / `compact` | tall cover image vs a thin banner (`01b`); no cover image at all (`01c`) means no hero block |
| `galleryLayout` | `grid` / `featured` | equal tiles vs first image full width (`01b`) |
| `showPrice`, `showDuration`, `showLoyaltyPoints` | boolean | hide the matching chip |
| `bookingCtaLabel` | ≤ 40 chars | button text (default "Agendar este serviço") |

## States

| State | Prototype | Rule |
|---|---|---|
| full profile | `01` | every optional block rendered |
| partial profile | `01c` | only existing blocks render — never an empty heading or placeholder box |
| unavailable | `01d` | hotsite unpublished, service inactive/missing, service page unpublished (republishing restores the same URL — no redirects needed) |
| hotsite `SERVICE_LIST` disabled | — | detail pages still resolve by URL with default `detailPage` settings; they are just not linked |

No loading state is drawn: the page is server-rendered per request, like the other hotsite pages.

## Markdown and links

The long description goes through the shared `RestrictedMarkdown` renderer (paragraphs, headings, emphasis, lists, links; no raw HTML, no images; links `rel="noopener noreferrer nofollow"`). Images only come from the validated cover/gallery slots.

## CTA

`/{slug}/booking?serviceId=<id>` via `buildBookingDeepLinkUrl` with `date` omitted (the builder makes `date` optional in this story). The booking page honours the seed only when the service is in its bookable list, so an inactive service falls through to the normal form.

## Known limitations

- The prototype uses gradients for images and a fixed tenant (Vitta Studio) with the default blue tokens; production uses the tenant's branding.
- `itemAction: 'details'` is only settable from the Story 5 editor controls or the manifest JSON until then.
