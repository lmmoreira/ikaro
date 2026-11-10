import { GenericErrorCode } from '@ikaro/types';

/** The dev clock may run at most this far ahead of real time (100 years), so `now()` stays a valid Date. */
export const MAX_CLOCK_OFFSET_MS = 100 * 365 * 24 * 60 * 60 * 1000;

/**
 * The dev clock refuses an advance: the step is not a positive whole number of days/hours within
 * bounds, or it would push the cumulative offset past `MAX_CLOCK_OFFSET_MS`.
 */
export class ClockAdvanceOutOfRangeError extends Error {
  readonly code = GenericErrorCode.VALUE_OUT_OF_RANGE;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype); // required — instanceof fails without this
    this.name = 'ClockAdvanceOutOfRangeError';
  }
}
