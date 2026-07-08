# TD22 — Orphaned Upload Cleanup: Unified `tmp/` Staging + Promote-on-Submit

## Status
- **Type**: Architecture / Storage cost & hygiene
- **Priority**: Medium (no security exposure, but unbounded storage growth with zero cleanup — cost and eventual GCS listing/perf drag)
- **Contexts affected**: `platform` (hotsite images), `booking` (attachment photos) — backend + web
- **Discovered**: 2026-07-07, during M13-S36 (Hotsite Layout tab) discovery, while wiring image deletion for the new Gallery/config-panel upload flows

---

## Problem

Every upload surface in this app writes the file to its bucket **immediately on file selection**, independent of whether the surrounding form is ever submitted or the surrounding draft ever saved. Confirmed by reading each flow directly (not assumed):

1. **Hotsite images** (`apps/web/features/platform/components/hotsite/**`) — `SingleImageUploadField`, `GalleryImageManager`, `LogoUpload`, all `*ConfigPanel`s. `GenerateHotsiteImageSignedUrlUseCase` calls `generateWriteSignedUrl(filePath, contentType, 'public')` — the file lands in the **public** bucket the moment the PUT completes, before "Aplicar," before Publish (which doesn't even persist anything yet — `useUpdateHotsiteConfig` has zero callers in the component tree today).

2. **Booking photos** (`PhotoUpload.tsx`, `AfterServicePhotoUpload.tsx`) — `GenerateAttachmentSignedUrlUseCase` calls `generateWriteSignedUrl(filePath, contentType)` with no third argument, defaulting to the **private** bucket. Better than hotsite in one sense (not public), but `handleRemove()` in both components never calls any delete — it only drops the path from local form state:
   ```tsx
   function handleRemove(id: string) {
     const item = items.find((i) => i.id === id);
     setItems((prev) => prev.filter((i) => i.id !== id));
     if (!item) return;
     URL.revokeObjectURL(item.previewUrl);
     if (item.filePath) {
       onChange(value.filter((filePath) => filePath !== item.filePath));
     }
   }
   ```
   Clicking "Remove" and abandoning the screen entirely produce the *same* outcome: the object stays in the bucket forever.

Three concrete leak scenarios, all currently unaddressed:
- **Abandoned upload**: user uploads, never submits/saves/applies. Orphaned immediately.
- **Explicit remove**: user uploads, clicks "Remove" before submitting. Also orphaned — removal never reaches storage.
- **Superseded upload**: user replaces an already-saved/published image with a new one. The *old* object is dropped from the config/booking record with nothing deleting it — this one persists even after a fully successful save, because nothing currently tracks "what did this field used to point to."

No lifecycle policy exists on either GCS bucket to catch any of this as a backstop — `media`'s only `lifecycle_rule` is an unrelated 365-day full-bucket retention policy (`docs/23-INFRASTRUCTURE_SETUP.md` `storage.tf`), and `hotsite_public` has no lifecycle rule at all.

### Third upload surface found during review — appears dead, out of scope here

`apps/bff/src/features/uploads/uploads.controller.ts` (`POST /uploads/signed-url`) is a third signed-URL endpoint, distinct from the two above. Checked whether it's actually reachable: no frontend code anywhere calls `/uploads/signed-url` or references this controller's path; it hardcodes `http://localhost:4443/ikaro-local/...` (the local GCS emulator's address, would not work against any real environment); it does no tenant scoping and generates no real signature. It's registered in `uploads.module.ts` and has a passing spec, so it's not literally unreachable at the HTTP layer, but nothing in the product uses it. This looks like an early scaffold that predates the real per-context endpoints (`hotsite-admin`'s `images/signed-url`, `bookings`' `attachments/signed-url`) and was never removed.

**Not folded into this TD's scope** — it doesn't need tmp-staging because nothing uploads through it. Recommend a separate, small cleanup (delete `apps/bff/src/features/uploads/` entirely) either as its own quick PR or bundled into whichever PR implements this TD, at the implementer's discretion.

---

## Root Cause

Upload and "the object is actually referenced by something durable" are the same event today. There's no staging step — a file is either fully live (hotsite: public and addressable) or fully "committed" (booking: private, but with no distinction between "just uploaded" and "attached to a real booking") from the instant the PUT completes.

---

## Fix — Chosen Architecture

**Unified `tmp/` staging prefix, one shared GCS lifecycle rule, explicit promote-on-submit/save.**

All uploads — hotsite and booking alike — write to `tmp/<tenantId>/<uuid>/<fileName>` in the **private** (`media`) bucket. Nothing is public or "real" until an explicit promotion step copies it to its permanent path at the moment the surrounding record is actually persisted (booking submission, hotsite content save). Anything left in `tmp/` — abandoned, removed, or simply never reached — ages out via a lifecycle rule. No new `IStorageService` capability is needed beyond one signature extension (below); `copy()`, `delete()`, and `exists()` already do everything promotion needs.

### Path convention: `tmp/` must be bucket-root-prefixed, not tenant-nested

GCS Object Lifecycle conditions only support `matchesPrefix`/`matchesSuffix` — literal string matching from the start of the object name, **no wildcards**. A path like `tenants/<tenantId>/tmp/...` cannot be matched by one rule across all tenants, since every tenant has a different ID before `tmp/`. The path must therefore be:

```
tmp/<tenantId>/<uuid>/<fileName>
```

— `tmp/` first, tenant ID second — so a single rule with `matches_prefix = ["tmp/"]` catches every tenant's staged objects with one static prefix. This is a deliberate deviation from the `tenants/<id>/...`-first convention used everywhere else in this codebase, and it has one direct consequence: existing tenant-ownership regexes (`FeatureBookingPhotoUseCase.extractTenantId()`, `DeleteHotsiteImageUseCase.extractTenantId()` — both anchored on `^tenants\/([^/]+)\/...`) are **not reusable as-is** for tmp-path validation. Promotion logic needs its own extractor:

```typescript
function extractTenantIdFromTmpPath(filePath: string): string | null {
  const match = /^tmp\/([^/]+)\/.+$/.exec(filePath);
  return match?.[1] ?? null;
}
```

### `IStorageService.copy()` needs a destination-bucket parameter

Current signature only supports private→public (hard-coded in `GcsSignedUrlAdapter.copy()`):
```typescript
async copy(sourcePath: string, destinationPath: string): Promise<void> {
  const source = this.storage.bucket(this.bucketName).file(sourcePath);
  const destination = this.storage.bucket(this.publicBucketName).file(destinationPath);
  await source.copy(destination);
}
```
This is correct for hotsite promotion (tmp lives in `media`/private, permanent hotsite images live in `hotsite_public`) but **wrong** for booking-attachment promotion, which needs a private→private copy (tmp in `media` → `tenants/<id>/bookings/<id>/...`, still in `media`). Extend the port:

```typescript
// storage.service.port.ts
/** Copies an object. `destinationBucket` defaults to 'public' (unchanged existing behavior
 * for FeatureBookingPhotoUseCase) — pass 'private' for a same-bucket promotion like booking
 * attachments. Source is always read from the private bucket (that's where tmp/ lives). */
copy(sourcePath: string, destinationPath: string, destinationBucket?: 'private' | 'public'): Promise<void>;
```

```typescript
// gcs-signed-url.adapter.ts
async copy(
  sourcePath: string,
  destinationPath: string,
  destinationBucket: 'private' | 'public' = 'public',
): Promise<void> {
  const source = this.storage.bucket(this.bucketName).file(sourcePath);
  const destBucketName = destinationBucket === 'public' ? this.publicBucketName : this.bucketName;
  const destination = this.storage.bucket(destBucketName).file(destinationPath);
  await source.copy(destination);
}
```

`InMemoryStorageService.copy()` (test double) needs the matching third parameter (can ignore the value functionally — it already only tracks one `existingPaths` set — but must accept the parameter so callers type-check).

`FeatureBookingPhotoUseCase`'s existing call site (`this.storageService.copy(dto.filePath, filePath)`) is unaffected — no third argument, still defaults to `'public'`.

---

## Fix — Hotsite Promotion (primary worked example)

`UpdateHotsiteContentUseCase` is the single right integration point — it already has both the *old* persisted `config.branding`/`config.layout` and the *new* merged values in scope, and already walks every image field via `HotsiteImagePathsService.collect()`. This is also where delete-previous-on-replace naturally belongs, since this use case is the only place that sees both states at once.

> **Precondition — depends on `M13-S37`:** Step 3's `tenants/${tenantId}/...` branch (below) assumes the hotsite editor's save flow never round-trips a GET-resolved public URL back as an untouched field's value — it must send either the original raw storage path, a fresh upload's raw path, or omit the field entirely (`UpdateHotsiteContentUseCase` merges partial `dto.branding` over the stored value, so omission preserves the existing stored path unchanged). `M13-S37` (Hotsite: SEO tab + Preview + Publish/Unpublish) fixes this on the frontend — it's the first story to actually wire the real `PATCH` save flow. If that fix isn't in place, every untouched image field fails promotion with `HotsiteImageNotUploadedError`, the same failure mode `verifyImagesExist` already has today. Implement this TD after `M13-S37` lands, not before or concurrently.

Current (`update-hotsite-content.use-case.ts`):
```typescript
private async verifyImagesExist(
  branding: HotsiteBranding,
  layout: HotsiteModule[],
  tenantId: string,
): Promise<void> {
  const tenantPrefix = `tenants/${tenantId}/`;
  for (const path of this.imagePathsService.collect(branding, layout)) {
    if (!path.startsWith(tenantPrefix)) throw new HotsiteImageNotUploadedError(path);
    const exists = await this.storageService.exists(path, 'public');
    if (!exists) throw new HotsiteImageNotUploadedError(path);
  }
}
```

Replace with a `promoteAndValidateImages` step that:
1. Collects `oldPaths` from `config.branding`/`config.layout` (**before** merging in `dto`).
2. Merges branding/layout as today.
3. For each path collected from the **merged** branding/layout:
   - If it matches `tmp/<tenantId>/...` (tenant-checked via `extractTenantIdFromTmpPath`, else `HotsiteImageNotUploadedError`) → verify it `exists(path, 'private')`, then `copy(path, newPermanentPath, 'public')` where `newPermanentPath` reuses the *existing* `tenants/<tenantId>/hotsite/<purpose>/<uuid>/<fileName>` convention (purpose isn't known at this layer today — see open question below), rewrite the in-memory branding/layout field to `newPermanentPath`, and `delete(path, 'private')` the tmp original immediately (belt-and-suspenders on top of the lifecycle rule — frees the object right away rather than waiting out the TTL).
   - If it matches `tenants/${tenantId}/...` (already permanent, untouched field) → validate `exists(path, 'public')` as today.
   - Anything else → `HotsiteImageNotUploadedError`.
4. Compute `newPaths` from the now-rewritten branding/layout (post-promotion).
5. For every path in `oldPaths` not present in `newPaths` **and** matching `tenants/${tenantId}/...` (i.e. it was a real, permanent, promoted object — not a tmp one, tmp cleanup is the lifecycle rule's job) → `delete(path, 'public')`. Best-effort: a failure here shouldn't fail the whole save (the reference is already gone from the config either way) — log and continue, mirroring `SingleImageUploadField`'s existing best-effort delete pattern on the frontend.
6. Proceed to `config.updateContent(branding, layout, seo)` and save as today.

**Open question to resolve during implementation**: the current promotion path needs a `purpose` segment (`tenants/<id>/hotsite/<purpose>/...`) that today only exists at *upload* time (`GenerateHotsiteImageSignedUrlUseCase`'s `dto.purpose`), not at *save* time. Either (a) encode `purpose` into the tmp path too (`tmp/<tenantId>/<purpose>/<uuid>/<fileName>`, still safe for the lifecycle rule since `matches_prefix` only needs `tmp/`), or (b) derive purpose from which field the path was found on during `collect()` (e.g. `backgroundImageUrl` on `HERO`/`BOOKING_CTA` → `hero`/`booking-cta`, `avatarUrl` on `TESTIMONIALS` → `testimonials`, etc.). (a) is simpler and doesn't require `HotsiteImagePathsService` to know per-field purpose mappings — recommended.

---

## Fix — Booking Attachment Promotion

**Correction from the first draft of this TD**: all five photo-handling use cases already funnel through one shared service — `PhotoExistenceService.assertPhotosUploaded(photoUrls, tenantId)` (`apps/backend/src/contexts/booking/application/services/photo-existence.service.ts`), confirmed by reading all five call sites directly, not just grepping field names:

```typescript
// current
@Injectable()
export class PhotoExistenceService {
  constructor(@Inject(STORAGE_SERVICE) private readonly storageService: IStorageService) {}

  async assertPhotosUploaded(photoUrls: string[], tenantId: string): Promise<void> {
    const tenantPrefix = `tenants/${tenantId}/`;
    for (const photoUrl of photoUrls) {
      if (!photoUrl.startsWith(tenantPrefix)) throw new BookingPhotoNotUploadedError(photoUrl);
      const exists = await this.storageService.exists(photoUrl);
      if (!exists) throw new BookingPhotoNotUploadedError(photoUrl);
    }
  }
}
```

This is the exact same shape as hotsite's `verifyImagesExist` — the right move is to **extend this existing service**, not add a parallel one. It already has the correct existing error (`BookingPhotoNotUploadedError`, in `booking-domain.error.ts`) — no new error class needed, unlike what an earlier draft of this TD assumed.

| Use case | Photo field | `bookingId` available before promotion needs it? |
|---|---|---|
| `request-booking.use-case.ts` | `beforeServicePhotoUrls` (guest) | **No** — see ID-generation problem below |
| `request-authenticated-booking.use-case.ts` | `beforeServicePhotoUrls` (customer) | **No** — same problem, same fix |
| `submit-booking-info.use-case.ts` | response `photoUrls` (customer) | Yes (existing booking) |
| `submit-guest-booking-info.use-case.ts` | response `photoUrls` (guest) | Yes |
| `complete-booking.use-case.ts` | `afterServicePhotoUrls` (staff) | Yes |

```typescript
// photo-existence.service.ts — extended
@Injectable()
export class PhotoExistenceService {
  constructor(@Inject(STORAGE_SERVICE) private readonly storageService: IStorageService) {}

  async promotePhotos(tmpPaths: string[], tenantId: string, bookingId: string): Promise<string[]> {
    const promoted: string[] = [];
    for (const path of tmpPaths) {
      if (this.extractTenantId(path) !== tenantId) throw new BookingPhotoNotUploadedError(path);
      const exists = await this.storageService.exists(path, 'private');
      if (!exists) throw new BookingPhotoNotUploadedError(path);

      const fileName = path.split('/').pop()!;
      const permanentPath = `tenants/${tenantId}/bookings/${bookingId}/${fileName}`;
      await this.storageService.copy(path, permanentPath, 'private');
      await this.storageService.delete(path, 'private'); // best-effort — log, don't fail the booking op
      promoted.push(permanentPath);
    }
    return promoted;
  }

  private extractTenantId(filePath: string): string | null {
    const match = /^tmp\/([^/]+)\/.+$/.exec(filePath);
    return match?.[1] ?? null;
  }
}
```
(`assertPhotosUploaded` can be deleted outright — every call site is being replaced with `promotePhotos`, there's no remaining caller that only wants validation without promotion.)

### The booking-ID-generation-timing problem (found during review, not in the first draft)

`promotePhotos` needs `bookingId` to build the destination path — trivial for the three "existing booking" use cases, but `request-booking.use-case.ts` and `request-authenticated-booking.use-case.ts` call `photoExistenceService` **before** the `Booking` aggregate exists. Checked `Booking.requestBooking()` directly:

```typescript
// booking.aggregate.ts:245 — id is generated INSIDE the factory, not passed in
const id = uuidv7();
const lines = lineInputs.map((input) => BookingLine.create(id, tenantId, input));
// ...
const booking = new Booking({ id, tenantId, /* ... */ });
```

There's no existing way to know the booking ID before calling this factory, and no post-construction mutator for `beforeServicePhotoUrls` (aggregates in this codebase mutate only through named domain methods, not raw setters — adding one just for this would be a worse violation than the alternative). The correct fix: generate the ID in the **use case**, before promotion, and teach the factory to accept it:

```typescript
// booking.aggregate.ts — RequestBookingInput gains an optional pre-generated id
export interface RequestBookingInput {
  id?: string;   // NEW — when supplied, used instead of generating a fresh uuidv7()
  tenantId: string;
  // ...unchanged...
}

static requestBooking(input: RequestBookingInput): Booking {
  // ...
  const id = input.id ?? uuidv7();   // was: const id = uuidv7();
  // ...unchanged...
}
```

```typescript
// request-booking.use-case.ts — generate id first, promote, then pass both through
const bookingId = uuidv7();
const beforeServicePhotoUrls = await this.photoExistenceService.promotePhotos(
  input.beforeServicePhotoUrls ?? [], tenantId, bookingId,
);
// ...
const booking = Booking.requestBooking({
  id: bookingId,
  // ...everything else unchanged...
  beforeServicePhotoUrls,   // promoted paths, not input.beforeServicePhotoUrls
});
```

This mirrors an existing pattern already in the same aggregate — `BookingLine.create(id, tenantId, input)` already takes an externally-supplied ID — so accepting a pre-generated `id` on the parent factory isn't a new idea in this codebase, just extending it one level up.

Delete-previous-on-replace does not apply to booking attachments — booking photo arrays are append-only in every current use case (no existing flow replaces an already-attached photo), so this concern is hotsite-specific.

---

## Fix — Signed-URL Generation (both contexts)

`GenerateHotsiteImageSignedUrlUseCase` and `GenerateAttachmentSignedUrlUseCase` both change their `filePath` construction to always target the tmp prefix, dropping their current purpose/booking-aware final-path logic entirely (that logic moves to promotion):

```typescript
// generate-hotsite-image-signed-url.use-case.ts
const filePath = `tmp/${dto.tenantId}/${dto.purpose}/${uuidv7()}/${dto.fileName}`;
const { signedUrl, expiresAt } = await this.storageService.generateWriteSignedUrl(
  filePath, dto.contentType, 'private', // was 'public'
);
```

```typescript
// generate-attachment-signed-url.use-case.ts — the bookingId-known/unknown branch collapses to one case
const filePath = `tmp/${input.tenantId}/${uuidv7()}/${input.fileName}`;
const { signedUrl, expiresAt } = await this.storageService.generateWriteSignedUrl(
  filePath, input.contentType, // already defaults private, unchanged
);
```
(The `bookingRepo.findById` existence check in the current `GenerateAttachmentSignedUrlUseCase` — validating a client-supplied `bookingId` exists before generating a booking-scoped path — is no longer needed, since the path is never booking-scoped at upload time anymore.)

---

## Fix — GCS Lifecycle Rule (Terraform)

Add to `storage.tf`'s `media` bucket (`docs/23-INFRASTRUCTURE_SETUP.md`) — hotsite `tmp/` staging also lives here, since promotion source is always the private bucket:

```hcl
resource "google_storage_bucket" "media" {
  # ...existing config unchanged...

  lifecycle_rule {
    action { type = "Delete" }
    condition { age = 365 }   # existing — unrelated long-term retention, unchanged
  }

  # New — staging area for uploads not yet promoted to a permanent path (TD22).
  # 48h gives enough headroom for a slow multi-step form (e.g. booking creation with
  # pickup address + photos) without leaving genuinely-abandoned uploads around long.
  lifecycle_rule {
    action { type = "Delete" }
    condition {
      age             = 2  # GCS lifecycle age is in whole days; 2 days ≈ 48h (see note below)
      matches_prefix  = ["tmp/"]
    }
  }
}
```

**Caveat**: GCS lifecycle `age` is in whole days, not hours — there's no sub-day granularity in the native lifecycle API. If a tighter bound than "1–2 days" is required, that needs an actual scheduled job (Cloud Scheduler + Cloud Function or a NestJS `@Cron` task hitting a new cleanup endpoint) doing the same prefix-scan-and-delete instead of relying on the bucket-native rule. Recommended: start with the native 2-day lifecycle rule (zero new infra, zero new code) and only add a scheduled job if 48h staging proves to be a real cost/hygiene problem in practice.

No lifecycle rule is needed on `hotsite_public` — nothing is ever written there except already-promoted, referenced (or explicitly superseded-and-deleted) objects.

---

## Fix — Frontend

- `SingleImageUploadField.handleRemove()` — the `value.startsWith('tenants/')` guard (gating whether `deleteHotsiteImage` is called) must also match `tmp/` — a freshly-uploaded-but-not-yet-applied image is now `tmp/<tenantId>/...`, not `tenants/<tenantId>/...`. Change to `value.startsWith('tenants/') || value.startsWith('tmp/')`.
- `GalleryImageManager.handleRemove()` — same guard, same fix.
- `PhotoUpload.tsx` / `AfterServicePhotoUpload.tsx` — **recommendation: do not add an explicit delete-on-remove call for these two.** Unlike hotsite, there's no existing delete-attachment backend endpoint, and wiring one just to shave the tail off a 48h TTL window is low ROI relative to the lifecycle rule already closing the gap. Revisit only if the lifecycle rule alone proves insufficient (e.g., cost pressure from very high abandonment rates). This is a judgment call, not a hard constraint — flag for review during implementation rather than deciding unilaterally here.

---

## Affected files

| File | Change |
|---|---|
| `apps/backend/src/shared/ports/storage.service.port.ts` | `copy()` gains `destinationBucket?: 'private' \| 'public'` param |
| `apps/backend/src/shared/infrastructure/gcs-signed-url.adapter.ts` | `copy()` implementation honors the new param |
| `apps/backend/src/shared/infrastructure/gcs-signed-url.adapter.spec.ts` | New tests: private→private copy, private→public copy (default) |
| `apps/backend/src/test/infrastructure/in-memory-storage.service.ts` | `copy()` accepts (and can ignore) the new param |
| `apps/backend/src/contexts/platform/application/use-cases/generate-hotsite-image-signed-url.use-case.ts` | Target `tmp/<tenantId>/<purpose>/<uuid>/<fileName>` in `'private'`, not final path in `'public'` |
| `apps/backend/src/contexts/platform/application/use-cases/update-hotsite-content.use-case.ts` | Replace `verifyImagesExist` with promote-and-validate + delete-previous-on-replace |
| `apps/backend/src/contexts/platform/domain/services/hotsite-image-paths.service.ts` | No change (already collects every field correctly) |
| `apps/backend/src/contexts/booking/application/use-cases/generate-attachment-signed-url.use-case.ts` | Collapse to always target `tmp/<tenantId>/<uuid>/<fileName>`; drop `bookingId`-branch + existence check |
| `apps/backend/src/contexts/booking/application/dtos/generate-attachment-signed-url.dto.ts` | Drop now-unused `bookingId` field |
| `apps/backend/src/contexts/booking/application/services/photo-existence.service.ts` | Replace `assertPhotosUploaded` with `promotePhotos` (copy + delete + return new paths); reuses existing `BookingPhotoNotUploadedError`, no new error class |
| `apps/backend/src/contexts/booking/application/services/photo-existence.service.spec.ts` | Update existing tests for the new method/return shape |
| `apps/backend/src/contexts/booking/domain/booking.aggregate.ts` | `RequestBookingInput` gains optional `id?: string`; `requestBooking()` uses `input.id ?? uuidv7()` |
| `apps/backend/src/contexts/booking/application/use-cases/request-booking.use-case.ts` | Generate `bookingId` before promotion; pass both `id` and promoted `beforeServicePhotoUrls` into `Booking.requestBooking()` |
| `apps/backend/src/contexts/booking/application/use-cases/request-authenticated-booking.use-case.ts` | Same |
| `apps/backend/src/contexts/booking/application/use-cases/submit-booking-info.use-case.ts` | Call `promotePhotos` with the already-known `bookingId`, for response `photoUrls` |
| `apps/backend/src/contexts/booking/application/use-cases/submit-guest-booking-info.use-case.ts` | Same |
| `apps/backend/src/contexts/booking/application/use-cases/complete-booking.use-case.ts` | Same, for `afterServicePhotoUrls` |
| `apps/web/features/platform/components/hotsite/SingleImageUploadField.tsx` | Widen delete-eligibility check to include `tmp/` |
| `apps/web/features/platform/components/hotsite/modules/GalleryImageManager.tsx` | Same |
| `docs/23-INFRASTRUCTURE_SETUP.md` | Add the new `lifecycle_rule` block to the documented `storage.tf` |
| `apps/bff/src/features/uploads/` (whole directory) | Recommend deleting — dead code, see "Third upload surface" note above. Separate small cleanup, not required for this TD's acceptance criteria |

---

## Acceptance Criteria

- [ ] A hotsite image upload lands at `tmp/<tenantId>/<purpose>/<uuid>/<fileName>` in the **private** bucket, not the public one
- [ ] A booking attachment upload lands at `tmp/<tenantId>/<uuid>/<fileName>`, regardless of whether `bookingId` is known at upload time
- [ ] Saving hotsite content (`PATCH /tenants/hotsite`) with a `tmp/`-referenced image promotes it to `tenants/<tenantId>/hotsite/<purpose>/<uuid>/<fileName>` in the **public** bucket and rewrites the stored reference — the object is publicly readable only after this point, not before
- [ ] Saving hotsite content with a field that changed from one already-permanent image to another deletes the *previous* permanent object from the public bucket
- [ ] Saving hotsite content with an untouched field (still pointing at an old permanent image) does not delete or re-promote anything for that field
- [ ] A cross-tenant tmp path (tenant A's caller supplying tenant B's `tmp/<tenantB>/...` path) is rejected, not promoted
- [ ] Creating a booking (guest and authenticated) with `beforeServicePhotoUrls` pointing at `tmp/` paths promotes them to `tenants/<tenantId>/bookings/<bookingId>/...`, still in the private bucket — using a `bookingId` generated *before* the aggregate is constructed, not after
- [ ] `Booking.requestBooking({ id: 'some-uuid', ... })` uses the supplied `id` instead of generating its own; omitting `id` still generates one (backward compatible — existing callers that don't pass `id` keep working)
- [ ] Completing a booking with `afterServicePhotoUrls` pointing at `tmp/` paths promotes them the same way
- [ ] Submitting requested info (guest and customer) with response photos pointing at `tmp/` paths promotes them the same way
- [ ] `IStorageService.copy()`'s existing callers (`FeatureBookingPhotoUseCase`) are unaffected — still defaults to public destination
- [ ] The `media` bucket's Terraform config has a `tmp/`-scoped lifecycle rule in addition to the existing 365-day rule; `hotsite_public` still has none
- [ ] `SingleImageUploadField`/`GalleryImageManager`'s "Remove" button correctly deletes both `tenants/`- and `tmp/`-prefixed values, and correctly no-ops (de-reference only) for already-resolved public URLs
- [ ] `PhotoExistenceService.promotePhotos()` has unit tests covering: successful promotion, cross-tenant rejection (reusing `BookingPhotoNotUploadedError`), and non-existent tmp path rejection
- [ ] All five booking use cases' existing specs are updated for the new `promotePhotos` call and pass
- [ ] `tsc --noEmit` clean across backend + web; existing `FeatureBookingPhotoUseCase`/`DeleteHotsiteImageUseCase` specs still pass unmodified
