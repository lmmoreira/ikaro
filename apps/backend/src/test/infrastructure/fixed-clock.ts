import { IClock } from '../../shared/ports/clock.port';

/**
 * An `IClock` frozen at one instant, for unit specs; never `jest.fn()` the port. Read-only like the
 * port itself: moving time is `IDevClockControl`'s job, not a test double's.
 */
export class FixedClock implements IClock {
  constructor(private readonly instant: Date = new Date()) {}

  now(): Date {
    return new Date(this.instant);
  }
}
