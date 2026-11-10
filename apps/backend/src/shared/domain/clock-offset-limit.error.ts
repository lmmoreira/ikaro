import { GenericErrorCode } from '@ikaro/types';

/** The dev clock may run at most this far ahead of real time (100 years), so `now()` stays a valid Date. */
export const MAX_CLOCK_OFFSET_MS = 100 * 365 * 24 * 60 * 60 * 1000;

/** An advance would push the dev clock's cumulative offset past `MAX_CLOCK_OFFSET_MS`. */
export class ClockOffsetLimitError extends Error {
  readonly code = GenericErrorCode.VALUE_OUT_OF_RANGE;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype); // required — instanceof fails without this
    this.name = 'ClockOffsetLimitError';
  }
}
