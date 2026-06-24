# TD12 — `TenantSettings.create()` doesn't validate `localization` itself

## Status
- **Type**: Technical Debt / Defense-in-depth
- **Priority**: Low
- **Context**: `apps/backend/src/contexts/platform/domain/value-objects/tenant-settings.vo.ts`
- **Created**: 2026-06-24

## Problem

`TenantSettings.validate()` (called from `create()`, skipped by `reconstitute()`) validates `loyalty`, `booking`, `businessHours`, and `businessInfo` — but not `props.localization` itself:

```ts
private static validate(props: TenantSettingsProps): void {
  TenantSettings.validateLoyalty(props.loyalty);
  TenantSettings.validateBooking(props.booking);
  TenantSettings.validateBusinessHours(props.businessHours);
  TenantSettings.validateBusinessInfo(props.businessInfo, props.localization.countryCode);
}
```

This contradicts the project's own VO rule (`docs/ENGINEERING_RULES.md` / `CLAUDE.md` §7): "value objects must validate in `create()` and skip validation in `reconstitute()`." Today, `create()` implicitly depends on its *caller* having already validated `localization` — it isn't self-sufficient.

Flagged by CodeRabbit on PR #36 (M13-S10) as "an invalid `countryCode` or `decimalPlaces` passes construction and only fails later when `resolveLocalization()` reaches `countrySpec()`." Verified that claim against the actual code before writing this up — it doesn't hold as stated: `countrySpec()` (`packages/i18n/src/country-defaults.ts`) never throws for an unknown code; it falls back to a generic `FALLBACK` spec. So an invalid `countryCode` wouldn't cause a later crash — it would silently apply generic (wrong) phone-format/date-format/address-label defaults for that tenant, with no error anywhere.

In practice there is no live exploitable gap today: `TenantSettings.create()` has exactly one production caller (`update-tenant-settings.use-case.ts`), reached only through `PATCH /tenants/settings`'s `ZodValidationPipe(UpdateTenantSettingsSchema)`, whose `LocalizationSchema` already regex-checks `countryCode` (`^[A-Za-z]{2}$`) and range-checks `decimalPlaces` (0–8) before `create()` ever runs. The real issue is that this safety is borrowed from the caller, not owned by the VO — the same gap that would matter the moment a second caller (e.g. a future internal/admin path) constructs `TenantSettings.create()` without going through that exact Zod schema.

## Proposed fix (not yet scoped as a story)

1. Add `TenantSettings.validateLocalization(localization: LocalizationSettings): void` to the existing `validate()` chain, checking at minimum: `countryCode` is a known 2-letter code (or explicitly decide unknown codes are acceptable and document why), `decimalPlaces` within 0–8, `currency`/`language` non-empty.
2. Decide whether "unknown country code" should be a hard validation error or an intentionally accepted fallback (the system already supports a generic `FALLBACK` country spec for some purpose — confirm that's only meant for `default()`'s convenience, not for arbitrary admin input).
3. Give any new failure a typed error class per the existing VO-error-mapping rule, and add the corresponding `instanceof` branch to `mapPlatformError`.

## Acceptance criteria (when this is picked up)

- [ ] `TenantSettings.create()` rejects an invalid `countryCode`/`decimalPlaces` on its own, independent of any calling Zod schema
- [ ] `reconstitute()` behavior unchanged (still skips validation)
- [ ] New error path covered by a `.spec.ts` case and mapped to 400 in `mapPlatformError`
- [ ] No behavior change for any currently-valid `localization` payload
