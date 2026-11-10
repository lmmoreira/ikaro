export const CLOCK = Symbol('IClock');

/**
 * The one source of "now" for Billing date decisions (trial end, due dates, grace, purge age).
 * `now()` only: the production port never exposes a way to move time (`IDevClockControl` is the
 * non-production mutator). Existing code that calls `new Date()` directly is not migrated.
 */
export interface IClock {
  now(): Date;
}
