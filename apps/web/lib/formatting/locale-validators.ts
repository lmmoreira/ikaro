import type { DateFormat } from '@ikaro/i18n';

const DATE_FORMATS = new Set<DateFormat>(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']);

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveDateFormat(fmt: string): DateFormat {
  return DATE_FORMATS.has(fmt as DateFormat) ? (fmt as DateFormat) : 'DD/MM/YYYY';
}
