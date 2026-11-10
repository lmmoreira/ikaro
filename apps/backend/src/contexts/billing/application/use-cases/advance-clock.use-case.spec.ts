import { ClockOffsetLimitError } from '../../../../shared/domain/clock-offset-limit.error';
import { AdvanceableClock } from '../../../../shared/infrastructure/clock/advanceable-clock.adapter';
import { AdvanceClockUseCase } from './advance-clock.use-case';

describe('AdvanceClockUseCase', () => {
  let clock: AdvanceableClock;
  let useCase: AdvanceClockUseCase;

  beforeEach(() => {
    clock = new AdvanceableClock();
    useCase = new AdvanceClockUseCase(clock);
  });

  it('treats { days: 1, hours: 2 } as a 26 hour step', async () => {
    const result = await useCase.execute({ days: 1, hours: 2 });

    expect(result.offsetMs).toBe(26 * 60 * 60 * 1000);
    expect(result.instanceId).toBe(clock.instanceId);
  });

  it('accepts days alone and hours alone, accumulating the offset', async () => {
    expect((await useCase.execute({ days: 2 })).offsetMs).toBe(48 * 60 * 60 * 1000);
    expect((await useCase.execute({ hours: 1 })).offsetMs).toBe(49 * 60 * 60 * 1000);
  });

  it('rejects an advance that would push the cumulative offset past the cap and keeps the offset', async () => {
    await useCase.execute({ days: 36_500 });

    await expect(useCase.execute({ hours: 1 })).rejects.toBeInstanceOf(ClockOffsetLimitError);
    expect(clock.now().getTime()).not.toBeNaN();
  });
});
