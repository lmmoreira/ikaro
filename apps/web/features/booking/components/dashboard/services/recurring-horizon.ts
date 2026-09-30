import { MAX_RECURRING_HORIZON_DAYS, MIN_RECURRING_HORIZON_DAYS } from '@ikaro/types';

// null = inherit the platform default, so blank is always valid. The bounds are the shared ones the
// request schema enforces (@ikaro/types), checked here so an out-of-range value never reaches the
// BFF — its schema rejection carries no error `code`, which would show only the generic fallback.
export function isValidRecurringHorizonDays(value: number | null): boolean {
  return (
    value === null ||
    (Number.isInteger(value) &&
      value >= MIN_RECURRING_HORIZON_DAYS &&
      value <= MAX_RECURRING_HORIZON_DAYS)
  );
}
