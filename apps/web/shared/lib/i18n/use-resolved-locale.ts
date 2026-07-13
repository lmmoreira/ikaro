import { useLocale } from 'next-intl';
import { resolveSupportedLocale, type SupportedLocale } from './get-messages';

// next-intl's useLocale() returns a plain string; resolveErrorMessage needs the narrowed
// SupportedLocale union. Centralizes the normalization so call sites don't repeat it.
export function useResolvedLocale(): SupportedLocale {
  return resolveSupportedLocale(useLocale());
}
