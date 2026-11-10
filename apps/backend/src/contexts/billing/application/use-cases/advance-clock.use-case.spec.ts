import { GenericErrorCode } from '@ikaro/types';
import { ClockAdvanceOutOfRangeError } from '../../../../shared/domain/clock-advance-out-of-range.error';
import { AdvanceableClock } from '../../../../shared/infrastructure/clock/advanceable-clock.adapter';
import { AdvanceClockUseCase } from './advance-clock.use-case';

describe('AdvanceClockUseCase', () => {
  let clock: AdvanceableClock;
  let useCase: AdvanceClockUseCase;

  beforeEach(() => {
    clock = new AdvanceableClock();
    useCase = new AdvanceClockUseCase(clock);
  });

  it('treats { days: 1, hours: 2 } as a 26 hour step', () => {
    const result = useCase.execute({ days: 1, hours: 2 });

    expect(result.offsetMs).toBe(26 * 60 * 60 * 1000);
    expect(result.instanceId).toBe(clock.instanceId);
  });

  it('accepts days alone and hours alone, accumulating the offset', () => {
    expect(useCase.execute({ days: 2 }).offsetMs).toBe(48 * 60 * 60 * 1000);
    expect(useCase.execute({ hours: 1 }).offsetMs).toBe(49 * 60 * 60 * 1000);
  });

  // A negative guarantee ("rejected"): it holds for a direct caller, not only for an HTTP request.
  it.each([
    ['empty input', {}],
    ['zero total', { days: 0, hours: 0 }],
    ['negative days', { days: -1 }],
    ['negative hours', { hours: -2 }],
    ['fractional days', { days: 1.5 }],
    ['fractional hours', { hours: 0.5 }],
    ['days past the bound', { days: 36_501 }],
    ['a value that overflows to Infinity', { days: 1e308 }],
  ])('rejects %s with GENERIC_VALUE_OUT_OF_RANGE and leaves the clock alone', (_name, input) => {
    let thrown: unknown;
    try {
      useCase.execute(input);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(ClockAdvanceOutOfRangeError);
    expect((thrown as ClockAdvanceOutOfRangeError).code).toBe(GenericErrorCode.VALUE_OUT_OF_RANGE);
    expect(clock.offsetMs).toBe(0);
  });

  it('rejects an advance that would push the cumulative offset past the cap and keeps the offset', () => {
    useCase.execute({ days: 36_500 });
    const before = clock.offsetMs;

    expect(() => useCase.execute({ hours: 1 })).toThrow(ClockAdvanceOutOfRangeError);
    expect(clock.offsetMs).toBe(before);
    expect(Number.isNaN(clock.now().getTime())).toBe(false);
  });
});
