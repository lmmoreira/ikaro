import { Test } from '@nestjs/testing';
import {
  ClockAdvanceOutOfRangeError,
  MAX_CLOCK_OFFSET_MS,
} from '../../domain/clock-advance-out-of-range.error';
import { CLOCK, IClock } from '../../ports/clock.port';
import { AdvanceableClock } from './advanceable-clock.adapter';
import { ClockModule } from './clock.module';
import { SystemClock } from './system-clock.adapter';

describe('SystemClock', () => {
  it('returns real time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe('AdvanceableClock', () => {
  it('returns real time plus the accumulated offset', () => {
    const clock = new AdvanceableClock();
    clock.advanceBy(1000);
    clock.advanceBy(2000);

    expect(clock.offsetMs).toBe(3000);
    const drift = clock.now().getTime() - (Date.now() + 3000);
    expect(Math.abs(drift)).toBeLessThan(50);
  });

  it('rejects a negative advance and keeps the offset', () => {
    const clock = new AdvanceableClock();
    clock.advanceBy(500);

    expect(() => clock.advanceBy(-1)).toThrow(RangeError);
    expect(() => clock.advanceBy(Number.NaN)).toThrow(RangeError);
    expect(clock.offsetMs).toBe(500);
  });

  it('accepts an advance up to the cap and rejects one past it, so now() stays a valid Date', () => {
    const clock = new AdvanceableClock();
    clock.advanceBy(MAX_CLOCK_OFFSET_MS);

    expect(Number.isNaN(clock.now().getTime())).toBe(false);
    expect(() => clock.advanceBy(1)).toThrow(ClockAdvanceOutOfRangeError);
    expect(clock.offsetMs).toBe(MAX_CLOCK_OFFSET_MS);
    expect(Number.isNaN(clock.now().getTime())).toBe(false);
  });

  it('reset returns the offset to zero and is idempotent', () => {
    const clock = new AdvanceableClock();
    clock.advanceBy(5000);

    clock.reset();
    clock.reset();

    expect(clock.offsetMs).toBe(0);
  });

  it('has an instanceId that is stable within a process and differs between instances', () => {
    const a = new AdvanceableClock();
    const b = new AdvanceableClock();

    expect(a.instanceId).toBe(a.instanceId);
    expect(a.instanceId).not.toBe(b.instanceId);
  });
});

describe('ClockModule.register', () => {
  async function resolveClock(appEnv: 'local' | 'staging' | 'production'): Promise<IClock> {
    const moduleRef = await Test.createTestingModule({
      imports: [ClockModule.register(appEnv)],
    }).compile();
    return moduleRef.get<IClock>(CLOCK);
  }

  it.each(['local', 'staging'] as const)(
    'binds CLOCK to the advanceable clock in %s',
    async (env) => {
      expect(await resolveClock(env)).toBeInstanceOf(AdvanceableClock);
    },
  );

  it('binds CLOCK to the system clock in production', async () => {
    const clock = await resolveClock('production');

    expect(clock).toBeInstanceOf(SystemClock);
    expect(clock).not.toBeInstanceOf(AdvanceableClock);
  });
});
