import { AdvanceableClock } from '../../../../shared/infrastructure/clock/advanceable-clock.adapter';
import { AdvanceClockUseCase } from './advance-clock.use-case';
import { GetClockUseCase } from './get-clock.use-case';
import { ResetClockUseCase } from './reset-clock.use-case';

describe('dev clock use cases', () => {
  let clock: AdvanceableClock;
  let advance: AdvanceClockUseCase;
  let reset: ResetClockUseCase;
  let get: GetClockUseCase;

  beforeEach(() => {
    clock = new AdvanceableClock();
    advance = new AdvanceClockUseCase(clock);
    reset = new ResetClockUseCase(clock);
    get = new GetClockUseCase(clock);
  });

  it('treats { days: 1, hours: 2 } as a 26 hour step', () => {
    const result = advance.execute({ days: 1, hours: 2 });

    expect(result.offsetMs).toBe(26 * 60 * 60 * 1000);
    expect(result.instanceId).toBe(clock.instanceId);
  });

  it('accepts days alone and hours alone', () => {
    expect(advance.execute({ days: 2 }).offsetMs).toBe(48 * 60 * 60 * 1000);
    expect(advance.execute({ hours: 1 }).offsetMs).toBe(49 * 60 * 60 * 1000);
  });

  it('get returns the offset and the serving instanceId', () => {
    advance.execute({ hours: 3 });

    expect(get.execute()).toEqual({ offsetMs: 3 * 60 * 60 * 1000, instanceId: clock.instanceId });
  });

  it('reset returns the offset to zero and is idempotent', () => {
    advance.execute({ days: 1 });

    expect(reset.execute().offsetMs).toBe(0);
    expect(reset.execute().offsetMs).toBe(0);
    expect(get.execute().offsetMs).toBe(0);
  });
});
