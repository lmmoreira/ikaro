# M18 — Booking Improvements: Implementation Details (Developer Guide)

This guide is for a human learning how this milestone works and why it was built that way. It explains the ideas behind each story with code taken from this repository. The compact agent-facing reference is `M18-BOOKING-IMPROVEMENTS_IMPLEMENTATION_DETAILS_IA.md`; story-by-story history, including every review round, is in `M18-BOOKING-IMPROVEMENTS.md`.

M18 is a set of eleven independent improvements. They share two themes: the **public booking page and the hotsite editor** (S01–S08), and **small operational fixes** that came from real use (S09–S11).

| Story | One-line summary |
|---|---|
| S01 | Date picker can be a carousel or a calendar, and both respect the tenant's booking-advance limit |
| S02 | A "Manifesto" tab to edit the hotsite JSON directly |
| S03 | A separate social-share image, automatic cropping, and the logo shown on the public page |
| S04 | Hero banner no longer crops badly on phones; a focal point; a minimum upload size |
| S05 | Content position for Hero and Booking CTA banners |
| S06 | Gallery "mosaic" layout that actually looks like a mosaic |
| S07 | Gallery "Destaque" layout: one large photo and four small ones |
| S08 | Editor usability: Preview inside a module, a discard warning, a "visit site" link |
| S09 | Emails are sent from the platform address, replies go to the tenant |
| S10 | The schedule shows who is held after a booking, and why |
| S11 | The week header names both months when a period crosses a month |

---

## 1. One field, three places: how a hotsite option is added

Almost every story from S01 to S07 adds an option to a hotsite module (`datePickerType`, `backgroundImagePosition`, `contentPositionX`, `featuredPosition`, and so on). Each one is added in **three independent places**:

1. the backend aggregate (`hotsite-config.aggregate.ts`), which defines its own interface,
2. the shared types package (`packages/types/src/hotsite.ts`), which the BFF and web read,
3. the web zod schema (`apps/web/features/platform/hotsite/module-schemas.ts`), which validates the editor form.

Why three copies and not one? The backend domain does not import `@ikaro/types` (domain layers have no framework or package dependencies), and the web app is not allowed to import `@ikaro/validation`. Each layer therefore describes the same shape in its own terms. The cost is that a missing copy is easy to forget, so each of these stories lists all three edits as an acceptance criterion.

Two things made these stories cheap:

- **No migration.** A module's `data` lives in a `jsonb` column. A new key is just a new key; an old row that lacks it is a valid state that the code must render correctly.
- **No BFF change.** At the BFF layer `HotsiteModuleResponse.data` is an opaque `Record<string, unknown>`, so new keys pass through.

A rule worth remembering from S03/S04 reviews: when a new field is "unset", it must render **exactly as before**. That is why `contentPositionX/Y` default to `'center'`: it is a true no-op against the old hard-coded alignment, with no per-variant special cases.

## 2. A validation rule without an if/else chain (S01)

Before M18, the aggregate only checked that a module's `type` was one of the known types; it never looked inside `data`. S01 needed the first real data rule: the number of carousel days must not exceed the tenant's `maxBookingAdvanceDays`. Rather than adding an `if (module.type === 'BOOKING_CTA')` to a loop, it introduced a dispatch map. This is the real code:

```ts
const MODULE_DATA_VALIDATORS: Partial<Record<HotsiteModuleType, ModuleDataValidator>> = {
  BOOKING_CTA: (data, ctx) => {
    const { carouselDays, datePickerType } = data as BookingCtaModuleData;
    // A stale carouselDays value retained from a prior carousel configuration must not block
    // saving an unrelated field once the picker has been switched to calendar — carouselDays is
    // inert in that mode, on both this validator's own terms and the web page's rendering logic.
    const isCarouselMode = (datePickerType ?? 'carousel') === 'carousel';
    if (isCarouselMode && carouselDays !== undefined && carouselDays > ctx.maxBookingAdvanceDays) {
      throw new HotsiteCarouselDaysExceedsMaxAdvanceError(carouselDays, ctx.maxBookingAdvanceDays);
    }
  },
};
```

