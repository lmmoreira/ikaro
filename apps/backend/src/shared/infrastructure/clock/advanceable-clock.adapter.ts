import { randomUUID } from 'node:crypto';
import {
  ClockAdvanceOutOfRangeError,
  MAX_CLOCK_OFFSET_MS,
} from '../../domain/clock-advance-out-of-range.error';
import { IClock } from '../../ports/clock.port';
import { IDevClockControl } from '../../ports/dev-clock-control.port';

/** Real time plus an in-process offset. Non-production only (see `ClockModule.register`). */
export class AdvanceableClock implements IClock, IDevClockControl {
  readonly instanceId = randomUUID();
  private offset = 0;

  get offsetMs(): number {
    return this.offset;
  }

  now(): Date {
    return new Date(Date.now() + this.offset);
  }

  advanceBy(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) {
      throw new RangeError('The clock can only move forward by a non-negative number of ms');
    }
    // Rejected, never clamped: an offset past the cap would make `now()` an invalid Date.
    if (this.offset + ms > MAX_CLOCK_OFFSET_MS) {
      throw new ClockAdvanceOutOfRangeError(
        `The clock can run at most ${MAX_CLOCK_OFFSET_MS} ms ahead of real time; reset it first`,
      );
    }
    this.offset += ms;
  }

  reset(): void {
    this.offset = 0;
  }
}
