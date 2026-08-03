/**
 * Format-only check (2-letter ISO 3166-1 alpha-2 shape). Does not check whether the code is a
 * supported country — that requires the backend's `CountryCode` VO (`CountryCode.isValid()`),
 * which isn't available to the BFF. Consumers needing the full semantic check must layer their
 * own refinement on top of this pattern.
 */
export const COUNTRY_CODE_FORMAT_PATTERN = /^[A-Za-z]{2}$/;
