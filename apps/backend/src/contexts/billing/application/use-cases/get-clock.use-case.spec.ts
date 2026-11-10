import { AdvanceableClock } from '../../../../shared/infrastructure/clock/advanceable-clock.adapter';
import { GetClockUseCase } from './get-clock.use-case';

describe('GetClockUseCase', () => {
  it('returns the offset and the serving instanceId', () => {
    const clock = new AdvanceableClock();
    clock.advanceBy(3 * 60 * 60 * 1000);

    expect(new GetClockUseCase(clock).execute()).toEqual({
      offsetMs: 3 * 60 * 60 * 1000,
      instanceId: clock.instanceId,
    });
  });
});
