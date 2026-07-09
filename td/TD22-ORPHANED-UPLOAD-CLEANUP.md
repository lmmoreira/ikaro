# TD22 — Orphaned Upload Cleanup: Unified `tmp/` Staging + Promote-on-Submit

## Status
- **State**: Resolved (2026-07-09) — merged via PR #103
- **Type**: Architecture / Storage cost & hygiene
- **Priority**: Medium (no security exposure, but unbounded storage growth with zero cleanup — cost and eventual GCS listing/perf drag)
- **Contexts affected**: `platform` (hotsite images), `booking` (attachment photos) — backend + BFF + web
- **Discovered**: 2026-07-07, during M13-S36 (Hotsite Layout tab) discovery, while wiring image deletion for the new Gallery/config-panel upload flows
- **Revised**: 2026-07-08, during `/story-discovery` — corrected promotion ordering (`scheduleAfterCommit`), added BFF/`docs/14`/`M17-S14` scope, committed to the private signed-read-URL fix for `tmp/` preview

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

> **Ordering rule (found during `/story-discovery`): validate before the transaction, mutate storage only after it commits.** The naive approach — call `copy()`/`delete()` inline, then `config.updateContent()`, then `txManager.run(save)` — has a real failure window: `config.updateContent()` calls `validateBranding()`, which can still throw on an unrelated field (bad hex color, invalid enum) *after* storage has already been mutated. If that happens, the DB save never runs, but the old permanent image is already deleted and the new tmp source is already gone — the persisted config now points at a deleted object, unrecoverable via retry (the tmp original is gone too). Split promotion into two phases:
> - **`prepareImagePromotion`** (before `txManager.run()`, no storage mutation): validate every path's tenant ownership + existence, and *compute* (don't perform) the new permanent path for each `tmp/` entry — a pure string transformation once `purpose` is encoded into the tmp path (see open question below), so this needs no GCS round-trip beyond the `exists()` checks. Returns the rewritten branding/layout (used for `config.updateContent()`) plus a list of pending operations (`promotions: {from, to}[]`, `deletions: string[]`).
> - **`executeImagePromotion`** (registered via `scheduleAfterCommit()` — `apps/backend/src/shared/infrastructure/transaction-context.ts`, the same mechanism `CachingTenantRepository` already uses for post-commit cache invalidation): performs the actual `copy()`/`delete()` calls, best-effort (log and continue per-file — the DB reference is already correct either way).
> - Accepted trade-off: a small window exists between the DB commit and the async copy actually landing, where a `GET` could resolve a public URL for an object not yet physically present. This mirrors the trade-off this codebase already accepts for cache invalidation; not a new risk class.

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

