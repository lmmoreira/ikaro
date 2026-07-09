# API Contracts - Ikaro

## Overview

Ikaro follows a **RESTful API** standard using **JSON** for all payloads. All communication must be encrypted over **HTTPS**.

**Error Response Standard:** [RFC 9457 Problem Details](https://tools.ietf.org/html/rfc9457) — see [25-ERROR_CATALOG.md](25-ERROR_CATALOG.md) for complete error reference.

---

## Base Standards

### 1. **Base URL**
All endpoints are served by the **BFF** (`apps/bff/`) — the frontend never calls the backend directly.

- **Production:** `https://bff.<ikaro-domain>/v1`
- **Staging:** `https://ikaro-bff-staging-<hash>-uc.a.run.app/v1` (get URL from `terraform output bff_url`)
- **Local:** `http://localhost:3002/v1`

> The backend (`apps/backend/`) is an internal Cloud Run service. It is not publicly reachable. Only the BFF calls it, via `BACKEND_INTERNAL_URL`.

### 2. **Tenant Scoping (Mandatory)**
- **Public/Guest Endpoints:** Must include `X-Tenant-Slug` header (e.g., `autowash-pro`).
- **Authenticated Endpoints:** Must include `Authorization: Bearer <JWT>`.
- **Validation:** The BFF will reject any request where the `X-Tenant-Slug` does not match the `tenantId/slug` context in the JWT (for authenticated requests).

### 3. **Pagination Strategy — Three Incompatible Shapes (Known Inconsistency)**

> ⚠️ **Known inconsistency — tech debt, not a typo.** List endpoints were originally designed around one universal `{ data, pagination }` shape. In practice, three different shapes were implemented across BFF modules, and a fourth endpoint returns no pagination wrapper at all. This section documents what each endpoint **actually** returns today. Do not "fix" one example to match another without a coordinated cross-module change — see the callout at the end of this section before unifying them.

#### **Pattern A — Offset-based, `items` key, no `nextOffset`**

Used by `GET /bookings` (`BookingListResponse`, `apps/bff/src/features/booking/bookings.types.ts`).

```
GET /bookings?status=APPROVED&limit=10&offset=0
Response:
{
  "items": [ /* 10 bookings */ ],
  "pagination": { "limit": 10, "offset": 0, "total": 45, "hasMore": true }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `items` | array | Array of items for this page |
| `pagination.limit` | integer | Requested limit |
| `pagination.offset` | integer | Requested offset |
| `pagination.total` | integer | Total count of all items |
| `pagination.hasMore` | boolean | true = more items beyond this page |

#### **Pattern B — Offset-based, `items` key, with `nextOffset`**

Used by `GET /staff` (`StaffListResponse`, `apps/bff/src/features/staff/staff.types.ts`).

```
GET /staff?limit=25&offset=0
Response:
{
  "items": [ /* 25 staff members */ ],
  "pagination": { "limit": 25, "offset": 0, "total": 8, "hasMore": false, "nextOffset": 25 }
}
```

Same fields as Pattern A, plus `pagination.nextOffset` (convenience: `offset + limit`).

#### **Pattern C — Page-based, custom item key, no `hasMore`/`nextOffset`**

Used by `GET /loyalty/entries` and `GET /loyalty/redemptions` (`LoyaltyEntriesResponse` / `LoyaltyRedemptionsResponse`, `apps/bff/src/features/loyalty/loyalty.types.ts`). The item array key matches the resource name (`entries`, `redemptions`) rather than a generic `items`/`data`.

```
GET /customers/:id/loyalty/entries?page=1&limit=20
Response:
{
  "entries": [ /* 20 entries */ ],
  "pagination": { "page": 1, "limit": 20, "total": 83 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `entries` | array | Array of items for this page (named after the resource — `redemptions` for the redemptions endpoint) |
| `pagination.page` | integer | 1-indexed page number (not an offset) |
| `pagination.limit` | integer | Requested page size |
| `pagination.total` | integer | Total count of all items |

#### **Pattern D — Unpaginated (full list)**

Used by `GET /services` (`HotsiteServiceListResponse`, `packages/types/src/hotsite.ts`) — see "Services List" example below. No `limit`/`offset`/`page` query params accepted; no pagination wrapper in the response.

```
GET /services
Response:
{ "items": [ /* all active services for the tenant */ ] }
```

#### **Important Notes:**

1. **Total Count**: Computing `total` requires a COUNT query. For performance-sensitive endpoints, consider caching or omitting `total` on subsequent pages.
2. **Validation** (Patterns A/B): `limit` must be 1–100 (`400` if not); `offset` must be ≥ 0 (`400` if not).
3. **Validation** (Pattern C): `page` must be ≥ 1; `limit` must be 1–100.
4. **New endpoints:** pick whichever existing pattern is closest to the consuming module's other endpoints — do not introduce a fifth shape.

> ⚠️ **Known inconsistency — worth unifying later.** Having three paginated shapes (plus one unpaginated endpoint) is tech debt: frontend fetchers cannot share a single generic pagination hook/type today. This is intentionally **not** silently merged into one "corrected" shape in this doc, because doing so would misrepresent what the code returns. If/when this is unified, update this section, the affected BFF response types, and every frontend consumer in the same change.

#### **Future: Cursor-Based Pagination**

For even better performance with large datasets (Phase 2), consider cursor-based pagination:
- Use `after` cursor instead of `offset`
- Cursor encodes the last item's ID and sort value
- More efficient, no deep scanning needed
- Can be introduced non-breaking: keep limit/offset, add `after` as alternative

---

## 1. Authentication & Multi-Tenancy

### **Auth Flow (UC-021, UC-022, UC-023)**
- `GET /auth/google` -> Redirects to Google OAuth.
- `GET /auth/google/callback` -> Sets `access_token` httpOnly cookie directly and redirects; no intermediate temporary-code step for the flows that ship today.
- `GET /auth/logout` -> Clears the `access_token` cookie, redirects to the hotsite (or bare frontend URL if `tenantSlug` is absent/invalid).
- `POST /auth/switch-tenant` -> (UC-023, customer) `{ targetTenantId: uuid }` — sets `access_token` httpOnly cookie with new tenant scope; returns `{ tenantSlug: string; expiresIn: string }`. No JWT in response body.
- `GET /auth/staff-tenants` -> (UC-022, staff, authenticated) Lists every active tenant the current Google account is staff at.
- `POST /auth/switch-staff-tenant` -> (UC-022, staff) Same shape as the customer switch, staff-scoped.

> **Removed (`M13-S14`):** `POST /auth/token` and `GET /auth/tenants` — the pre-login `/select-tenant` customer flow they backed was descoped as unreachable from any shipped UI (every customer login starts from a specific tenant's hotsite, which always supplies the tenant slug directly). Do not resurrect these without a real requirement driving them — see `docs/04-USE_CASES.md` UC-021's note.

### **JWT Structure**
```json
{
  "sub":        "user-uuid-v7",
  "tenantId":   "tenant-uuid-v7",
  "tenantSlug": "autowash-pro",
  "tenantName": "AutoWash Pro",
  "userName":   "Maria Silva",
  "role":       "CUSTOMER | STAFF | MANAGER",
  "locale":     "pt-BR",
  "iat":        123456789,
  "exp":        123456789
}
```
`tenantName`/`userName`/`locale` were added in `M13-S15` specifically so the dashboard/customer shells never need a separate profile fetch just to render a greeting/name.

| Role | Who | Access |
|---|---|---|
| `CUSTOMER` | Authenticated customer | Own bookings, loyalty, profile |
| `STAFF` | Regular employee | All bookings, services, schedule |
| `MANAGER` | Admin/owner (MANAGER role) | Everything STAFF can do + tenant settings, staff management, hotsite |

> **Guest bookings** (UC-001) carry no JWT. The BFF identifies them by the absence of an `Authorization` header. Tenant context comes from the `X-Tenant-Slug` header.

---

## 2. Tenant & Service Discovery

### **Tenant Hotsite Manifest (Public — UC-001, UC-011, M12-S01)**
Used by the Next.js hotsite renderer to fetch full branding and layout for a tenant slug.
- `GET /platform/manifest/:slug`
- **Public** — no auth required; no `X-Tenant-Slug` header needed (slug is the path param)
- **Response headers:** `Cache-Control: public, max-age=300` (Next.js ISR respects this)
- **Response:** `200 OK` with **Hotsite Manifest**:
  ```json
  {
    "tenant": { "id": "uuid-v7", "name": "Lavacar BeloAuto", "slug": "lavacar-beloauto" },
    "branding": {
      "primaryColor": "#f97316",
      "secondaryColor": "#fff7ed",
      "backgroundColor": "#ffffff",
      "textColor": "#111827",
      "headingFontFamily": "Inter, sans-serif",
      "bodyFontFamily": "Inter, sans-serif",
      "logoUrl": "https://storage.googleapis.com/tenants/.../logo.png",
      "borderRadius": "rounded",
      "buttonStyle": "filled",
      "spacing": "comfortable",
      "shadowStyle": "subtle",
      "buttonBackgroundColor": "#fbbf24",
      "buttonTextColor": "#0f172a"
    },
    "layout": [
      { "type": "HERO",         "enabled": true,  "data": { "variant": "centered", "title": "Bem-vindo", "ctaLabel": "Agendar agora", "ctaTarget": "booking" } },
      { "type": "SERVICE_LIST", "enabled": true,  "data": { "showPrices": true, "showPoints": true, "layout": "grid" } },
      { "type": "GALLERY",      "enabled": false, "data": { "images": [], "layout": "grid", "maxVisible": 6 } }
    ],
    "isPublished": true,
    "business": {
      "phone": "31999999999",
      "email": "contato@lavacar.com.br",
      "address": {
        "street": "Rua das Flores", "number": "123", "complement": "Loja 2",
        "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130000"
      }
    },
    "localization": { "language": "pt-BR" },
    "seo": { "title": null, "description": null }
  }
  ```
- **Module types:** `HERO | SERVICE_LIST | GALLERY | TESTIMONIALS | BOOKING_CTA | ABOUT | CONTACT`
- **`enabled: false`** modules are included in the response; the frontend decides to skip them
- **`business`** (M12-S06) — resolved from `tenants.settings.businessInfo` (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §6), camelCased. Always present; any of `phone`/`email`/`address` may be `null` if the admin hasn't filled them in. Consumed by the `CONTACT` module — see `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §4 CONTACT.
- **`localization`** (M12-S09) — `language` resolved from `tenants.settings.localization.language` (`docs/21-TENANTS_SETTINGS_SCHEMA.md` §5), e.g. `"pt-BR"`. Always present, falling back to `"pt-BR"` when `isPublished: false`. Drives the hotsite's `og:locale` (converted to `pt_BR` format).
- **`seo`** (M12-S09) — tenant-configured `title`/`description` overrides, edited via `PATCH /v1/tenants/hotsite` (see "Hotsite Admin Management" below). Both fields are `string | null`; `null` means the admin hasn't set an override. When `null`, the frontend (`buildHotsiteMetadata()`) falls back to a generated `<title>`/meta description derived from `tenant.name` and `business.address` (city/state).
- **`isPublished: false`** — still a `200`, not a `404`. Minimal payload: `branding` reflects the admin's configured (but unpublished) branding — needed so the "Em breve" placeholder (M12-S08) can render with the tenant's `var(--ba-*)` tokens. `layout: []` and `business` (all fields `null`) are stubbed — this public, unauthenticated endpoint never exposes a tenant's draft layout/services/gallery/contact info before they publish. (The admin's full draft state remains available via the authenticated `GET /v1/tenants/hotsite` below.)
- `404` — tenant slug not found (no `HotsiteConfig` reachable for this slug at all)

### **Published Hotsites Listing (Public — M12-S09)**
Used by `app/sitemap.ts` to enumerate every published tenant hotsite for search-engine discovery.
- `GET /platform/published-hotsites`
- **Public** — no auth required
- **Response:** `200 OK`
  ```json
  {
    "items": [
      { "slug": "lavacar-beloauto", "updatedAt": "2026-06-10T12:00:00.000Z" }
    ]
  }
  ```
- Only includes tenants where `tenants.is_active = true` AND `hotsite_configs.is_published = true`
- `updatedAt` is `hotsite_configs.updated_at` (ISO-8601 UTC) — used as `lastmod` in the sitemap
- Backed by `GET /internal/tenants/published-hotsites` (Platform context, gated by the global `InternalApiGuard`)

### **Hotsite Admin Management (Admin — UC-027, M12-S02)**
Lets a `MANAGER` configure branding, layout modules, and publish status. Mirrors the public manifest's `branding`/`layout`/`isPublished` shape, but `GET` always returns the full draft state regardless of publish status — unlike the public endpoint, which stubs `layout: []` and `business` (all fields `null`) when `isPublished: false` (see §1 above).

- `GET /v1/tenants/hotsite` → `200 { branding, layout, seo, isPublished, updatedAt }` — `MANAGER` only
- `PATCH /v1/tenants/hotsite` → body `{ branding?, layout?, seo? }` (partial update — unspecified fields unchanged); `200` returns updated state
  - Validation: hex colors must be `#rrggbb` · `borderRadius/buttonStyle/spacing/shadowStyle` must be known enum values · layout module `type` must be a known `HotsiteModuleType` — any violation → `400`
  - `branding.buttonBackgroundColor`/`branding.buttonTextColor` (M12-S11) are optional hex overrides for CTA button colors — see `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §2 "Button Color Tokens" for `filled`/`outline`/`ghost` semantics
  - Image promotion (TD22): every non-empty image path submitted (`branding.logoUrl`, module `backgroundImageUrl`/`imageUrl`/`avatarUrl`, `GALLERY` images with `source: 'upload'`) is either a `tmp/<tenantId>/...` staging path — validated (tenant-owned, exists in the private bucket), promoted to a permanent `tenants/<tenantId>/hotsite/<purpose>/<uuid>/<fileName>` object in the public bucket, then rewritten and the tmp original deleted — or an already-permanent `tenants/<tenantId>/hotsite/...` path, validated as still existing and left untouched. A path matching neither shape, a cross-tenant `tmp/` path, or a nonexistent object → `400 hotsite-image-not-uploaded`. A field that changed from one permanent object to another also deletes the superseded object from the public bucket (delete-previous-on-replace); an untouched field is never re-promoted or deleted. See "Hotsite Image Upload" below for the full contract.
  - `seo.title`/`seo.description` (M12-S09) are optional `string | null` overrides for the public hotsite's `<title>`/meta description — `title` max 70 chars, `description` max 160 chars; exceeding either → `400`
- `POST /v1/tenants/hotsite/publish` → `200 { isPublished: true }`; `400 publish-requires-enabled-module` if the layout has no `enabled: true` modules
- `POST /v1/tenants/hotsite/unpublish` → `200 { isPublished: false }`
- All four require JWT + `MANAGER` role — `STAFF` gets `403`

### **Hotsite Image Upload (Admin — UC-027, M12-S02 + M12-S10; tmp/ staging — TD22)**
Generates a GCS signed **upload** URL for hotsite images (logo, hero/CTA backgrounds, gallery, about photos). Reuses the same `IStorageService`/`GcsSignedUrlAdapter` and upload constraints introduced for booking attachments in M115-S01 (15-minute *upload*-URL expiry, content-type lock, 10 MB cap) — no new upload mechanics.

> **Staging, not final placement (TD22):** the signed URL targets a `tmp/<tenantId>/<purpose>/<uuid>/<fileName>` path in the **private** media bucket — not the public hotsite bucket. Nothing uploaded here is public or permanent yet. The object only becomes a real, publicly-addressable hotsite asset once `PATCH /v1/tenants/hotsite` promotes it (see below). This closes three leaks the previous "upload straight to the public bucket" design had: an abandoned upload, an explicit "Remove" before save, and a superseded upload all used to leave an orphaned object in the public bucket forever — see `td/TD22-ORPHANED-UPLOAD-CLEANUP.md`.

**BFF:** `POST /v1/tenants/hotsite/images/signed-url`
- Requires JWT + `MANAGER` role

- **Request body:**
  ```json
  {
    "fileName":    "logo.png",
    "contentType": "image/png",
    "purpose":     "branding"
  }
  ```
  `purpose`: one of `branding | hero | gallery | about | booking-cta | testimonials` — groups uploaded assets by what they're for; also encoded into the staging path so promotion can rebuild the permanent path without a second lookup.

- **Response (201 Created):**
  ```json
  {
    "signedUrl": "http://localhost:4443/ikaro-local/tmp/.../logo.png?X-Goog-Signature=...",
    "filePath":  "tmp/<tenantId>/<purpose>/<uuid>/logo.png",
    "expiresAt": "2026-05-12T00:08:44Z"
  }
  ```

**Storage path rule:** `tmp/<tenantId>/<purpose>/<uuid>/<fileName>` — staged in the **private** media bucket. Not public, not permanent, not yet referenced by anything durable.

`filePath` is what the frontend holds as the field's draft value until the next save. **`PATCH /v1/tenants/hotsite` promotes every `tmp/`-referenced field**: validates the tmp object exists in the private bucket and belongs to the caller's tenant, copies it to `tenants/<tenantId>/hotsite/<purpose>/<uuid>/<fileName>` in the **public** hotsite bucket, rewrites the stored reference to that permanent path, and deletes the tmp original. If the field previously pointed at a different permanent object, that old object is deleted too (delete-previous-on-replace); a field left untouched (still pointing at its existing permanent object) is neither re-promoted nor deleted. **Reading hotsite images back** (post-promotion) works differently from booking attachments: because the object lives in a public bucket, `GetHotsiteManifestUseCase`/`GetHotsiteContentUseCase` resolve `filePath` to a **permanent public URL** via `IStorageService.getPublicUrl()` — a pure string template, no signed URL, no expiry, nothing to regenerate. The admin endpoint (`GET /v1/tenants/hotsite`) and the public manifest (`GET /v1/platform/manifest/:slug`) both return this same resolved address. This is what makes the manifest safely cacheable (`Cache-Control: public, max-age=300`, ISR, future CDN) — an expiring signed URL embedded in cached content would eventually serve a broken image.

(Contrast with booking attachments below, where the bucket is private and a fresh *read*-signed URL genuinely must be minted per display.)

**Error responses:** same constraint set as booking attachments (`400 invalid-file-name`, `400 unsupported-media-type`, plus `400` for an unknown `purpose`) — see §3 Media Upload below for the shared validation table. `PATCH /v1/tenants/hotsite` additionally returns `400 hotsite-image-not-uploaded` for a `tmp/` path that doesn't exist or belongs to another tenant.

### **Hotsite Image Preview — Private Read Signed URL (Admin — TD22)**
A not-yet-promoted `tmp/` image lives in the private bucket, so it can't resolve via the public-bucket string template the admin editor otherwise uses for hotsite images. This endpoint mints a fresh private *read*-signed URL for previewing one — used whenever the editor re-mounts a field showing a `tmp/`-prefixed value with no local blob preview left (e.g. switching tabs before the first save).

**BFF:** `POST /v1/tenants/hotsite/images/read-signed-url`
- Requires JWT + `MANAGER` role

- **Request body:**
  ```json
  { "filePath": "tmp/<tenantId>/<purpose>/<uuid>/logo.png" }
  ```

- **Response (201 Created):**
  ```json
  {
    "signedUrl": "http://localhost:4443/ikaro-local/tmp/.../logo.png?X-Goog-Signature=...",
    "expiresAt": "2026-05-12T00:08:44Z"
  }
  ```

**Error responses:** `400 hotsite-image-not-uploaded` — `filePath` isn't a `tmp/<callerTenantId>/...` path.

### **Hotsite Gallery — Feature a Booking Photo (Admin — UC-027, M12-S02 + M12-S10)**
Lets the admin curate the GALLERY module's "before/after" showcase by selecting a photo straight from one of the tenant's own bookings — guest or authenticated-customer, it makes no difference; `tenantId` is the only check that matters.

**BFF:** `POST /v1/tenants/hotsite/gallery/feature-booking-photo`
- Requires JWT + `MANAGER` role

- **Request body:**
  ```json
  { "bookingId": "uuid", "photoUrl": "tenants/<tenantId>/bookings/<bookingId>/car-front.jpg" }
  ```

- **Response (201 Created):**
  ```json
  {
    "filePath":  "tenants/<tenantId>/hotsite/gallery/<uuid>/car-front.jpg",
    "url":       "https://storage.googleapis.com/ikaro-hotsite-public-prod/tenants/.../car-front.jpg",
    "photoType": "before"
  }
  ```

**What happens server-side:**
1. Loads the `Booking` by `(tenantId, bookingId)` — `404` if it doesn't belong to the caller's tenant
2. Derives `photoType` by checking whether `photoUrl` is present in `booking.beforeServicePhotoUrls` (→ `"before"`) or `booking.afterServicePhotoUrls` (→ `"after"`) — **never** trusts a client-supplied type. A `photoUrl` absent from both → `400` (this is also the integrity check confirming the photo genuinely belongs to that booking)
3. Copies the object from the private booking-photos path to `tenants/<tenantId>/hotsite/gallery/<uuid>/<fileName>` in the **public** hotsite bucket via `IStorageService.copy()` — a copy, not a live reference, so the featured image survives independently of whatever later happens to the source booking (archival, an LGPD erasure request, a dispute, etc.)

The frontend then includes the returned `{ url, photoType }` (plus `bookingId` and an optional `caption`) as a `GalleryImage` entry in the next `PATCH /v1/tenants/hotsite` call — see `docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md` §4.

**Error responses:**
- `400` — `photoUrl` not found in either of the booking's photo lists
- `404` — booking not found for the caller's tenant
- `403` — caller is `STAFF`, not `MANAGER`

### **Service Management (Admin - UC-012, UC-013)**
- `GET /public/services` -> List **active-only** services for the hotsite (Public, no JWT — `X-Tenant-Slug` header). **Unpaginated** — no `limit`/`offset` query params accepted; returns `{ items: [...] }` (`HotsiteServiceListResponse`, see Pagination Strategy Pattern D above). Each item includes:
  ```json
  {
    "id": "uuid", "name": "Coleta e Entrega", "description": "...",
    "price": { "amount": 20.00, "currency": "BRL", "formatted": "R$ 20,00" },
    "durationMinutes": 15, "loyaltyPointsValue": 1,
    "requiresPickupAddress": true,
    "isActive": true, "createdAt": "2026-01-01T00:00:00.000Z"
  }
  ```
  Response shape: `{ "items": [ { ...above... }, ... ] }`. The frontend uses `requiresPickupAddress` to show/hide the address field as services are added to the basket.
- `GET /services` -> List **all** services for the tenant, including `isActive: false` (STAFF|MANAGER). Returns `{ items: [...], total: number }` (`StaffServiceListResponse`) — each item uses `serviceId` (not `id`) and `price: { amount, currency }` (no `formatted`); see `StaffServiceResponse` in `service.dto.ts`. Lives on the bare `/services` path — see `docs/24-BFF_ARCHITECTURE.md` for why the public list moved to `/public/services` (`M13-S05`).
- `GET /services/:id` -> Single service by id, active or inactive (STAFF|MANAGER). `StaffServiceResponse`. `404` if not found or wrong tenant.
- `POST /services` -> Create service (STAFF|MANAGER). Body includes `requiresPickupAddress: boolean` (default `false`).
- `PATCH /services/:id` -> Update service details/price/duration/`requiresPickupAddress` (STAFF|MANAGER).
- `DELETE /services/:id` -> Deactivate service (STAFF|MANAGER). Returns `204 No Content`.

---

## 3. Booking Lifecycle

### **Media Upload (UC-001, UC-002, UC-005b, UC-009)**
Used to upload photos before creating a booking (UC-001/UC-002), when submitting more info as a guest (UC-005b), or when marking a booking complete (UC-009).

**BFF:** `POST /v1/bookings/attachments/signed-url`

Single endpoint covering four authentication scenarios — all four now upload to the exact same `tmp/` staging shape regardless of who's calling or what the photo will eventually be attached to (TD22):

| Scenario | Who | Auth |
|---|---|---|
| 1 | Authenticated customer | CUSTOMER JWT |
| 2 | Guest — anonymous | None; `tenantSlug` in body |
| 3 | Guest — with guest token | `guestToken` in body (`@Public`) |
| 4 | Staff / Manager | STAFF/MANAGER JWT |

- **Request body:**
  ```json
  {
    "fileName":    "car-front.jpg",
    "contentType": "image/jpeg",
    "tenantSlug":  "lavacar-bh",  // optional — scenario 2 only
    "guestToken":  "eyJ..."       // optional — scenario 3 only
  }
  ```
  (`bookingId` is no longer part of this request — the booking the photo will end up on may not even exist yet at upload time, and the upload destination no longer depends on it. If a caller sends one anyway, it's silently stripped by the Zod schema.)

- **Response (201 Created):**
  ```json
  {
    "signedUrl": "http://localhost:4443/ikaro-local/tmp/.../car-front.jpg?X-Goog-Signature=...",
    "filePath":  "tmp/<tenantId>/<uuid>/car-front.jpg",
    "expiresAt": "2026-05-12T00:08:44Z"
  }
  ```

**Storage path rule:** `tmp/<tenantId>/<uuid>/<fileName>` — staged in the **private** media bucket, unconditionally, for every scenario. `filePath` is what the backend stores and returns until the surrounding record is actually persisted.

`filePath` is a **staging** path, not the final one. The backend promotes it to `tenants/<tenantId>/bookings/<bookingId>/<fileName>` — still in the same **private** bucket — the moment the surrounding booking record is actually saved: booking creation (UC-001/UC-002, `bookingId` generated up front for exactly this reason), submitting requested info (UC-005b, guest or customer), or completing a booking (UC-009). Booking photos are genuinely private — only the customer and the tenant's staff should ever see a customer's car — so the bucket stays private throughout, and **fresh read-signed URLs are generated at display time; `signedUrl` is never stored.** (This is the opposite of how hotsite images work post-TD22 — see "Hotsite Image Upload" above. Hotsite images are public marketing assets with no privacy requirement, so promotion moves them into a separate public bucket with permanent addresses instead. Don't generalize this section's pattern to hotsite media.) Anything left in `tmp/` — abandoned, or superseded before the surrounding record is saved — ages out via a GCS lifecycle rule (`M17-S14`, `plan/M17-CLOUD-DEPLOY.md`); unlike hotsite, there's no delete-previous-on-replace here, since booking photo arrays are append-only in every current use case.

**Signed URL expiration:** 15 minutes.

#### **Upload Constraints (MVP):**
| Constraint | Value | Notes |
|---|---|---|
| Accepted MIME types | `image/jpeg`, `image/png` | Others return `400`; also enforced by GCS at `PUT` time |
| Max file size | 10 MB | Enforced by GCS via `content-length-range` condition embedded in the signed URL — backend never sees the upload |
| `fileName` | 1–255 chars, no path separators | `../` or `/` returns `400` |
| URL expiration | 15 minutes | `signedUrl` expires 15 min after issuance |
| Rate limit | 10 requests / minute per IP | `429` on the 11th request — protects the public guest path |

#### **Error Responses:**
- `400 invalid-file-name` — `fileName` contains `../` or `/`, or is empty
- `400 unsupported-media-type` — `contentType` not `image/jpeg` or `image/png`
- `400 missing-tenant` — scenario 2 called without `tenantSlug`
- `401 invalid-guest-token` — scenario 3: `guestToken` missing, expired, or invalid
- `429 too-many-requests` — rate limit exceeded

(Promotion — not this endpoint — is what can return `400 booking-photo-not-uploaded` for a `tmp/` path that doesn't exist or belongs to another tenant; see the booking create/submit-info/complete endpoints.)

#### **3-step upload contract (frontend):**
```
1. POST /v1/bookings/attachments/signed-url
   → receive { signedUrl, filePath, expiresAt }

2. PUT <signedUrl>                         (browser → GCS directly, no backend involved)
   Content-Type: image/jpeg
   Body: <binary file>

3. Include filePath (not signedUrl) in the booking body — still a tmp/ staging path;
   the backend promotes it to its permanent tenants/.../bookings/<bookingId>/... path
   on save:
   beforeServicePhotoUrls: ["tmp/<tid>/<uuid>/car-front.jpg"]
   afterServicePhotoUrls:  ["tmp/<tid>/<uuid>/after.jpg"]
```

#### **Example flows:**

**UC-001 / UC-002 — before-photos (guest or authenticated customer):**
```
// Authenticated customer
POST /v1/bookings/attachments/signed-url
Authorization: Bearer <customerJwt>
{ "fileName": "car-front.jpg", "contentType": "image/jpeg" }
→ { signedUrl, filePath: "tmp/<tid>/<uuid>/car-front.jpg", expiresAt }

// Guest (no JWT)
POST /v1/bookings/attachments/signed-url
{ "fileName": "car-front.jpg", "contentType": "image/jpeg", "tenantSlug": "lavacar-bh" }
→ { signedUrl, filePath: "tmp/<tid>/<uuid>/car-front.jpg", expiresAt }
```

**UC-009 — after-photos (staff):**
```
POST /v1/bookings/attachments/signed-url
Authorization: Bearer <staffJwt>
{ "fileName": "after.jpg", "contentType": "image/jpeg" }
→ { signedUrl, filePath: "tmp/<tid>/<uuid>/after.jpg", expiresAt }
```
(No `bookingId` in the request — the destination is only known once the booking is actually persisted.)

### **Booking Requests**

A booking has **1..N service lines**. Order in the `serviceIds` array is preserved (so the customer sees the lines in the order they added them); duplicates are allowed (two `Basic Wash` lines = two cars).

#### **Guest Booking (UC-001) — `POST /bookings`**

Public — requires only `X-Tenant-Slug` header. No authentication.

- **Body:**
  ```json
  {
    "serviceIds":            ["uuid-basic-wash", "uuid-pickup"],
    "scheduledAt":           "ISO8601",
    "contactEmail":            "joao@example.com",
    "contactName":             "João Silva",
    "contactPhone":            "31999999999",
    "contactAddress": {
      "street": "Rua das Acácias", "number": "45", "complement": null,
      "neighborhood": "Jardim América", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130020"
    },
    "pickupAddress": {
      "street": "Rua das Flores", "number": "123", "complement": "Apto 4B",
      "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130010"
    },
    "beforeServicePhotoUrls": ["https://..."]
  }
  ```
  - `pickupAddress` **required** when any `serviceId` has `requiresPickupAddress = true`; omit otherwise.
  - `contactAddress` optional (general home address for the guest).
  - `beforeServicePhotoUrls` optional, defaults to `[]`.

- **Response (`201 Created`):** see [Shared Response Shape](#shared-booking-201-response-shape) below.

- **Errors (RFC 9457 Problem Details):**
  - `400 invalid-services-empty` — `serviceIds` is empty.
  - `404 service-not-found` — one or more `serviceId` does not exist in the tenant's catalog.
  - `400 service-not-in-tenant` — one or more `serviceId` exists globally but does not belong to this tenant.
  - `400 invalid-services-inactive` — one or more service has `is_active = false`.
  - `400 missing-pickup-address` — one or more selected services require a pickup address but none was provided.
  - `400 invalid-pickup-address` — `pickupAddress` fields fail validation (e.g. `zipCode` not 8 digits, `state` not a valid UF).
  - `400 photo-not-uploaded` — one or more `beforeServicePhotoUrls` paths were never confirmed as uploaded to GCS (the backend calls `IStorageService.exists()` on each path before persisting — a stale, never-uploaded, or hand-crafted path is rejected rather than stored).
  - `409 slot-unavailable` — the requested `scheduledAt + totalDurationMins` window overlaps another APPROVED booking or a `ScheduleClosure`.

#### **Authenticated Customer Booking (UC-002) — `POST /bookings/authenticated`**

Requires JWT with `role: CUSTOMER`. Tenant resolved from JWT `tenantId` — no `X-Tenant-Slug` needed.

- **Body:**
  ```json
  {
    "serviceIds":            ["uuid-basic-wash", "uuid-pickup"],
    "scheduledAt":           "ISO8601",
    "pickupAddress": {
      "street": "Rua das Flores", "number": "123", "complement": "Apto 4B",
      "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130010"
    },
    "beforeServicePhotoUrls": ["https://..."]
  }
  ```
  - Guest fields (`contactEmail`, `contactName`, `contactPhone`, `contactAddress`) are **not accepted** — the backend reads them from the Customer record identified by the JWT `sub`.
  - `pickupAddress` **required** when any service has `requiresPickupAddress = true`. If omitted, falls back to `Customer.defaultAddress` when set; if that is also absent, returns `400 missing-pickup-address`.
  - `beforeServicePhotoUrls` optional, defaults to `[]`.

- **Response (`201 Created`):** see [Shared Response Shape](#shared-booking-201-response-shape) below.

- **Errors (RFC 9457 Problem Details):**
  - All errors from guest booking apply (`400`, `404`, `409`).
  - `401 Unauthorized` — no valid JWT.
  - `403 Forbidden` — JWT role is not `CUSTOMER`.
  - `422 customer-phone-not-set` — the customer has not set a phone number on their profile; update via `PATCH /customers/me` before booking.

#### **Shared Booking `201` Response Shape** {#shared-booking-201-response-shape}

```json
{
  "bookingId":              "uuid",
  "status":                 "PENDING",
  "scheduledAt":            "ISO8601",
  "totalPrice":             { "amount": 120.00, "currency": "BRL" },
  "totalDurationMins":      85,
  "pickupAddress": {
    "street": "Rua das Flores", "number": "123", "complement": "Apto 4B",
    "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130010"
  },
  "beforeServicePhotoUrls": ["https://..."],
  "lines": [
    {
      "lineId":                         "uuid",
      "serviceId":                      "uuid-basic-wash",
      "priceAtBooking":                 { "amount": 100.00, "currency": "BRL" },
      "durationMinsAtBooking":          30,
      "pointsValueAtBooking":           1,
      "requiresPickupAddressAtBooking": false
    },
    {
      "lineId":                         "uuid",
      "serviceId":                      "uuid-pickup",
      "priceAtBooking":                 { "amount": 20.00, "currency": "BRL" },
      "durationMinsAtBooking":          15,
      "pointsValueAtBooking":           1,
      "requiresPickupAddressAtBooking": true
    }
  ]
}
```
(`pickupAddress` omitted when null. `serviceNameAtBooking` stored on the line but not returned.)

### **Booking Management (UC-003 - UC-008)**
- `GET /bookings` → List bookings. Query params (`M13-S03`): `status` (comma-separated), `date`, `from`, `to`, `page`, `limit`. **No `customerId` filter param** — for a CUSTOMER caller, scoping to their own bookings is role-derived server-side, not a query filter. Each list item includes `totalPrice`, `totalDurationMins`, and a compact `lineSummary: [{ lineId, serviceId, serviceNameAtBooking, durationMinsAtBooking, priceAtBooking }, …]`.
- `GET /bookings/:id` → Detailed view, response shape branches by caller role in one shared handler: STAFF/MANAGER get `StaffBookingDetailResponse` (loyalty balance, signed before/after-service photo read-URLs, `contactAddress`/`approvedAt`/`approvedBy`/`rejectionReason`, and — once `COMPLETED` — `totalActualPrice`/`discountAmount`/`discountPointsUsed`/`completedAt`); CUSTOMER gets `CustomerBookingDetailResponse` (same completion fields, plus `notes`, minus staff-only fields like `adminNotes`/`approvedBy`/`rejectionReason`/contact info). A CUSTOMER requesting a booking they don't own gets `404`, not `403` (deliberate — avoids confirming the booking's existence to a non-owner).

> **BFF note (M13-S03/S04/S06/S07):** `GET /v1/bookings` and `GET /v1/bookings/:id` are both accessible to STAFF, MANAGER, and CUSTOMER — same routes, same query schema/defaults, but the BFF maps the response differently per role: `StaffBookingCard/ListResponse`/`StaffBookingDetailResponse` for STAFF/MANAGER, `CustomerBookingListItem/Response`/`CustomerBookingDetailResponse` for CUSTOMER (no contact info, no staff-only fields).

**Admin approval workflow** (JWT + `MANAGER|STAFF` role required):
- `PATCH /bookings/:id/approve` → (UC-003) Approve a PENDING or INFO_REQUESTED booking. Re-checks slot availability. Returns `200 { bookingId, status: 'APPROVED', approvedAt }`. Returns `409 slot-unavailable` if slot is taken.
- `PATCH /bookings/:id/reject` → (UC-004) Reject a PENDING or INFO_REQUESTED booking. Body: `{ reason: string }` (required, min 10 chars). Returns `200 { bookingId, status: 'REJECTED' }`.
- `PATCH /bookings/:id/request-info` → (UC-005a) Transition PENDING → INFO_REQUESTED. Body: `{ message: string }` (required, min 20 chars). Returns `200 { bookingId, status: 'INFO_REQUESTED' }`.

**Customer info submission** (JWT + `CUSTOMER` role required):
- `PATCH /bookings/:id/submit-info` → (UC-005b) Transition INFO_REQUESTED → PENDING. Body: `{ response: string, photoUrls?: string[] }`. Returns `200 { bookingId, status: 'PENDING' }`. Any provided `photoUrls` are appended to `booking.beforeServicePhotoUrls`. Each path is verified via `IStorageService.exists()` before persisting — an unresolvable path returns `400 photo-not-uploaded`.
- `PATCH /bookings/:id/submit-info/guest?token=<guestToken>` → (UC-005b, guest flow) Same transition for a guest booking. No JWT — identity comes from the signed `guestToken` query param (issued when the booking was put into `INFO_REQUESTED`); the token's `bookingId` must match the route `:id`. Body: same shape as the authenticated variant. Returns `200 { bookingId, status, infoSubmittedAt }`.
- `GET /bookings/:id/guest?token=<guestToken>` → (UC-005 A2, M13-S39) Guest reads a booking summary before submitting info — the standalone `/bookings/:id/submit-info` page (M13-S40) uses this to pre-fill a summary card. Same guest-token identity as the PATCH variant above. Returns `200 GuestBookingReadResponse { bookingId, status: 'INFO_REQUESTED', serviceSummary, scheduledAt, infoRequestMessage, contactName }`. Returns `400` when the token is missing or its `bookingId` doesn't match the route; `401` when the JWT signature is invalid or expired; `409` when the booking is no longer `INFO_REQUESTED`; `404` when the booking belongs to a different tenant than the token's `tenantId`.

> **No generic `PATCH /bookings/:id` or `PATCH /bookings/:id/status` endpoint exists.** Every booking state transition and field update is its own action-specific route: `/cancel`, `/approve`, `/reject`, `/request-info`, `/submit-info`, `/submit-info/guest`, `/reschedule`, `/complete`. Lines cannot be edited after `APPROVED` (returns `409 booking-lines-frozen`).

**Cancel** (JWT + `CUSTOMER|MANAGER|STAFF` role required):
- `PATCH /bookings/:id/cancel` → (UC-007, UC-008) Cancel a booking. The BFF dispatches to a different backend route depending on the caller's role: `CUSTOMER` → `cancel-customer` (no body), `MANAGER`/`STAFF` → `cancel-admin` (body: `{ reason?: string }`). Returns `200 { bookingId, status: 'CANCELLED' }`.

### **Reschedule (UC-008)**
- `PATCH /bookings/:id/reschedule`
- **Body:** `{ "scheduledAt": "ISO8601", "adminNotes": "..." }`
- **Validation:** New `scheduledAt + totalDurationMins` window must be free. Returns `409 slot-unavailable` if not.
- **Event:** Publishes `BookingRescheduled` → Notification sends customer email.

### **Information Workflow (UC-005)**
See `PATCH /bookings/:id/submit-info` in the Booking Management section above.

### **Completion (UC-009)**
- `PATCH /bookings/:id/complete`
- **Body:**
  ```json
  {
    "lines": [
      { "lineId": "uuid-line-1", "actualPriceCharged": 80.00 },
      { "lineId": "uuid-line-2", "actualPriceCharged": 0.00 }
    ],
    "afterServicePhotoUrls": ["tenants/<tenantId>/bookings/<bookingId>/after.jpg"],
    "adminNotes": "Extra shine applied"
  }
  ```
  - `lines` is **required**, minimum 1 entry — every line on the booking must be listed with its actual charged price (`CompleteBookingBodySchema`, `apps/bff/src/features/booking/bookings.controller.ts`). There is no "omit lines charged at full price" shortcut.
  - `actualPriceCharged` must be `>= 0`. Zero is valid (waived service).
  - `afterServicePhotoUrls` optional, defaults to `[]`. Paths must match `tenants/<tenantId>/bookings/<bookingId>/...`.
  - `adminNotes` optional, 1–500 chars.

- **Response (`200 OK`):**
  ```json
  {
    "bookingId": "uuid",
    "status": "COMPLETED",
    "completedAt": "2026-05-29T14:00:00.000Z",
    "totalActualPrice": { "amount": 80.00, "currency": "BRL" }
  }
  ```
  The response is flat — no per-line breakdown (`CompleteBookingResponse`, `apps/bff/src/features/booking/bookings.types.ts`). Per-line `actualPriceCharged` is persisted but only surfaced later via `GET /bookings/:id` (`BookingLineDetail`).

- **Errors:**
  - `400 invalid-line-id` — a `lineId` in `lines` does not belong to this booking.
  - `400 invalid-actual-price` — `actualPriceCharged` is negative.
  - `400 photo-not-uploaded` — one or more `afterServicePhotoUrls` paths were never confirmed as uploaded to GCS (verified via `IStorageService.exists()` before persisting).

---

## 4. Schedule & Availability

### **Customer Availability (UC-011)**

Availability is a **two-phase API** — one call for calendar navigation, one for slot detail. Both are public endpoints (no JWT, only `X-Tenant-Slug` header).

**Phase 1 — Calendar overview (range summary)**

Loads all data for the date range in 3 DB queries. Use for week/month calendar rendering.

```
GET /v1/schedule/availability/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&serviceIds=uuid1,uuid2
X-Tenant-Slug: lavacar-test
```

Response `200`:
```json
[
  { "date": "2026-06-01", "available": true,  "slotCount": 12 },
  { "date": "2026-06-02", "available": false, "slotCount": 0  },
  { "date": "2026-06-03", "available": true,  "slotCount": 5  }
]
```

Errors:
- `400` — serviceId not found, inactive, or from wrong tenant
- `422` — `from > to`, or range exceeds `maxBookingAdvanceDays` (default 90 days)

Constraints: past dates return `{ available: false, slotCount: 0 }` without an error (for seamless calendar rendering).

**Phase 2 — Day detail (single-date slots)**

Called when user clicks a specific day. Returns full slot list with UTC timestamps.

```
GET /v1/schedule/availability?date=YYYY-MM-DD&serviceIds=uuid1,uuid2
X-Tenant-Slug: lavacar-test
```

Response `200`:
```json
{
  "date": "2026-06-01",
  "available": true,
  "slots": [
    { "startsAt": "2026-06-01T12:00:00.000Z", "endsAt": "2026-06-01T13:15:00.000Z" },
    { "startsAt": "2026-06-01T12:30:00.000Z", "endsAt": "2026-06-01T13:45:00.000Z" }
  ]
}
```

Errors:
- `400` — serviceId not found, inactive, or from wrong tenant
- `422` — date is in the past

### **Schedule Closures (UC-010a, UC-010b)**
Auth: JWT + `MANAGER|STAFF` on all write endpoints.

- `GET /schedule/closures?from=YYYY-MM-DD&to=YYYY-MM-DD` → list closures in range (sorted by date ASC)
- `POST /schedule/closures` → create closure (full-day or partial)
  ```json
  {
    "date":      "2026-12-26",
    "reason":    "HOLIDAY",
    "startTime": "10:00",   // optional — omit for full-day
    "endTime":   "12:00",   // optional — omit for full-day
    "notes":     "..."      // optional
  }
  ```
  - `201` on success; response body includes the created closure `id`
  - `422` if date is in the past
  - `409` if an overlapping closure already exists for that date

- `DELETE /schedule/closures/:id` → remove closure
  - `204` on success
  - `404` if not found or belongs to another tenant

### **Schedule Openings (UC-010c, UC-010d)**
Auth: JWT + `MANAGER|STAFF` on all write endpoints.

- `GET /schedule/openings?from=YYYY-MM-DD&to=YYYY-MM-DD` → list openings in range
- `POST /schedule/openings` → open a normally-closed day
  ```json
  {
    "date":      "2026-12-28",
    "startTime": "09:00",
    "endTime":   "14:00",
    "notes":     "..."   // optional
  }
  ```
  - `201` on success
  - `422` if date is past OR day-of-week is already open in `businessHours`
  - `409` if an opening already exists for that date

- `DELETE /schedule/openings/:id` → remove opening; day reverts to default-closed
  - `204` on success
  - `404` if not found or belongs to another tenant

---

## 5. Customer & Loyalty

### **Customer Management (UC-002, UC-006, UC-007)**
- `GET /customers?search=&limit=20` -> (Admin) Search customers in tenant by name or email.
  - Requires JWT with `MANAGER|STAFF` role.
  - Query params:
    - `search` (optional, string, min 5 chars when present) — case-insensitive `ILIKE %search%` match on `name` and `email`. When omitted, returns all customers up to `limit`.
    - `limit` (optional, integer, default 20) — max results to return.
  - Response:
    ```json
    {
      "items": [
        { "customerId": "uuid", "name": "João Silva", "email": "joao@example.com", "currentPoints": 150 }
      ],
      "total": 1
    }
    ```
  - `currentPoints` is read from `loyalty_balances.current_points` for the customer (`0` if no balance row).
  - Results are scoped to the caller's tenant — no cross-tenant leakage possible.
  - `CUSTOMER` role → `403`.
- `GET /customers/:id` -> (Admin/Self) Detailed profile. Response includes `defaultAddress` (nullable).
- `GET /customers/me` -> (Self) Current authenticated customer profile.
  - Requires JWT with `role: CUSTOMER`.
  - Response:
    ```json
    {
      "customerId": "uuid",
      "email": "cliente@example.com",
      "name": "João Silva",
      "phone": "31999999999",
      "defaultAddress": {
        "street": "Av. Afonso Pena", "number": "1000", "complement": null,
        "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130921"
      }
    }
    ```
  - `phone` is digits only (10–11 digits, no country prefix). `null` when not set.
  - `defaultAddress` is `null` when not set.
- `PATCH /customers/me` -> (Self) Update own profile.
  - Requires JWT with `role: CUSTOMER`.
  - All fields optional (partial update — omitted fields are left unchanged).
  - Body:
    ```json
    {
      "name": "João Silva",
      "phone": "31999999999",
      "defaultAddress": {
        "street": "Av. Afonso Pena", "number": "1000", "complement": null,
        "neighborhood": "Centro", "city": "Belo Horizonte", "state": "MG", "zipCode": "30130921"
      }
    }
    ```
  - Set `defaultAddress` to `null` to clear it. Set `phone` to `null` to clear it.
  - `phone` must be 10–11 digits (digits only, no country prefix e.g. `31999999999`).
  - `zipCode` must be 8 digits; hyphen is accepted and normalised (`"30130-921"` → `"30130921"`).
  - Returns the full updated profile (same shape as `GET /customers/me`).

### **Loyalty Metrics — Customer (UC-016)**

All three endpoints require JWT with `CUSTOMER` role. The `customerId` is inferred from the JWT `sub` (`X-Actor-ID`). Staff calling these endpoints → `403`.

- `GET /loyalty/balance`
  - Response:
    ```json
    { "currentPoints": 150, "nextExpiryDate": "2026-11-15T00:00:00.000Z", "nextExpiryPoints": 30 }
    ```
  - **BFF note (M13-S06/M13-S12):** `GET /v1/loyalty/balance` returns `CustomerLoyaltyBalanceResponse`, which extends the backend response with `conversionRate: number` — the live `pointsPerCurrencyUnit` from tenant settings (`0` = redemption disabled).
  - `currentPoints`: read from `loyalty_balances.current_points` (O(1) — no SUM).
  - `nextExpiryDate`: ISO-8601 datetime string (`Date.toISOString()`) of the earliest `expires_at` among active entries; `null` if no active entries.
  - `nextExpiryPoints`: sum of points expiring on `nextExpiryDate`; `null` if no active entries.
  - Returns `{ currentPoints: 0, nextExpiryDate: null, nextExpiryPoints: null }` when customer has no balance row.

- `GET /loyalty/entries?page=1&limit=20`
  - Returns paginated earning history, most recent first. **Response below is the raw backend shape** — the BFF (`M13-S08`) reshapes this into `CustomerLoyaltyEntriesResponse` before it reaches the browser: `entries[]` → `items[]`, `points` → `pointsEarned`, `isActive` → `expired` (inverted), and `pagination: {page,limit,total}` flattened to top-level `page`/`limit`/`total` alongside `items`. Do not assume the browser sees the shape below verbatim.
  - Backend response:
    ```json
    {
      "entries": [{
        "entryId": "uuid",
        "serviceId": "uuid",
        "serviceName": "Lavagem Completa",
        "points": 10,
        "earnedAt": "2026-05-28T14:00:00.000Z",
        "expiresAt": "2026-11-24T14:00:00.000Z",
        "isActive": true
      }],
      "pagination": { "page": 1, "limit": 20, "total": 45 }
    }
    ```
  - `isActive`: `true` when `expiresAt > now()`.
  - `serviceName`: resolved via `IServiceCatalogPort` (cross-context adapter queries `booking.services`).

- `GET /loyalty/redemptions?page=1&limit=20`
  - Returns paginated redemption history, most recent first. **Response below is the raw backend shape** — the BFF reshapes this into `CustomerLoyaltyRedemptionsResponse`: `redemptions[]` → `items[]`, `pointsRedeemed` → `pointsUsed`, adds `amountSaved` (computed from the redemption's own **snapshotted** `pointsPerCurrencyUnit`, never today's rate — see `M13-S11`) and `bookingReference` (resolved via `ILoyaltyBookingPort.findBookingServices()`), and flattens pagination the same way as entries.
  - Backend response:
    ```json
    {
      "redemptions": [{
        "redemptionId": "uuid",
        "pointsRedeemed": 50,
        "redeemedAt": "2026-05-28T10:00:00.000Z",
        "notes": "Free basic wash"
      }],
      "pagination": { "page": 1, "limit": 20, "total": 3 }
    }
    ```

### **Loyalty Metrics — Admin (UC-016, Admin variant)**

All endpoints require JWT with `MANAGER|STAFF` role. The `customerId` is taken from the URL path. Returns `404` if `customerId` does not belong to the caller's tenant.

- `GET /customers/:customerId/loyalty/balance` — returns `EnrichedLoyaltyBalanceResponse` (same fields as `CustomerLoyaltyBalanceResponse` including `conversionRate`).
- `GET /customers/:customerId/loyalty/entries?page=1&limit=20` — same response shape as customer entries endpoint.
- `GET /customers/:customerId/loyalty/redemptions?page=1&limit=20` — same response shape as customer redemptions endpoint.

### **Loyalty Redemption — Admin (M10-S07)**

Records a point redemption for a customer. Decrements `LoyaltyBalance.current_points` and inserts a `LoyaltyRedemption` audit row atomically.

**Backend:** `POST /loyalty/redeem`  
**BFF:** `POST /v1/loyalty/redeem`  
Requires JWT with `MANAGER|STAFF` role.

Request body:
```json
{
  "customerId": "uuid",
  "pointsToRedeem": 50,
  "notes": "Free basic wash applied",
  "bookingId": "uuid"
}
```
- `notes`: optional string
- `bookingId`: optional UUID — the booking the redemption is tied to

Response `201`:
```json
{
  "redemptionId": "uuid",
  "customerId": "uuid",
  "pointsRedeemed": 50,
  "newBalance": 25,
  "redeemedAt": "2026-05-29T14:00:00.000Z"
}
```

Errors:
- `404` — customer has no loyalty balance row (has never earned points)
- `422` — `pointsToRedeem` exceeds `current_points`
- `403` — caller has `CUSTOMER` role

---

## 6. System & Future

### **Analytics (UC-017)**
- `GET /analytics/summary` -> Dashboard stats for admins.

### **Notifications (Audit)**
- `GET /notifications/logs` -> View status of emails sent (UC-018, 019, 020 verification).

---

## Internal Platform API (Operator Only)

> These endpoints are **not reachable from the public internet** in production. Three security layers protect them (decided 2026-05-15):
> 1. **Cloud Armor** (M15-S12) — blocks `/internal/*` at the network level from all IPs except the operator's allowlist
> 2. **Cloud IAP** (M15-S12) — Google identity gate; only allowlisted Google Workspace accounts can pass
> 3. **`PLATFORM_ADMIN_KEY`** — static API key in the `Authorization` header, validated application-side with `crypto.timingSafeEqual`
>
> All three layers must pass. The `RequestInterceptor` skips `/internal/*` — no `X-Tenant-ID` header is expected.

---

### `POST /internal/tenants` — Provision new tenant (UC-024)

Provisions a new car-wash company on the platform. Creates `Tenant` + default `HotsiteConfig`. First MANAGER staff creation and invitation email happen asynchronously via events (see M04-S06, M11).

**Request headers:**
```
Authorization: Bearer <PLATFORM_ADMIN_KEY>
Content-Type: application/json
```

**Request body:**
```json
{
  "name":        "AutoWash Pro",
  "slug":        "autowash-pro",
  "adminEmail":  "owner@autowashpro.com.br",
  "timezone":    "America/Sao_Paulo"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | ✓ | Non-empty |
| `slug` | string | ✓ | `/^[a-z0-9-]+$/`, globally unique |
| `adminEmail` | string | ✓ | Valid email format |
| `timezone` | string | — | Valid IANA timezone (default: `America/Sao_Paulo`) |

**Response `201 Created`:**
```json
{
  "tenantId": "uuid-v7",
  "name":     "AutoWash Pro",
  "slug":     "autowash-pro"
}
```

**Error responses:**

| Status | Condition |
|---|---|
| `401` | Missing or invalid `Authorization` header |
| `400` | Validation failure (invalid slug format, invalid email, invalid timezone) |
| `409` | Slug already in use |

**Rate limit (M16-S07):** 3 requests/hour per API key. Brute-force protection: blocked for 1 hour after 10 consecutive `401` responses.

---

### `POST /cron/loyalty-expiry` — Publish the daily points-expiry trigger (M10-S08, transport updated M17-S03)

Publishes the `cron-loyalty-expiry` trigger onto the event bus's trigger channel (`ITriggerBus`) — the same channel Cloud Scheduler publishes to directly in prod via the `ikaro-cron-loyalty-expiry` Pub/Sub topic (daily, 02:00 UTC). `ExpirePointsTriggerHandler`, subscribed to that trigger, calls `ExpirePointsJob.run()`, which decrements `loyalty_balances.current_points` for all `loyalty_entries` whose `expires_at` has passed. Fully idempotent — safe to call multiple times; already-processed entries are skipped via `balance_expiry_log`.

**Why a Pub/Sub trigger (not `@Cron` or a direct HTTP call):** Cloud Run scales to zero and multi-pod deployments would execute a `@Cron` on every pod simultaneously. The backend is internal-ingress only with no public URL, so Cloud Scheduler cannot call it directly either — Scheduler publishes to Pub/Sub, whose push subscription reaches the internal-ingress backend at `/pubsub/push` (D2/D3, `plan/M17-CLOUD-DEPLOY.md`). This `POST /cron/loyalty-expiry` endpoint is the local/manual trigger path only, protected by `InternalApiGuard` (not `PubSubPushGuard`) — it is not the endpoint Scheduler calls in prod.

**Request headers:** none — protected by the global `InternalApiGuard` (`X-Internal-Key`), same as any other internal endpoint. No `PubSubPushGuard`/OIDC on this endpoint; that guard sits on the shared `/pubsub/push` receiver instead.

**Request body:** none

**Response `200 OK`:**
```json
{ "ok": true }
```
Returned once the trigger is published — not once `ExpirePointsJob` finishes running (dispatch is asynchronous in prod; the local pull-mode consumer processes it moments later).

**GCP Cloud Scheduler resource (Terraform — `modules/scheduler`, M17-S21):**
```hcl
resource "google_cloud_scheduler_job" "loyalty_expire_points" {
  name      = "loyalty-expire-points"
  schedule  = "0 2 * * *"
  time_zone = "UTC"
  pubsub_target {
    topic_name = google_pubsub_topic.cron_loyalty_expiry.id
    data       = base64encode("{}")
  }
}
```

---

## Error Handling (RFC 9457)

All non-2xx responses follow the **Problem Details for HTTP APIs** standard.

| Code | Meaning | Usage |
|------|---------|-------|
| **400** | Bad Request | Validation errors or business rule violation (e.g., 48h cancel). |
| **401** | Unauthorized | Invalid/Expired JWT. |
| **403** | Forbidden | Tenant mismatch or insufficient role. |
| **404** | Not Found | Resource does not exist in the current tenant. |

---

**Status:** Phase 2 - Technical Architecture (Full UC Coverage)  
**Next:** `15-HOTSITE_DYNAMIC_ARCHITECTURE.md`
