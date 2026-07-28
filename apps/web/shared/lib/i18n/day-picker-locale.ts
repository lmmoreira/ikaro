import { enUS, ptBR } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import { resolveSupportedLocale } from './get-messages';

export function resolveDayPickerLocale(locale: string): Locale {
  return resolveSupportedLocale(locale) === 'en' ? enUS : ptBR;
}
