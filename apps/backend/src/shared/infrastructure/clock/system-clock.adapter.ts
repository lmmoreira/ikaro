import { IClock } from '../../ports/clock.port';

export class SystemClock implements IClock {
  now(): Date {
    return new Date();
  }
}
