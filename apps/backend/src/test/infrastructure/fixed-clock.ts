import { IClock } from '../../shared/ports/clock.port';

/** A settable `IClock` for unit specs; never `jest.fn()` the port. */
export class FixedClock implements IClock {
  constructor(private current: Date = new Date()) {}

  now(): Date {
    return new Date(this.current);
  }

  set(date: Date): void {
    this.current = new Date(date);
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}
