# API Contracts - BeloAuto

## Overview

BeloAuto follows a **RESTful API** standard using **JSON** for all payloads. All communication must be encrypted over **HTTPS**.

**Error Response Standard:** [RFC 9457 Problem Details](https://tools.ietf.org/html/rfc9457) — see [25-ERROR_CATALOG.md](25-ERROR_CATALOG.md) for complete error reference.

---

## Base Standards

### 1. **Base URL**
- **Production:** `https://api.beloauto.com/v1`
- **Local:** `http://localhost:3000/v1`

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
  "sub": "user-uuid",
  "tenantId": "tenant-uuid",
  "tenantSlug": "autowash-pro",
  "role": "STAFF | CUSTOMER",
  "iat": 123456789,
  "exp": 123456789
}
```

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
- `GET /services` -> List all services (Public/Admin).
- `POST /services` -> Create service (Admin).
- `PATCH /services/:id` -> Update service details/price/duration (Admin).
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
5. Frontend submits POST /bookings with carPhotoUrls: [fileUrl1, fileUrl2, ...]
6. System validates URLs and creates booking
```

### **Booking Requests (UC-001, UC-002)**
A booking has **1..N service lines**. Order in the `serviceIds` array is preserved (so the customer sees the lines in the order they added them); duplicates are allowed (two `Basic Wash` lines = two cars).

- `POST /bookings`
- **Body:**
  ```json
  {
    "serviceIds":   ["uuid-basic-wash", "uuid-wax", "uuid-basic-wash"],  // ≥ 1; duplicates OK
    "scheduledAt":  "ISO8601",                                            // start of the slot
    "guestInfo":    { "name": "...", "email": "...", "phone": "..." },    // omit when authenticated (BFF reads from JWT)
    "carPhotoUrls": ["https://..."]                                       // optional
  }
  ```
- **Response (`201 Created`)** — the server is the source of truth for snapshot fields and totals:
  ```json
  {
    "bookingId":          "uuid",
    "status":             "PENDING",
    "scheduledAt":        "ISO8601",
    "totalPrice":         { "amount": 75.00, "currency": "USD" },
    "totalDurationMins":  85,
    "lines": [
      {
        "lineId":                "uuid",
        "serviceId":             "uuid-basic-wash",
        "priceAtBooking":        { "amount": 20.00, "currency": "USD" },
        "durationMinsAtBooking": 30,
        "pointsValueAtBooking":  1
      },
      { "lineId": "uuid", "serviceId": "uuid-wax",        "priceAtBooking": { "amount": 35.00, "currency": "USD" }, "durationMinsAtBooking": 25, "pointsValueAtBooking": 3 },
      { "lineId": "uuid", "serviceId": "uuid-basic-wash", "priceAtBooking": { "amount": 20.00, "currency": "USD" }, "durationMinsAtBooking": 30, "pointsValueAtBooking": 1 }
    ],
    "carPhotoUrls": ["https://..."]
  }
  ```
- **Errors (RFC 9457 Problem Details):**
  - `400 invalid-services-empty` — `serviceIds` is empty.
  - `400 invalid-services-not-found` — one or more `serviceId` does not exist in the current tenant.
  - `400 invalid-services-inactive` — one or more service has `is_active = false`.
  - `409 slot-unavailable` — the requested `scheduledAt + totalDurationMins` window overlaps another APPROVED booking or a `ScheduleClosure`.

### **Booking Management (UC-003 - UC-008)**
- `GET /bookings` → List bookings. Filters: `status`, `dateRange`, `customerId`. Each list item includes `totalPrice`, `totalDurationMins`, and a compact `lineSummary: [{ serviceId, priceAtBooking }, …]`.
- `GET /bookings/:id` → Detailed view: every line in full, audit log, photos, customer / guest info.
- `PATCH /bookings/:id/status` → (UC-003, UC-004, UC-005, UC-007, UC-008)
  - **Status enum:** `APPROVED | REJECTED | CANCELLED | INFO_REQUESTED | PENDING` (`PENDING` only when transitioning back from `INFO_REQUESTED` via UC-005 alt-flow A2).
- `PATCH /bookings/:id` → (UC-008) General update (e.g., **Reschedule** date/time). Lines cannot be edited after `APPROVED` (returns `409 booking-lines-frozen`).

### **Information Workflow (UC-005)**
- `POST /bookings/:id/info` -> Customer submits requested photos/notes.

### **Completion (UC-009)**
- `PATCH /bookings/:id/complete`
- **Body:** `{ "notes": "...", "photoUrls": ["..."] }`

---

## 4. Schedule & Availability

### **Customer Availability (UC-011)**
Availability depends on the **total duration** of the customer's basket, not on individual services. The caller passes `serviceIds` (the basket) and the server computes the required slot length internally.

- `GET /schedule/availability?serviceIds=uuid1,uuid2,uuid3&month=2026-05`
- **Response:**
  ```json
  {
    "totalDurationMins": 85,
    "days": [
      {
        "date": "2026-05-12",
        "startTimes": ["09:00", "09:30", "11:15", "14:00"]   // ISO time-of-day; each is a valid scheduledAt
      },
      ...
    ]
  }
  ```
- **Errors:** `400 invalid-services-empty`, `400 duration-exceeds-business-hours`.

### **Schedule Closures (UC-010)**
- `GET /schedule/closures` -> List active closures.
- `POST /schedule/closures` -> (Admin) Close dates for maintenance/holidays.
- `DELETE /schedule/closures/:id` -> (Admin) Reopen schedule.

---

## 5. Customer & Loyalty

### **Customer Management (UC-016)**
- `GET /customers` -> (Admin) List all customers in tenant.
- `GET /customers/:id` -> (Admin/Self) Detailed profile.
- `GET /me` -> (Self) Current authenticated user profile.

### **Loyalty Metrics (UC-016)**
- `GET /loyalty/balance` — current customer's active points.
  - Response: `{ totalActive, byService: [{ serviceId, serviceName, activePoints, completionsCount }, …], nextExpiresAt }`
- `GET /loyalty/entries` — flat list of the customer's `LoyaltyEntry` rows (most recent first), with `pointsActive` flag (`expires_at > now`).
- (No `redeem` endpoint, no `adjust` endpoint — see `docs/02-DOMAIN_MODEL.md` Loyalty Context "What this model intentionally does NOT support".)

---

## 6. System & Future

### **Analytics (UC-017)**
- `GET /analytics/summary` -> Dashboard stats for admins.

### **Notifications (Audit)**
- `GET /notifications/logs` -> View status of emails sent (UC-018, 019, 020 verification).

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
