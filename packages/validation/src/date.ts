export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const HHMM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeOfDay(value: string): boolean {
  return HHMM_PATTERN.test(value);
}

export function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
