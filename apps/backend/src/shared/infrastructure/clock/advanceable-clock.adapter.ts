import { randomUUID } from 'node:crypto';
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
    this.offset += ms;
  }

  reset(): void {
    this.offset = 0;
  }
}
