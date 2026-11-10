import { AdvanceableClock } from '../../../../shared/infrastructure/clock/advanceable-clock.adapter';
import { ResetClockUseCase } from './reset-clock.use-case';

describe('ResetClockUseCase', () => {
  it('returns the offset to zero and is idempotent', () => {
    const clock = new AdvanceableClock();
    clock.advanceBy(24 * 60 * 60 * 1000);
    const useCase = new ResetClockUseCase(clock);

    expect(useCase.execute().offsetMs).toBe(0);
    expect(useCase.execute()).toEqual({ offsetMs: 0, instanceId: clock.instanceId });
    expect(clock.offsetMs).toBe(0);
  });
});