and the loop that uses it:

```ts
MODULE_DATA_VALIDATORS[module.type]?.(module.data, ctx);
```

What to learn here:

- The map is `Partial`: only modules with a real business rule get an entry. Adding a rule for another module is one new key, not a change to the loop.
- The rule needs a value from another aggregate (the tenant's setting). The use case therefore reads the tenant **inside the transaction** with a locking read (`findByIdForUpdate`), so a concurrent settings change cannot slip in between the check and the save, and passes it in as `ctx`.
- Reviewers asked several times to validate the other new enum fields (`backgroundImagePosition`, `contentPositionX`, and so on) the same way. These were declined: none of them has a business rule, and validating only the newest one would be an inconsistent special case. If it is wanted, it should be one uniform pass over every enum field.

## 3. Optimistic locking for the hotsite config (S03)

A code review of S03 found that saving the hotsite config had no protection against two requests saving at the same time: the last writer silently won, and could even delete an image that the other request had just started to reference. The fix copied the pattern already used for `Booking`:

- a `version` column (migration `1748400000009-AddVersionToHotsiteConfigs`) with a `@VersionColumn` on the entity,
- `HotsiteConfig.version` and `markPersisted()` on the aggregate,
- a repository save that is an insert for a new row, and otherwise an `UPDATE ... WHERE id AND tenant_id AND version`, throwing `HotsiteConfigConcurrentModificationError` (HTTP 409) when it did not update exactly one row.

Note that `tenant_id` is in the `WHERE`. Every query in this codebase is tenant-scoped, including the guarded update.

## 4. The image pipeline: crop, minimum size, and failing closed (S03, S04, S06)

Uploads go through `compressImage()` in the browser before they reach storage. The backend only signs the upload; it never re-checks pixels. So the browser step is the only place a wrong-shaped image can be stopped.

- **Center-crop to a ratio.** The branding logo is cropped to 1:1 and the social-share image to 1200:630. Both crops are automatic. No cropper library was added, and a wrong-shaped image is not rejected; it is cropped.
- **Minimum height.** Hero and Booking CTA images are rejected if their stored height would be under 450 px. The check uses the height **after** compression, not before. The compressor caps the longer side at 1600 px, so for a wide banner the stored height converges to about `1600 / aspectRatio` whatever the original size was. A check on the raw height would have guarded nothing.
- **Fail closed.** A first version silently uploaded the original file whenever the browser could not decode it. Review pointed out that this defeats the purpose. `hasHardRequirement(targetAspectRatio, minHeight)` now makes every failure path throw as soon as either requirement is set; the upload field already turns a thrown error into the standard upload-error message.
- **Dimensions for the gallery.** `compressImageWithDimensions()` returns the stored width and height so the masonry layout can size tiles. A review found it decoded the same file twice; the decode is now shared.

## 5. Sizing with `vw`, not `vh` (S04, S05)

The original Hero used `min-h-screen`, which on a phone forces the box to the full screen height. A wide banner scaled to cover that tall box shows only a thin slice of itself. The fix replaces height-based units with width-based ones.

The first fix only repaired the mobile breakpoint. Manual testing then showed the desktop rule (`60vh`) had the same flaw, just less severe: `vh` follows the browser **window height**, so narrowing the window made the box more and more portrait-shaped. Everything became `vw`-based. A final review found one more `vh` in the left-aligned variant's outer section.

A detail that is easy to miss: the centered variant uses `min-h-[42.86vw]` (a **floor**) and not a literal `aspect-[21/9]`. The title and button sit on top of the image inside the same box, and a literal `aspect-ratio` computes its height from the ratio only, so it would clip the text on a short screen. A `min-height` grows to fit the text. The left-aligned variant's image panel has no text on top of it, so it can use `aspect-[21/9]` directly.

An accepted limitation is recorded in S04: with a single focal point (`left`, `center`, `right`), a banner that has important content at both left and right edges cannot keep both in view on a phone. Solving that would need a second, separately cropped mobile image, which was rejected because small-business owners upload one photo.

## 6. Content position: a stage between the section and the text (S05)

Two independent fields, `contentPositionX` (left, center, right) and `contentPositionY` (top, center, bottom), replaced the idea of one nine-value setting. Two small pill selects reuse an existing component, and the model matches how `variant` and `rightPanel` are already separate fields.

Two bugs found after the first push taught the structure:

1. Anchoring left/right directly to the `<section>` pushed text almost to the browser edge on wide screens, unlike every other hotsite section, which sits inside a `max-w-7xl` container. The fix inserts a **stage** element between the section and the text. The helper that builds the three class strings is shared by both modules:

```ts
export function buildContentStageClasses(
  contentPositionX: ContentPositionX | undefined,
  contentPositionY: ContentPositionY | undefined,
  sectionBaseClasses: string,
  wrapperMaxWidthClasses: string,
): ContentStageClasses {
  const justifyClass = contentJustifyClass(contentPositionX);
  const itemsClass = contentItemsClass(contentPositionY);
  const textAlignClass = contentTextAlignClass(contentPositionX);

  return {
    justifyClass,
    sectionClassName: `${sectionBaseClasses} ${itemsClass}`,
    stageClassName: `relative z-10 flex w-full max-w-7xl mx-auto ${justifyClass}`,
    wrapperClassName: `${wrapperMaxWidthClasses} ${textAlignClass}`,
  };
}
```

2. In the left-aligned variant, vertical position did nothing for realistic content. The section's minimum height is a floor, so for tall content the section is exactly as tall as its content and `align-items` has nothing to distribute. The class must go on the **inner grid row**, where the text column and the image column actually differ in height. In `HeroModule.tsx` that is the `itemsClass` placed on the `grid ...` element.

The default case stays pixel-identical to before: centering a wrapper inside a centered stage lands at the same midpoint as the old single `mx-auto`.

## 7. Gallery layouts (S06, S07)

**Mosaic.** The old "Mosaico" looked like the plain grid because every tile was forced to a 4:3 box. Removing that clamp, and recording each photo's real width and height when it is uploaded or picked, lets a tile take its own ratio. The first container used CSS `columns`, which packs vertically and has no notion of a row, so it left lopsided gaps for small photo counts (for example 3 photos). It was replaced by `flex flex-wrap justify-center`, where a short last row is centered. Every tile uses one fixed basis class, 2 per row on mobile and 3 on desktop, regardless of count. The honest tradeoff, accepted by the owner: rows cannot tuck a short photo under a tall one the way a true Pinterest layout can. Writing a JavaScript packing component was considered and rejected as too much machinery for 5–20 photos.

**Grid crop.** The grid box changed from `aspect-[4/3]` to `aspect-square`, because 4:3 crops a portrait photo about 44% but a landscape photo about 25%. Square is the midpoint that treats both the same; it does not remove cropping, and a panoramic photo now crops more. The lightbox remains the way to see an uncropped photo.

**Destaque.** The large photo is simply the first image in the array, not a flag, so a tenant changes it by re-adding photos in the order they want. The layout needs at least five photos (extras are ignored). If a saved Destaque gallery drops below five, it **renders** as a grid but the stored value is not touched, so adding a fifth photo restores the featured look without choosing it again. The grid is re-templated per breakpoint with `grid-template-areas` in `globals.css`, so the same five elements are rearranged without duplicating markup. The sizing story is instructive: a container-level `aspect-ratio` derived from the `2fr/1fr/1fr` columns looks exact but is off by one `gap`, because the large tile crosses two column gaps horizontally and only one row gap vertically. The final version gives every tile `aspect-ratio: 1` and uses four equal columns, which is exact at any width.

The featured branch is still wrapped by `GalleryGrid` (the component that owns "Ver mais" and the lightbox), with `maxVisible` and `totalImages` both set to 5 so "Ver mais" never shows but the lightbox keeps working:

```tsx
<GalleryGrid maxVisible={5} totalImages={5}>
```

## 8. Editor state: two classic React traps (S08)

**Optional parameter plus event handler.** S08 gave `handlePublish` an optional override so that Publish from inside a module preview submits exactly what is on screen:

```ts
const handlePublish = (
  contentOverride?: HotsiteAdminContentResponse,
  leadFormOverride?: LeadFormConfigDraft,
): Promise<void> =>
  executeHotsitePublish({
    content: contentOverride ?? draft,
    ...
```

(The second parameter was added later by the lead-form module.) The trap: a handler such as `onClick={handlePublish}` is called with the click event as its **first argument**. With a zero-argument function that was harmless; with an optional first parameter the event object silently becomes `contentOverride`. Every existing call therefore became a zero-argument wrapper, and you can see the pattern in the editor today:

```tsx
<HotsitePreview draft={draft} onPublish={() => handlePublish()} isPublishing={isPublishing} />
```

**Stale closure.** The topbar back arrow is wired in an effect that re-runs only when the screen changes, not on every keystroke. A click handler created at that moment would close over old data and compare the wrong "unsaved changes". The fix is a ref that always holds the latest function, refreshed with `useLayoutEffect`. This is the real code, including why it is not `useEffect`:

```ts
// No dependency array — refreshes the ref after every render ...
// useLayoutEffect (not useEffect) so this ref is guaranteed to be refreshed before the
// topbar-wiring effect above can run on the same commit, regardless of declaration order —
// React flushes all of a component's layout effects before any of its passive effects.
useLayoutEffect(() => {
  requestCancelConfigRef.current = params.requestCancelConfig;
});
```

**Detecting unsaved edits.** The two helpers are small and deliberate:

```ts
export function mergeLocalDataIntoLayout(
  layout: HotsiteAdminContentResponse['layout'],
  type: HotsiteModuleType,
  localData: Record<string, unknown>,
): HotsiteAdminContentResponse['layout'] {
  return layout.map((module) => (module.type === type ? { ...module, data: localData } : module));
}
export function isModuleDataDirty(
  committed: Record<string, unknown>,
  local: Record<string, unknown>,
): boolean {
  return JSON.stringify(committed) !== JSON.stringify(local);
}
```

`isModuleDataDirty` compares JSON strings because the data is plain JSON and no deep-equal library was a dependency. The failure mode is chosen on purpose: if two equal objects have different key order, it reports "dirty" (an unneeded prompt), never "clean" (a lost edit).

The discard prompt is an `AlertDialog`, which differs from an ordinary dialog: clicking outside does not close it, because the user must choose. That is how all alert dialogs behave and was left as is. The package it needs, `@radix-ui/react-alert-dialog`, is in `dependencies` and not `devDependencies`, because production code imports it and `pnpm deploy --prod` removes dev dependencies.

## 9. Email: From, Reply-To and header injection (S09)

On staging, a booking sent no email. Brevo rejected the sender, a Gmail address the tenant had saved. A public mailbox like Gmail cannot be authenticated for sending, and each tenant address would need individual validation. The fix is the standard split:

- **From** is always the platform address (`EMAIL_FROM`), with the tenant's name as the display name.
- **Reply-To** is the tenant's `businessInfo.email`; if it is empty, no Reply-To is sent.

The sender receives the name separately and nodemailer builds the header. Concatenating `"Name" <address>` by hand would let a tenant name containing quotes or line breaks inject extra headers; nodemailer sanitizes the structured form. The test for this uses real nodemailer rather than a mock, because a mocked transport cannot prove anything about header output.

Because the app is pre-production, the old `settings.notification` block was removed with no migration and no compatibility shim: a stale browser tab that still sends it gets a 400 from the strict schema. `businessInfo.email` is public, so it was never auto-copied from a private setting.

## 10. Persisting the reason, not recomputing it (S10)

The schedule board hid the time a resource stays blocked after a booking, so a manager saw free time that availability would refuse. The reason (the service's buffer, or the resource's own turnover) is not recoverable later: only the sum is stored, and recomputing from today's settings is wrong if either was edited after the booking. So the origin is written at booking time, in two nullable columns.

The rule lives in one function and every consumer reads it:

```ts
export function resolveGap(
  bufferAfterMinutes: number,
  turnoverMinutes: number,
): ResourceGap | null {
  const minutes = Math.max(bufferAfterMinutes, turnoverMinutes);
  if (minutes <= 0) return null;
  return {
    minutes,
    source: bufferAfterMinutes >= turnoverMinutes ? 'SERVICE_BUFFER' : 'RESOURCE_TURNOVER',
  };
}
```

A tie goes to the service buffer, as the more actionable cause for a manager. Things to notice:

- **Safe migration.** The check constraint is added `NOT VALID` and validated in a separate statement. A plain `ADD CONSTRAINT` on a table with live rows takes an exclusive lock; the two-step form does not. The columns are additive and nullable.
- **No backfill, honest legacy.** Rows written before the change have no origin, and one cannot be reconstructed, so the screen shows "Origem não registrada" and never a guess.
- **Two writers did not share the rule.** Recurring materialization and resource reassignment build their own candidates. Both had to use `resolveGap`, and reassignment recomputes the gap for the new resource rather than carrying over the old one.
- **Geometry vs. label.** The web draws the tail from the block's `endsAt` minus the booking end; the stored `gap` only supplies the text. If they ever disagree, the geometry wins.
- **Two copies of one type.** The BFF keeps its own `DayGridBlock` beside the shared one, so both gained `gap`; a drift detector checks them.

## 11. Formatting a date range once (S11)

When a visible period crosses a month, `WeekNav` used to show only the first month. The fix is a pure formatter used by both Agenda and Horários:

```ts
export function formatMonthYearRange(start: Date, end: Date, locale: string): string {
  if (start.getFullYear() !== end.getFullYear()) {
    return `${formatMonthYear(start, locale)} – ${formatMonthYear(end, locale)}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${formatMonthName(start, locale)} – ${formatMonthYear(end, locale)}`;
  }
  return formatMonthYear(start, locale);
}
```

The three cases mirror the three outputs: different years show both years, different months show two names and one year, and the same month stays exactly as before. Putting it in the shared formatter, and not in each page, keeps the two screens from drifting.

## 12. Process lessons the milestone left behind

- **Review rounds often corrected the story text, not the code.** Several S04/S06 findings were a documented acceptance criterion that the shipped, better design had overtaken. The plan file records each, with a date.
- **A claim of "no X anywhere" needs a search.** S04's "no `vh` remains" was false twice until the last occurrence was found by looking at every container in the file.
- **Test the thing, not a proxy.** The Hero E2E first asserted "not 50% 50%" (true for any wrong value); it now asserts the exact `object-position`, and a real mobile-width height check protects the original bug.
- **Prefer the codebase's own convention to a one-off.** Several declined findings (enum validation, purpose-locking of image paths) were declined because doing it for one field would be inconsistent, and the right fix is a uniform pass.

## Where to look when changing this code

| You want to change | Start in |
|---|---|
| A hotsite module option | the three places in section 1 |
| The crop or minimum size of an upload | `apps/web/shared/utils/compress-image.ts` and `SingleImageUploadField.tsx` |
| Hero or Booking CTA layout | `HeroModule.tsx`, `BookingCtaModule.tsx`, `module-styles.ts` |
| Gallery layouts | `GalleryModule.tsx`, `GalleryItem.tsx`, `app/globals.css` |
| Editor preview, discard prompt, topbar | `HotsiteEditor.tsx`, `hotsite-editor-views.tsx`, `useHotsiteEditorTopbarOverride.ts` |
| Email sender | `email-delivery-channel.adapter.ts` and the two sender adapters |
| The held-time rule | `resource-gap-source.ts` and `resource-occupancy-candidate-builders.helpers.ts` |
| The week/period header | `WeekNav.tsx` and `format-time.ts` |
