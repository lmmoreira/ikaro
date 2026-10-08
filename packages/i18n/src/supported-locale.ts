// The languages Ikaro ships copy for. A tenant's `settings.localization.language` is free text
// (a BCP-47 tag such as `en-US` or `en-GB` is normal), so every consumer that picks copy or
// per-language rows must reduce it through resolveSupportedLocale() instead of comparing the raw
// tag — the web app, the notification templates and the tenant's template rows all share this one
// rule.
export const SUPPORTED_LOCALES = ['pt-BR', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const FALLBACK_LOCALE: SupportedLocale = 'pt-BR';

// A shipped tag resolves to itself; a region-qualified tag resolves by its primary language
// subtag ('en-US', 'en-GB' → 'en'); anything else takes the pt-BR default.
export function resolveSupportedLocale(locale: string): SupportedLocale {
  if ((SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    return locale as SupportedLocale;
  }
  return locale.split('-')[0]?.toLowerCase() === 'en' ? 'en' : FALLBACK_LOCALE;
}
