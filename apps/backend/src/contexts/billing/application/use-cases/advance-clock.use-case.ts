import { Inject, Injectable } from '@nestjs/common';
import { ClockAdvanceOutOfRangeError } from '../../../../shared/domain/clock-advance-out-of-range.error';
import { AdvanceClockSchema } from '../dtos/advance-clock.dto';
import {
  DEV_CLOCK_CONTROL,
  IDevClockControl,
} from '../../../../shared/ports/dev-clock-control.port';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export type AdvanceClockUseCaseInput = {
  days?: number;
  hours?: number;
};

export type AdvanceClockUseCaseResult = {
  offsetMs: number;
  instanceId: string;
};

/** Dev only (`DevClockModule`): moves the dev clock forward by `days` * 24 h + `hours` * 1 h. */
@Injectable()
export class AdvanceClockUseCase {
  constructor(@Inject(DEV_CLOCK_CONTROL) private readonly clock: IDevClockControl) {}

  /**
   * @throws ClockAdvanceOutOfRangeError for a negative, fractional, zero, empty or oversized step,
   * or when the cumulative offset would pass the clock's cap. The step rules are the HTTP schema's
   * own (`AdvanceClockSchema`), so a direct caller and a request are held to one definition.
   */
  execute(input: AdvanceClockUseCaseInput): AdvanceClockUseCaseResult {
    const step = AdvanceClockSchema.safeParse(input);
    if (!step.success) {
      throw new ClockAdvanceOutOfRangeError(
        'days and hours must be whole numbers within bounds and add up to more than zero',
      );
    }
    this.clock.advanceBy((step.data.days ?? 0) * MS_PER_DAY + (step.data.hours ?? 0) * MS_PER_HOUR);
    return { offsetMs: this.clock.offsetMs, instanceId: this.clock.instanceId };
  }
}