Replace with:
1. Collect `oldPaths` from `config.branding`/`config.layout` (**before** merging in `dto`).
2. Merge branding/layout as today.
3. `prepareImagePromotion(branding, layout, tenantId)` — pure validation + path computation, no storage mutation. For each path collected from the **merged** branding/layout:
   - If it matches `tmp/<tenantId>/...` (tenant-checked via `extractTenantIdFromTmpPath`, else `HotsiteImageNotUploadedError`) → verify it `exists(path, 'private')`, compute `newPermanentPath` reusing the *existing* `tenants/<tenantId>/hotsite/<purpose>/<uuid>/<fileName>` convention (purpose isn't known at this layer today — see open question below), rewrite the in-memory branding/layout field to `newPermanentPath`, and push `{ from: path, to: newPermanentPath }` onto `promotions`.
   - If it matches `tenants/${tenantId}/...` (already permanent, untouched field) → validate `exists(path, 'public')` as today.
   - Anything else → `HotsiteImageNotUploadedError`.
4. Compute `newPaths` from the now-rewritten branding/layout (post-promotion).
5. For every path in `oldPaths` not present in `newPaths` **and** matching `tenants/${tenantId}/...` (i.e. it was a real, permanent, promoted object — not a tmp one, tmp cleanup is the lifecycle rule's job) → push onto `deletions`.
6. `config.updateContent(branding, layout, seo)`.
7. `await this.txManager.run(async () => { await this.hotsiteConfigRepo.save(config); await scheduleAfterCommit(() => this.executeImagePromotion(promotions, deletions)); });` — `executeImagePromotion` performs, for each entry: `copy(from, to, 'public')` + `delete(from, 'private')` for `promotions`, and `delete(path, 'public')` for `deletions`. Each call wrapped in its own try/catch — best-effort, log and continue, mirroring `SingleImageUploadField`'s existing best-effort delete pattern on the frontend. The DB reference is already correct in either case; a failed delete just leaves an orphan for the lifecycle rule to catch, and a failed copy leaves the new path 404ing until manually reconciled (rare — the source was just existence-checked moments earlier in the same request).

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

> **Same ordering rule as hotsite promotion applies here** — `assertPhotosUploaded`'s replacement must not perform the actual `copy()`/`delete()` before the booking is safely saved. `Booking.requestBooking()`/`booking.submitInformation()`/`booking.complete()` can all still throw domain validation errors (`BookingLineRequiredError`, `PickupAddressRequiredError`, `Email`/`PhoneNumber` VOs, etc.) *after* photo promotion would have already run in the naive ordering — and unlike hotsite, a failure here wouldn't just break a display, it would orphan a permanent photo under a `bookingId` that was never persisted, which is exactly the failure mode this TD exists to close. Split into a `prepare`/`execute` pair, same shape as hotsite's:

```typescript
// photo-existence.service.ts — extended
import { extractTenantIdFromTmpPath } from '../../../../shared/utils/extract-tenant-id-from-tmp-path';

@Injectable()
export class PhotoExistenceService {
  constructor(@Inject(STORAGE_SERVICE) private readonly storageService: IStorageService) {}

  /** Pure validation + path computation — call before the aggregate is constructed/saved. No storage mutation. */
  async preparePhotoPromotion(
    tmpPaths: string[],
    tenantId: string,
    bookingId: string,
  ): Promise<{ permanentPaths: string[]; operations: Array<{ from: string; to: string }> }> {
    const permanentPaths: string[] = [];
    const operations: Array<{ from: string; to: string }> = [];
    for (const path of tmpPaths) {
      if (extractTenantIdFromTmpPath(path) !== tenantId) throw new BookingPhotoNotUploadedError(path);
      const exists = await this.storageService.exists(path, 'private');
      if (!exists) throw new BookingPhotoNotUploadedError(path);

      const fileName = path.split('/').pop()!;
      const permanentPath = `tenants/${tenantId}/bookings/${bookingId}/${fileName}`;
      operations.push({ from: path, to: permanentPath });
      permanentPaths.push(permanentPath);
    }
    return { permanentPaths, operations };
  }

  /** Actual copy+delete — call via scheduleAfterCommit(), only after the booking row is saved. Best-effort per file. */
  async executePhotoPromotion(operations: Array<{ from: string; to: string }>): Promise<void> {
    for (const { from, to } of operations) {
      try {
        await this.storageService.copy(from, to, 'private');
        await this.storageService.delete(from, 'private');
      } catch (err) {
        // log and continue — the aggregate's photo fields already point at `to`; a failed copy
        // just means that path 404s until manually reconciled, not a broken booking record
      }
    }
  }
}
```
(`assertPhotosUploaded` can be deleted outright — every call site is being replaced. `extractTenantIdFromTmpPath` lives in a new shared util, `apps/backend/src/shared/utils/extract-tenant-id-from-tmp-path.ts`, sibling to the existing `extract-tenant-id-from-path.ts` — not a private method here, since `UpdateHotsiteContentUseCase` needs the identical check.)

Each of the five call sites now looks like (existing-booking example, `submit-booking-info.use-case.ts`):
```typescript
const { permanentPaths, operations } = await this.photoExistenceService.preparePhotoPromotion(
  input.photoUrls ?? [], tenantId, input.bookingId,
);
booking.submitInformation(booking.contactEmail.address, { notes: input.response }, correlationId, permanentPaths, customerId);
await this.txManager.run(async () => {
  await this.bookingRepo.save(booking);
  await scheduleAfterCommit(() => this.photoExistenceService.executePhotoPromotion(operations));
});
```
`request-booking.use-case.ts` / `request-authenticated-booking.use-case.ts` follow the same shape, with `bookingId` being the freshly-generated `id` (see below) computed before `preparePhotoPromotion` runs.

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
// request-booking.use-case.ts — generate id first, prepare promotion, then pass both through
const bookingId = uuidv7();
const { permanentPaths: beforeServicePhotoUrls, operations } =
  await this.photoExistenceService.preparePhotoPromotion(
    input.beforeServicePhotoUrls ?? [], tenantId, bookingId,
  );
// ...
const booking = Booking.requestBooking({
  id: bookingId,
  // ...everything else unchanged...
  beforeServicePhotoUrls,   // already-rewritten permanent paths, not input.beforeServicePhotoUrls
});

await this.txManager.run(async () => {
  await this.bookingRepo.save(booking);
  await scheduleAfterCommit(() => this.photoExistenceService.executePhotoPromotion(operations));
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

**BFF mirror change (found during `/story-discovery`):** `apps/bff/src/features/booking/bookings.controller.ts`'s `AttachmentSignedUrlBodySchema` (line 180) duplicates `bookingId: z.uuid().optional()` and forwards it to the backend in 2 of its 4 tenant-resolution scenarios (`user` branch at line 249, guest-token branch at line 275 via `tokenPayload.bookingId`). Once the backend DTO drops `bookingId`, this becomes dead pass-through — remove the field from the Zod schema and both forwarding sites in the same PR. The 4-scenario branching itself (JWT user / guest token / anonymous `tenantSlug` / staff) is about **tenant resolution**, not `bookingId`, and is unaffected — only the now-pointless `bookingId` plumbing goes.

---

## Fix — GCS Lifecycle Rule (deferred to `M17-CLOUD-DEPLOY`, not this TD)

**Found during `/story-discovery` (2026-07-08): no Terraform exists in this repo yet** — zero `.tf` files anywhere. `docs/23-INFRASTRUCTURE_SETUP.md`'s `storage.tf` documents the old, pre-`M17-CLOUD-DEPLOY` infra design and is explicitly flagged as partially superseded (`M17-S48 — Supersession banners on legacy infra docs`, `plan/M17-CLOUD-DEPLOY.md`: *"On any conflict... M17 wins"*). Its bucket names (`media`/`hotsite_public`, `ikaro-media-*`/`ikaro-hotsite-public-*`) don't even match the real plan: **`M17-S14` — GCS storage module** (`plan/M17-CLOUD-DEPLOY.md`) creates `ikaro-uploads-{env}` (private, matches `GCS_BUCKET_NAME`) and `ikaro-public-{env}` (public, matches `GCS_PUBLIC_BUCKET_NAME`) — and that module doesn't exist as code yet either.

**This TD does not author any Terraform.** The `tmp/`-prefixed lifecycle rule requirement (`matches_prefix = ["tmp/"]`, `age = 2` days, `Delete`) has instead been added as a bullet to `M17-S14`'s story in `plan/M17-CLOUD-DEPLOY.md`, alongside that story's own 7-day incomplete-multipart-upload rule. `M17-S45 — Photo lifecycle & retention` separately adds `tenants/`-prefixed retention/tiering rules on the same bucket — all three `lifecycle_rule` blocks are additive and non-conflicting.

**Caveat (unchanged)**: GCS lifecycle `age` is in whole days, not hours — there's no sub-day granularity in the native lifecycle API. If a tighter bound than "1–2 days" is required, that needs an actual scheduled job (Cloud Scheduler + Cloud Function or a NestJS `@Cron` task hitting a new cleanup endpoint) doing the same prefix-scan-and-delete instead of relying on the bucket-native rule. Recommended: start with the native 2-day lifecycle rule (zero new infra, zero new code) and only add a scheduled job if 48h staging proves to be a real cost/hygiene problem in practice.

No lifecycle rule will be needed on the public bucket — nothing is ever written there except already-promoted, referenced (or explicitly superseded-and-deleted) objects.

**Until `M17-S14` ships, there is no live GCS bucket to accumulate orphaned `tmp/` cost.** This TD's app-level changes (tmp staging + promote-on-submit) are still worth shipping now — they unconditionally close the "explicit remove doesn't delete" and "superseded upload" leaks — but the "abandoned upload ages out automatically" guarantee only takes effect once `M17-S14` is implemented.

---

## Fix — Frontend

- `SingleImageUploadField.handleRemove()` — the `value.startsWith('tenants/')` guard (gating whether `deleteHotsiteImage` is called) must also match `tmp/` — a freshly-uploaded-but-not-yet-applied image is now `tmp/<tenantId>/...`, not `tenants/<tenantId>/...`. Change to `value.startsWith('tenants/') || value.startsWith('tmp/')`.
- `GalleryImageManager.handleRemove()` — same guard, same fix.
- `PhotoUpload.tsx` / `AfterServicePhotoUpload.tsx` — **recommendation: do not add an explicit delete-on-remove call for these two.** Unlike hotsite, there's no existing delete-attachment backend endpoint, and wiring one just to shave the tail off a 48h TTL window is low ROI relative to the lifecycle rule already closing the gap. Revisit only if the lifecycle rule alone proves insufficient (e.g., cost pressure from very high abandonment rates). This is a judgment call, not a hard constraint — flag for review during implementation rather than deciding unilaterally here.
- **`CustomerPhotoUpload.tsx`** (`apps/web/features/customer/components/my-account/CustomerPhotoUpload.tsx`, used by `InfoSubmitForm.tsx` for the customer-response-photos flow into `submit-booking-info`) — found during `/story-discovery`: a third booking-photo upload component with the identical no-delete-on-remove pattern as `PhotoUpload.tsx`/`AfterServicePhotoUpload.tsx`, calling the same `createCustomerAttachmentSignedUrl`/backend signed-url endpoint. Same recommendation applies (no delete-on-remove call, rely on the lifecycle rule) — named explicitly here so it isn't rediscovered mid-implementation.

### tmp/ image preview (private signed-read-URL — decided during `/story-discovery`)

`SingleImageUploadField`/`GalleryImageManager`'s `displaySrc`/`displayUrl()` and `HotsitePreview`'s `resolveDraftImageUrls()` (`apps/web/features/platform/hotsite/resolve-hotsite-image-url.ts`) resolve a raw, non-absolute value by prefixing `NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL` (the **public** bucket base) — correct today, since an unsaved upload's raw path already lives in the public bucket. Once uploads target `tmp/` in the **private** bucket instead, that same resolution 404s for anything not yet promoted (i.e., previewed/reopened before the first save, when the local blob-URL preview has been lost to a remount).

**Decision: add a private signed-read-URL endpoint**, mirroring how `BookingPhotoPicker` already handles private booking photos (fresh signed read at display time, nothing stored). `IStorageService.generateReadSignedUrl()` already exists and already supports `'private'` — no new port method needed.

- **Backend:** `GenerateHotsiteImageReadSignedUrlUseCase` (new) — input `{ filePath, tenantId }`; validates `extractTenantIdFromTmpPath(filePath) === tenantId` (else `HotsiteImageNotUploadedError`), then `generateReadSignedUrl(filePath, 'private')`. Only ever called for `tmp/`-prefixed values — already-public `tenants/...` paths keep resolving via the existing pure-string `resolveHotsiteImageDisplayUrl`.
- **BFF:** new authenticated endpoint on `hotsite-admin.controller.ts`, e.g. `POST /v1/tenants/hotsite/images/read-signed-url` (same role guard as the existing hotsite-admin endpoints).
- **Frontend:** new fetcher `generateHotsiteImageReadSignedUrl(filePath)` alongside `generateHotsiteImageSignedUrl`/`deleteHotsiteImage` in `apps/web/features/platform/tenant-settings`. `SingleImageUploadField`, `GalleryImageManager`, and `HotsitePreview` all need to become async-aware for `tmp/`-prefixed values with no local blob preview: on mount/remount, if `value.startsWith('tmp/')` and there's no `previewUrl`, call the new fetcher and use the returned `signedUrl` as `displaySrc` (with a loading state), instead of the current pure `resolveHotsiteImageDisplayUrl` string template. Already-public `tenants/...` values keep the existing synchronous path unchanged.

---

## Affected files

| File | Change |
|---|---|
| `apps/backend/src/shared/ports/storage.service.port.ts` | `copy()` gains `destinationBucket?: 'private' \| 'public'` param |
| `apps/backend/src/shared/infrastructure/gcs-signed-url.adapter.ts` | `copy()` implementation honors the new param |
| `apps/backend/src/shared/infrastructure/gcs-signed-url.adapter.spec.ts` | New tests: private→private copy, private→public copy (default) |
| `apps/backend/src/test/infrastructure/in-memory-storage.service.ts` | `copy()` accepts (and can ignore) the new param |
| `apps/backend/src/contexts/platform/application/use-cases/generate-hotsite-image-signed-url.use-case.ts` | Target `tmp/<tenantId>/<purpose>/<uuid>/<fileName>` in `'private'`, not final path in `'public'` |
| `apps/backend/src/contexts/platform/application/use-cases/update-hotsite-content.use-case.ts` | Replace `verifyImagesExist` with `prepareImagePromotion` (pre-commit, pure) + `executeImagePromotion` (post-commit, via `scheduleAfterCommit`) |
| `apps/backend/src/contexts/platform/domain/services/hotsite-image-paths.service.ts` | No change (already collects every field correctly) |
| `apps/backend/src/contexts/booking/application/use-cases/generate-attachment-signed-url.use-case.ts` | Collapse to always target `tmp/<tenantId>/<uuid>/<fileName>`; drop `bookingId`-branch + existence check |
| `apps/backend/src/contexts/booking/application/dtos/generate-attachment-signed-url.dto.ts` | Drop now-unused `bookingId` field |
| `apps/bff/src/features/booking/bookings.controller.ts` | Drop `bookingId` from `AttachmentSignedUrlBodySchema` and its 2 forwarding sites (tenant-resolution branching itself is unaffected) |
| `apps/backend/src/shared/utils/extract-tenant-id-from-tmp-path.ts` (new) | Shared `tmp/<tenantId>/...` extractor, sibling to the existing `extract-tenant-id-from-path.ts` — used by both `PhotoExistenceService` and `UpdateHotsiteContentUseCase` |
| `apps/backend/src/shared/utils/extract-tenant-id-from-tmp-path.spec.ts` (new) | Unit tests for the new util |
| `apps/backend/src/contexts/booking/application/services/photo-existence.service.ts` | Replace `assertPhotosUploaded` with `preparePhotoPromotion` (validate + compute paths, pure) and `executePhotoPromotion` (copy + delete, called via `scheduleAfterCommit`); reuses existing `BookingPhotoNotUploadedError`, no new error class |
| `apps/backend/src/contexts/booking/application/services/photo-existence.service.spec.ts` | Update existing tests for the new method pair |
| `apps/backend/src/contexts/booking/domain/booking.aggregate.ts` | `RequestBookingInput` gains optional `id?: string`; `requestBooking()` uses `input.id ?? uuidv7()` |
| `apps/backend/src/contexts/booking/application/use-cases/request-booking.use-case.ts` | Generate `bookingId` before `preparePhotoPromotion`; pass both `id` and rewritten `beforeServicePhotoUrls` into `Booking.requestBooking()`; register `executePhotoPromotion` via `scheduleAfterCommit` inside `txManager.run()` |
| `apps/backend/src/contexts/booking/application/use-cases/request-authenticated-booking.use-case.ts` | Same |
| `apps/backend/src/contexts/booking/application/use-cases/submit-booking-info.use-case.ts` | Same pattern, `bookingId` already known, for response `photoUrls` |
| `apps/backend/src/contexts/booking/application/use-cases/submit-guest-booking-info.use-case.ts` | Same |
| `apps/backend/src/contexts/booking/application/use-cases/complete-booking.use-case.ts` | Same, for `afterServicePhotoUrls` |
| `apps/backend/src/contexts/platform/application/dtos/generate-hotsite-image-read-signed-url.dto.ts` (new) | `{ filePath }` — tenant-scoped `tmp/` read-signed-URL request |
| `apps/backend/src/contexts/platform/application/use-cases/generate-hotsite-image-read-signed-url.use-case.ts` (new) | Validates `extractTenantIdFromTmpPath`, calls `generateReadSignedUrl(filePath, 'private')` |
| `apps/backend/src/contexts/platform/application/use-cases/generate-hotsite-image-read-signed-url.use-case.spec.ts` (new) | Unit tests: success, cross-tenant rejection |
| `apps/bff/src/features/platform/hotsite-admin.controller.ts` | New `POST /v1/tenants/hotsite/images/read-signed-url` endpoint |
| `apps/web/features/platform/tenant-settings/*` | New `generateHotsiteImageReadSignedUrl(filePath)` fetcher |
| `apps/web/features/platform/components/hotsite/SingleImageUploadField.tsx` | Widen delete-eligibility check to include `tmp/`; resolve `tmp/`-prefixed `displaySrc` via the new read-signed-URL fetcher when no local blob preview exists |
| `apps/web/features/platform/components/hotsite/modules/GalleryImageManager.tsx` | Same (delete guard + async `tmp/` resolution) |
| `apps/web/features/platform/components/hotsite/HotsitePreview.tsx` | `resolveDraftImageUrls()` becomes async-aware for `tmp/`-prefixed values |
| `plan/M17-CLOUD-DEPLOY.md` (`M17-S14`) | Add a bullet: `ikaro-uploads-{env}` also needs a `tmp/`-prefixed lifecycle rule (age 2 days, Delete) sourced from this TD, in addition to S14's own 7-day incomplete-multipart-upload rule |
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
- [ ] Hotsite and booking promotion both perform the actual `copy()`/`delete()` calls via `scheduleAfterCommit()`, registered from inside `txManager.run()` — not before the aggregate/`config.updateContent()` validation that can still throw
- [ ] `M17-S14`'s story in `plan/M17-CLOUD-DEPLOY.md` documents the additional `tmp/`-prefixed lifecycle rule requirement sourced from this TD (no Terraform to write in this TD's own PR — none exists in the repo yet)
- [ ] `SingleImageUploadField`/`GalleryImageManager`'s "Remove" button correctly deletes both `tenants/`- and `tmp/`-prefixed values, and correctly no-ops (de-reference only) for already-resolved public URLs
- [ ] A not-yet-promoted `tmp/`-prefixed hotsite image resolves to a working preview (via the new private read-signed-URL endpoint) after a component remount, not a 404
- [ ] `GenerateHotsiteImageReadSignedUrlUseCase` has unit tests covering: success and cross-tenant rejection
- [ ] `PhotoExistenceService.preparePhotoPromotion()`/`executePhotoPromotion()` have unit tests covering: successful promotion, cross-tenant rejection (reusing `BookingPhotoNotUploadedError`), and non-existent tmp path rejection
- [ ] All five booking use cases' existing specs are updated for the new `preparePhotoPromotion`/`executePhotoPromotion` calls and pass
- [ ] `apps/bff/src/features/booking/bookings.controller.ts`'s `bookingId` field and both forwarding sites are removed; its existing tenant-resolution-scenario tests still pass
- [ ] `docs/14-API_CONTRACTS.md`'s `filePath` examples for both signed-url endpoints (and the booking-attachment flow walkthrough) are updated to show `tmp/...` at generation time and the final permanent path only after promotion
- [ ] `tsc --noEmit` clean across backend + web; existing `FeatureBookingPhotoUseCase`/`DeleteHotsiteImageUseCase` specs still pass unmodified
