# API Error Catalog - Ikaro

**Status:** Phase 2 - Technical Architecture  
**Audience:** Frontend developers, API consumers, AI agents  
**Standard:** RFC 9457 Problem Details for HTTP APIs  
**Last Updated:** 2026-05-11

---

## Overview

This document defines all error responses in the Ikaro API using RFC 9457 (Problem Details) standard. Each error includes a machine-readable `type` URI, HTTP status code, and developer-friendly message.

---

## Error Response Format

All errors follow RFC 9457 Problem Details structure:

```json
{
  "type": "https://api.<ikaro-domain>/errors#error-code",
  "status": 400,
  "title": "Invalid Services",
  "detail": "The serviceIds array is empty. Please select at least one service.",
  "instance": "/bookings",
  "timestamp": "2026-05-11T23:08:44Z",
  "correlationId": "uuid-v7"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string (URI) | Machine-readable error identifier |
| `status` | integer | HTTP status code (400, 401, 403, 404, 409, 413, 429, 500, etc.) |
| `title` | string | Short error summary |
| `detail` | string | Human-readable explanation |
| `instance` | string | Which endpoint/resource caused the error |
| `timestamp` | ISO 8601 | When the error occurred |
| `correlationId` | UUID | Trace ID for debugging |

---

## Error Categories

### **1. Authentication & Authorization (4xx)**

#### `401 Unauthorized`
```json
{
  "type": "https://api.<ikaro-domain>/errors#unauthorized",
  "status": 401,
  "title": "Unauthorized",
  "detail": "Missing or invalid Authorization header. Please provide a valid JWT token."
}
```
**Trigger:** Missing `Authorization: Bearer <JWT>` header or token invalid/expired

---

#### `403 Forbidden`
```json
{
  "type": "https://api.<ikaro-domain>/errors#forbidden",
  "status": 403,
  "title": "Forbidden",
  "detail": "You do not have permission to access this resource. Required role: ADMIN."
}
```
**Trigger:** User lacks required role/permissions

---

#### `403 Tenant Mismatch`
```json
{
  "type": "https://api.<ikaro-domain>/errors#tenant-mismatch",
  "status": 403,
  "title": "Tenant Mismatch",
  "detail": "The X-Tenant-Slug header does not match your assigned tenant. Your tenant is 'autowash-pro'."
}
```
**Trigger:** JWT tenant ≠ X-Tenant-Slug header

---

### **2. Booking Validation (400)**

#### `400 invalid-services-empty`
```json
{
  "type": "https://api.<ikaro-domain>/errors#invalid-services-empty",
  "status": 400,
  "title": "Invalid Services",
  "detail": "At least one service must be selected. The serviceIds array is empty."
}
```
**Trigger:** POST /bookings with empty `serviceIds: []`

---

#### `400 invalid-services-not-found`
```json
{
  "type": "https://api.<ikaro-domain>/errors#invalid-services-not-found",
  "status": 400,
  "title": "Services Not Found",
  "detail": "One or more services do not exist: ['uuid-nonexistent-1', 'uuid-nonexistent-2']. Check your serviceIds."
}
```
**Trigger:** POST /bookings with non-existent `serviceId`

---

#### `400 invalid-services-inactive`
```json
{
  "type": "https://api.<ikaro-domain>/errors#invalid-services-inactive",
  "status": 400,
  "title": "Services Inactive",
  "detail": "One or more services are inactive (archived): ['Basic Wash']. Only active services can be booked."
}
```
**Trigger:** POST /bookings with `is_active = false` service

---

#### `400 missing-pickup-address`
```json
{
  "type": "https://api.<ikaro-domain>/errors#missing-pickup-address",
  "status": 400,
  "title": "Pickup Address Required",
  "detail": "The selected service 'Coleta e Entrega' requires a pickup address. Please provide pickupAddress in the request."
}
```
**Trigger:** POST /bookings where at least one service has `requiresPickupAddress = true` but `pickupAddress` was not provided.

---

#### `400 invalid-pickup-address`
```json
{
  "type": "https://api.<ikaro-domain>/errors#invalid-pickup-address",
  "status": 400,
  "title": "Invalid Pickup Address",
  "detail": "pickupAddress.zipCode must be exactly 8 digits (CEP). Provided: '301309-21'."
}
```
**Trigger:** POST /bookings with a `pickupAddress` that fails validation (CEP format, missing required fields, invalid UF).

---

#### `400 invalid-scheduled-time`
```json
{
  "type": "https://api.<ikaro-domain>/errors#invalid-scheduled-time",
  "status": 400,
  "title": "Invalid Scheduled Time",
  "detail": "scheduledAt must be ISO 8601 format and in the future. Provided: 'not-a-date'."
}
```
**Trigger:** POST /bookings with malformed or past `scheduledAt`

---

#### `400 invalid-guest-info`
```json
{
  "type": "https://api.<ikaro-domain>/errors#invalid-guest-info",
  "status": 400,
  "title": "Invalid Guest Info",
  "detail": "Guest booking requires name, email, and phone. Missing: 'email'."
}
```
**Trigger:** POST /bookings (unauthenticated) without complete guestInfo

---

### **3. Slot Availability (409)**

#### `409 slot-unavailable`
```json
{
  "type": "https://api.<ikaro-domain>/errors#slot-unavailable",
  "status": 409,
  "title": "Slot Unavailable",
  "detail": "The requested time slot [2026-05-12 14:00–15:30] overlaps an existing APPROVED booking or system closure. Available alternatives: [14:30, 15:00, 15:30]."
}
```
**Trigger:** POST /bookings with `scheduledAt` that conflicts with existing booking/closure

---

### **4. File Upload (400, 413)**

#### `400 invalid-file-name`
```json
{
  "type": "https://api.<ikaro-domain>/errors#invalid-file-name",
  "status": 400,
  "title": "Invalid File Name",
  "detail": "fileName must be 1–255 characters and contain no path separators. Provided: '/etc/passwd' (257 chars)."
}
```
**Trigger:** POST /bookings/attachments/signed-url with invalid `fileName`

---

#### `400 unsupported-media-type`
```json
{
  "type": "https://api.<ikaro-domain>/errors#unsupported-media-type",
  "status": 400,
  "title": "Unsupported Media Type",
  "detail": "Only image/jpeg and image/png are supported. Provided: 'image/gif'."
}
```
**Trigger:** POST /bookings/attachments/signed-url with non-image MIME type

---

#### `413 file-too-large`
```json
{
  "type": "https://api.<ikaro-domain>/errors#file-too-large",
  "status": 413,
  "title": "File Too Large",
  "detail": "File size (15 MB) exceeds maximum 10 MB. Please compress your image."
}
```
**Trigger:** Upload attempt with file > 10 MB

---

#### `429 too-many-files`
```json
{
  "type": "https://api.<ikaro-domain>/errors#too-many-files",
  "status": 429,
  "title": "Too Many Files",
  "detail": "Maximum 5 files can be uploaded per session. You've already requested URLs for 5 files."
}
```
**Trigger:** POST /bookings/attachments/signed-url (6th call in same session)

---

#### `410 upload-url-expired`
```json
{
  "type": "https://api.<ikaro-domain>/errors#upload-url-expired",
  "status": 410,
  "title": "Upload URL Expired",
  "detail": "The signed URL expired at 2026-05-12T00:08:44Z (1 hour after issuance). Please request a new URL."
}
```
**Trigger:** Attempt to upload to signed URL after 1 hour

---

### **5. Pagination (400)**

#### `400 invalid-limit`
```json
{
  "type": "https://api.<ikaro-domain>/errors#invalid-limit",
  "status": 400,
  "title": "Invalid Limit",
  "detail": "limit must be between 1 and 100. Provided: '500'. (Will be capped at 100.)"
}
```
**Trigger:** GET /bookings?limit=500 (value > 100)

---

#### `400 invalid-offset`
```json
{
  "type": "https://api.<ikaro-domain>/errors#invalid-offset",
  "status": 400,
  "title": "Invalid Offset",
  "detail": "offset must be >= 0. Provided: '-10'."
}
```
**Trigger:** GET /bookings?offset=-10

---

### **6. Resource Not Found (404)**

#### `404 not-found`
```json
{
  "type": "https://api.<ikaro-domain>/errors#not-found",
  "status": 404,
  "title": "Not Found",
  "detail": "Booking with ID 'uuid-xyz' does not exist in tenant 'autowash-pro'."
}
```
**Trigger:** GET /bookings/uuid-xyz (booking doesn't exist or belongs to different tenant)

---

#### `404 service-not-found`
```json
{
  "type": "https://api.<ikaro-domain>/errors#service-not-found",
  "status": 404,
  "title": "Service Not Found",
  "detail": "Service with ID 'uuid-abc' does not exist in this tenant."
}
```
**Trigger:** GET /services/uuid-abc

---

### **7. Cancellation Rules (400, 409)**

#### `400 cancellation-ineligible`
```json
{
  "type": "https://api.<ikaro-domain>/errors#cancellation-ineligible",
  "status": 400,
  "title": "Cancellation Ineligible",
  "detail": "Booking cannot be cancelled less than 48 hours before appointment. Your appointment is in 24 hours."
}
```
**Trigger:** PATCH /bookings/:id/status to CANCELLED (within cancellation window)

---

#### `409 booking-locked`
```json
{
  "type": "https://api.<ikaro-domain>/errors#booking-locked",
  "status": 409,
  "title": "Booking Locked",
  "detail": "Booking is already COMPLETED and cannot be modified or cancelled."
}
```
**Trigger:** PATCH /bookings/:id/status or other mutations after COMPLETED

---

### **8. Business Logic (409)**

#### `409 booking-lines-frozen`
```json
{
  "type": "https://api.<ikaro-domain>/errors#booking-lines-frozen",
  "status": 409,
  "title": "Booking Lines Frozen",
  "detail": "Cannot modify services once booking is APPROVED. Please cancel and re-book if you need different services."
}
```
**Trigger:** PATCH /bookings/:id to add/remove lines after APPROVED

---

#### `409 invalid-state-transition`
```json
{
  "type": "https://api.<ikaro-domain>/errors#invalid-state-transition",
  "status": 409,
  "title": "Invalid State Transition",
  "detail": "Cannot transition from REJECTED to APPROVED. Valid transitions from REJECTED: none (terminal state)."
}
```
**Trigger:** PATCH /bookings/:id/status with invalid state machine transition

---

### **9. Server Errors (5xx)**

#### `500 internal-server-error`
```json
{
  "type": "https://api.<ikaro-domain>/errors#internal-server-error",
  "status": 500,
  "title": "Internal Server Error",
  "detail": "An unexpected error occurred. Please contact support with correlationId: 'uuid-v7'."
}
```
**Trigger:** Unhandled exception on server

---

#### `503 service-unavailable`
```json
{
  "type": "https://api.<ikaro-domain>/errors#service-unavailable",
  "status": 503,
  "title": "Service Unavailable",
  "detail": "The service is temporarily unavailable. Please retry in a few moments."
}
```
**Trigger:** Server maintenance, deployment, or critical dependency down

---

## Error Handling Best Practices

### **For Frontend Developers:**

1. **Always check `type` URI, not status code alone**
   ```typescript
   if (error.type === 'https://api.<ikaro-domain>/errors#slot-unavailable') {
     // Offer alternative slots from error.detail
   }
   ```

2. **Log `correlationId` for debugging**
   ```typescript
   console.error(`Error (${error.correlationId}): ${error.detail}`);
   ```

3. **Handle 4xx (client error) vs 5xx (server error) differently**
   - 4xx: Show user-friendly message from `detail`
   - 5xx: Show generic message, log correlationId for support

4. **Retry logic**
   - 409 errors: Don't retry (business conflict)
   - 429 errors: Retry with exponential backoff
   - 5xx errors: Retry with exponential backoff (3 attempts max)

### **For API Developers (AI Agents):**

1. **Always throw specific error type**
   ```typescript
   throw new BadRequestException({
     type: 'https://api.<ikaro-domain>/errors#invalid-services-empty',
     title: 'Invalid Services',
     detail: 'At least one service must be selected.'
   });
   ```

2. **Include `correlationId` in all error responses**
   ```typescript
   error.correlationId = request.correlationId; // from middleware
   ```

3. **Use consistent HTTP status codes per error type**
   - Validation errors: 400
   - Slot conflicts: 409
   - File upload errors: 400, 413, 410
   - Auth errors: 401, 403
   - Not found: 404

---

## Adding New Errors (Post-MVP)

When adding new error types:

1. Assign unique `error-code` in kebab-case
2. Create RFC 9457 type URI: `https://api.<ikaro-domain>/errors#error-code`
3. Assign appropriate HTTP status
4. Add entry to this catalog
5. Update client-side error handling

Example:
```json
{
  "type": "https://api.<ikaro-domain>/errors#custom-validation-failed",
  "status": 400,
  "title": "Custom Validation Failed",
  "detail": "..."
}
```

---

**Status:** Complete  
**Next:** Implement all errors in error-handling middleware  
**Reference:** RFC 9457 (https://tools.ietf.org/html/rfc9457)
