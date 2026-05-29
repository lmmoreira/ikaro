# API Contracts - BeloAuto

## Overview

BeloAuto follows a **RESTful API** standard using **JSON** for all payloads. All communication must be encrypted over **HTTPS**.

**Error Response Standard:** [RFC 9457 Problem Details](https://tools.ietf.org/html/rfc9457) — see [25-ERROR_CATALOG.md](25-ERROR_CATALOG.md) for complete error reference.

---

## Base Standards

### 1. **Base URL**
All endpoints are served by the **BFF** (`apps/bff/`) — the frontend never calls the backend directly.

- **Production:** `https://bff.beloauto.com/v1`
- **Staging:** `https://beloauto-bff-staging-<hash>-uc.a.run.app/v1` (get URL from `terraform output bff_url`)
- **Local:** `http://localhost:3002/v1`

> The backend (`apps/backend/`) is an internal Cloud Run service. It is not publicly reachable. Only the BFF calls it, via `BACKEND_INTERNAL_URL`.

### 2. **Tenant Scoping (Mandatory)**
- **Public/Guest Endpoints:** Must include `X-Tenant-Slug` header (e.g., `autowash-pro`).
- **Authenticated Endpoints:** Must include `Authorization: Bearer <JWT>`.
- **Validation:** The BFF will reject any request where the `X-Tenant-Slug` does not match the `tenantId/slug` context in the JWT (for authenticated requests).

### 3. **Pagination Strategy (Limit-Offset)**

All list endpoints support pagination using **limit/offset** strategy. This is cursor-like but simpler for MVP.

#### **Query Parameters:**
| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | integer | 50 | 100 | Number of items per page |
| `offset` | integer | 0 | ∞ | Skip this many items |

#### **Request Example:**
```
GET /bookings?status=APPROVED&limit=25&offset=0
```

#### **Response Format (Standard for All List Endpoints):**
```json
{
  "data": [
    { "bookingId": "...", "status": "APPROVED", ... },
    { "bookingId": "...", "status": "APPROVED", ... }
  ],
  "pagination": {
    "limit": 25,
    "offset": 0,
    "total": 1234,
    "hasMore": true,
    "nextOffset": 25
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data` | array | Array of items for this page |
| `limit` | integer | Requested limit |
| `offset` | integer | Requested offset |
| `total` | integer | Total count of all items (expensive query; see note below) |
| `hasMore` | boolean | true = more items beyond this page |
| `nextOffset` | integer | Convenience: offset for next page (`offset + limit`) |

#### **Important Notes:**

1. **Total Count**: Computing `total` requires a COUNT query. For performance, consider:
   - Include total only on first page (`offset=0`)
   - Or use `hasMore` without `total` (cheaper)
   - Or cache total for 1 minute

2. **Max Limit**: Set to 100 items max to prevent resource exhaustion. If client requests `limit=1000`, cap at 100.

3. **Default Behavior**: If `limit` or `offset` omitted, use defaults (50, 0).

4. **Validation**:
   - `limit` must be 1–100 (return `400 invalid-limit` if not)
   - `offset` must be ≥ 0 (return `400 invalid-offset` if not)

#### **Examples Across Different Endpoints:**

**Bookings List (Paginated):**
```
GET /bookings?status=APPROVED&limit=10&offset=0
Response:
{
  "data": [ /* 10 bookings */ ],
  "pagination": { "limit": 10, "offset": 0, "total": 45, "hasMore": true, "nextOffset": 10 }
}
```

**Services List (Paginated):**
```
GET /services?limit=50&offset=0
Response:
{
  "data": [ /* 50 services */ ],
  "pagination": { "limit": 50, "offset": 0, "total": 127, "hasMore": true, "nextOffset": 50 }
}
```

**Loyalty Entries (Paginated):**
```
GET /customers/:id/loyalty/entries?limit=20&offset=0
Response:
{
  "data": [ /* 20 entries */ ],
  "pagination": { "limit": 20, "offset": 0, "total": 83, "hasMore": true, "nextOffset": 20 }
}
```

#### **Future: Cursor-Based Pagination**

For even better performance with large datasets (Phase 2), consider cursor-based pagination:
- Use `after` cursor instead of `offset`
- Cursor encodes the last item's ID and sort value
- More efficient, no deep scanning needed
- Can be introduced non-breaking: keep limit/offset, add `after` as alternative

---

## 1. Authentication & Multi-Tenancy

### **Auth Flow (UC-014, UC-015, UC-021, UC-022, UC-023)**
- `GET /auth/google` -> Redirects to Google OAuth.
- `GET /auth/google/callback` -> Returns temporary code.
- `POST /auth/token` -> Returns JWT.
- `GET /auth/tenants` -> (UC-021) Returns list of tenants the user belongs to (for selection screen).
- `POST /auth/switch-tenant` -> (UC-023) Returns a new JWT for the selected tenant.

### **JWT Structure**
```json
{
  "sub":        "user-uuid-v7",
  "tenantId":   "tenant-uuid-v7",
  "tenantSlug": "autowash-pro",
  "role":       "CUSTOMER | STAFF | MANAGER",
  "iat":        123456789,
  "exp":        123456789
}
```

| Role | Who | Access |
|---|---|---|
| `CUSTOMER` | Authenticated customer | Own bookings, loyalty, profile |
| `STAFF` | Regular employee | All bookings, services, schedule |
| `MANAGER` | Admin/owner (MANAGER role) | Everything STAFF can do + tenant settings, staff management, hotsite |

> **Guest bookings** (UC-001) carry no JWT. The BFF identifies them by the absence of an `Authorization` header. Tenant context comes from the `X-Tenant-Slug` header.

---

## 2. Tenant & Service Discovery

### **Tenant Details (Hotsite - UC-001, UC-011)**
Used by the React app to fetch branding and layout for a slug.
- `GET /tenants/slug/:slug`
- **Response:** `200 OK` with **Hotsite Manifest**:
  ```json
  {
    "tenant": { "name": "...", "slug": "..." },
    "branding": { "primaryColor": "...", "logoUrl": "..." },
    "layout": [
      { "type": "HERO", "data": { "title": "...", "image": "..." } },
      { "type": "SERVICE_LIST", "data": { "showPrices": true } },
      { "type": "GALLERY", "data": { "limit": 6 } },
      { "type": "BOOKING_FORM", "data": { "simplified": false } }
    ]
  }
  ```

### **Service Management (Admin - UC-012, UC-013)**
- `GET /services` -> List all services (Public/Admin). Each item includes:
  ```json
  {
    "serviceId": "uuid", "name": "Coleta e Entrega", "description": "...",
    "price": { "amount": 20.00, "currency": "BRL" },
    "durationMinutes": 15, "pointsValue": 1,
    "requiresPickupAddress": true,
    "isActive": true
  }
  ```
  The frontend uses `requiresPickupAddress` to show/hide the address field as services are added to the basket.
- `POST /services` -> Create service (Admin). Body includes `requiresPickupAddress: boolean` (default `false`).
- `PATCH /services/:id` -> Update service details/price/duration/`requiresPickupAddress` (Admin).
- `DELETE /services/:id` -> Deactivate service (Admin).

---

## 3. Booking Lifecycle

### **Media Upload (UC-001, UC-009)**
Used before creating a booking (UC-001) or marking it complete (UC-009).

- `POST /bookings/attachments/signed-url`
- **Body:**
  ```json
  {
    "fileName": "car.jpg",
    "contentType": "image/jpeg"
  }
  ```
- **Query Parameters:** (optional)
  - `type=before` (default) — uploading car photos before booking
  - `type=after` — uploading after-service photos on completion

- **Response (201 Created):**
  ```json
  {
    "uploadUrl": "https://storage.googleapis.com/...",
    "fileUrl": "https://storage.beloauto.com/tenants/{tenantId}/bookings/{bookingId}/...",
    "expiresAt": "2026-05-12T00:08:44Z"
  }
  ```

#### **Upload Constraints (MVP):**
| Constraint | Value | Notes |
|------------|-------|-------|
| Max file size | 10 MB | Per file, enforced by API validation |
| Max files per session | 5 | Customer can upload max 5 car photos, 5 after-service photos |
| Accepted MIME types | image/jpeg, image/png | Others return `400 unsupported-media-type` |
| Upload URL expiration | 1 hour | URL valid for 60 minutes after issuance |
| Storage path template | `tenants/{tenantId}/bookings/{bookingId}/{type}/{fileName}` | Tenant-prefixed, type=before or after |

#### **Validation Rules:**
- `fileName` must be 1–255 characters, safe for filesystem (no path separators)
- `contentType` must be exactly `image/jpeg` or `image/png`
- File must be uploaded to `uploadUrl` within 1 hour (time-limited)
- Multiple files allowed: call endpoint 5 times, get 5 signed URLs

#### **Error Responses:**
- `400 invalid-file-name` — fileName invalid or too long
- `400 unsupported-media-type` — contentType not in [image/jpeg, image/png]
- `413 file-too-large` — actual upload exceeds 10 MB
- `429 too-many-files` — attempted to upload more than 5 files in this session
- `410 upload-url-expired` — signed URL expired after 1 hour

#### **Example Flow (UC-001):**
```
1. Customer selects car photos (5 files, up to 10 MB each)
2. Frontend calls POST /bookings/attachments/signed-url (5 times)
   Request: { "fileName": "car-front.jpg", "contentType": "image/jpeg" }
   Response: { "uploadUrl": "https://...", "fileUrl": "https://...", "expiresAt": "..." }
3. Frontend uploads directly to uploadUrl (S3/GCS)
4. Frontend collects all fileUrls
5. Frontend submits POST /bookings with beforeServicePhotoUrls: [fileUrl1, fileUrl2, ...]
6. System validates URLs and creates booking
```

### **Booking Requests**

A booking has **1..N service lines**. Order in the `serviceIds` array is preserved (so the customer sees the lines in the order they added them); duplicates are allowed (two `Basic Wash` lines = two cars).

#### **Guest Booking (UC-001) — `POST /bookings`**

Public — requires only `X-Tenant-Slug` header. No authentication.

- **Body:**
  ```json
  {
    "serviceIds":            ["uuid-basic-wash", "uuid-pickup"],
    "scheduledAt":           "ISO8601",
    "guestEmail":            "joao@example.com",
    "guestName":             "João Silva",
    "guestPhone":            "31999999999",
    "guestAddress": {
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
  - `guestAddress` optional (general home address for the guest).
  - `beforeServicePhotoUrls` optional, defaults to `[]`.

- **Response (`201 Created`):** see [Shared Response Shape](#shared-booking-201-response-shape) below.

- **Errors (RFC 9457 Problem Details):**
  - `400 invalid-services-empty` — `serviceIds` is empty.
  - `404 service-not-found` — one or more `serviceId` does not exist in the tenant's catalog.
  - `400 service-not-in-tenant` — one or more `serviceId` exists globally but does not belong to this tenant.
  - `400 invalid-services-inactive` — one or more service has `is_active = false`.
  - `400 missing-pickup-address` — one or more selected services require a pickup address but none was provided.
  - `400 invalid-pickup-address` — `pickupAddress` fields fail validation (e.g. `zipCode` not 8 digits, `state` not a valid UF).
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
  - Guest fields (`guestEmail`, `guestName`, `guestPhone`, `guestAddress`) are **not accepted** — the backend reads them from the Customer record identified by the JWT `sub`.
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
- `GET /bookings` → List bookings. Filters: `status`, `dateRange`, `customerId`. Each list item includes `totalPrice`, `totalDurationMins`, and a compact `lineSummary: [{ serviceId, serviceNameAtBooking, priceAtBooking }, …]`.
- `GET /bookings/:id` → Detailed view: every line in full, audit log, photos, customer / guest info.

**Admin approval workflow** (JWT + `MANAGER|STAFF` role required):
- `PATCH /bookings/:id/approve` → (UC-003) Approve a PENDING or INFO_REQUESTED booking. Re-checks slot availability. Returns `200 { bookingId, status: 'APPROVED', approvedAt }`. Returns `409 slot-unavailable` if slot is taken.
- `PATCH /bookings/:id/reject` → (UC-004) Reject a PENDING or INFO_REQUESTED booking. Body: `{ reason: string }` (required, min 10 chars). Returns `200 { bookingId, status: 'REJECTED' }`.
- `PATCH /bookings/:id/request-info` → (UC-005a) Transition PENDING → INFO_REQUESTED. Body: `{ message: string }` (required, min 20 chars). Returns `200 { bookingId, status: 'INFO_REQUESTED' }`.

**Customer info submission** (JWT + `CUSTOMER` role required; tokenised-link flow for guests TBD in M08-S04):
- `PATCH /bookings/:id/submit-info` → (UC-005b) Transition INFO_REQUESTED → PENDING. Body: `{ response: string, photoUrls?: string[] }`. Returns `200 { bookingId, status: 'PENDING' }`. Any provided `photoUrls` are appended to `booking.beforeServicePhotoUrls`.

- `PATCH /bookings/:id` → (UC-008) General update (e.g., **Reschedule** date/time). Lines cannot be edited after `APPROVED` (returns `409 booking-lines-frozen`).

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
    "notes": "Extra shine applied",
    "photoUrls": ["https://..."],
    "lineActualPrices": [
      { "lineId": "uuid-line-1", "actualPriceCharged": 80.00 },
      { "lineId": "uuid-line-2", "actualPriceCharged": 0.00 }
    ]
  }
  ```
  - `lineActualPrices` is optional. Omit it entirely if all lines were charged at full price.
  - Individual entries can be omitted — lines not listed default to `priceAtBooking`.
  - `actualPriceCharged` must be `>= 0`. Zero is valid (waived service).

- **Response (`200 OK`):**
  ```json
  {
    "bookingId": "uuid",
    "status": "COMPLETED",
    "totalPrice":       { "amount": 120.00, "currency": "BRL" },
    "totalActualPrice": { "amount":  80.00, "currency": "BRL" },
    "lines": [
      {
        "lineId": "uuid-line-1",
        "serviceId": "uuid-basic-wash",
        "priceAtBooking":     { "amount": 100.00, "currency": "BRL" },
        "actualPriceCharged": { "amount":  80.00, "currency": "BRL" }
      },
      {
        "lineId": "uuid-line-2",
        "serviceId": "uuid-pickup",
        "priceAtBooking":     { "amount": 20.00, "currency": "BRL" },
        "actualPriceCharged": { "amount":  0.00, "currency": "BRL" }
      }
    ]
  }
  ```

- **Errors:**
  - `400 invalid-line-id` — a `lineId` in `lineActualPrices` does not belong to this booking.
  - `400 invalid-actual-price` — `actualPriceCharged` is negative.

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
- `422` — `from > to`, or range exceeds `max_booking_advance_days` (default 90 days)

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
  - `422` if date is past OR day-of-week is already open in `business_hours`
  - `409` if an opening already exists for that date

- `DELETE /schedule/openings/:id` → remove opening; day reverts to default-closed
  - `204` on success
  - `404` if not found or belongs to another tenant

---

## 5. Customer & Loyalty

### **Customer Management (UC-002, UC-006, UC-007)**
- `GET /customers` -> (Admin) List all customers in tenant.
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
    { "currentPoints": 150, "nextExpiryDate": "2026-11-15", "nextExpiryPoints": 30 }
    ```
  - `currentPoints`: read from `loyalty_balances.current_points` (O(1) — no SUM).
  - `nextExpiryDate`: ISO-8601 date string of the earliest `expires_at` among active entries; `null` if no active entries.
  - `nextExpiryPoints`: sum of points expiring on `nextExpiryDate`; `null` if no active entries.
  - Returns `{ currentPoints: 0, nextExpiryDate: null, nextExpiryPoints: null }` when customer has no balance row.

- `GET /loyalty/entries?page=1&limit=20`
  - Returns paginated earning history, most recent first.
  - Response:
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
  - Returns paginated redemption history, most recent first.
  - Response:
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

- `GET /customers/:customerId/loyalty/balance` — same response shape as customer balance endpoint.
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
> All three layers must pass. The `TenantInterceptor` skips `/internal/*` — no `X-Tenant-ID` header is expected.

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

### `POST /internal/loyalty/expire-points` — Run daily points expiry (M10-S08)

Decrements `loyalty_balances.current_points` for all `loyalty_entries` whose `expires_at` has passed. Triggered by a GCP Cloud Scheduler job at 02:00 UTC daily. Fully idempotent — safe to call multiple times; already-processed entries are skipped via `balance_expiry_log`.

**Why HTTP trigger (not `@Cron`):** Cloud Run scales to zero and multi-pod deployments would execute a `@Cron` on every pod simultaneously. GCP Cloud Scheduler issues one HTTP request; one pod handles it.

**Request headers:**
```
(no Authorization header required in MVP — network-protected; M115-S03 adds X-Internal-Key via InternalApiGuard)
```

**Request body:** none

**Response `200 OK`:**
```json
{
  "processedEntries": 12,
  "affectedCustomers": 5,
  "totalPointsExpired": 87
}
```
Returns `{ processedEntries: 0, affectedCustomers: 0, totalPointsExpired: 0 }` when no entries have expired.

**GCP Cloud Scheduler resource (Terraform — tracked in M115/M16):**
```hcl
resource "google_cloud_scheduler_job" "loyalty_expire_points" {
  name     = "loyalty-expire-points"
  schedule = "0 2 * * *"
  time_zone = "UTC"
  http_target {
    uri        = "${var.backend_internal_url}/internal/loyalty/expire-points"
    http_method = "POST"
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
