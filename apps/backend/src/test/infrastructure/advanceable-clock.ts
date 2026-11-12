import { IClock } from '../../shared/ports/clock.port';

/**
 * An `IClock` a spec moves by hand, for TTL and window assertions on a fake clock; never
 * `jest.useFakeTimers()` against a port that already takes a clock. Test-only: the production
 * port never exposes a way to move time.
 */
export class AdvanceableClock implements IClock {
  private current: number;

  constructor(start: Date = new Date()) {
    this.current = start.getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceMs(ms: number): void {
    this.current += ms;
  }
}
