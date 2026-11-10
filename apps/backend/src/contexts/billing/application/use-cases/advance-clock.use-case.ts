import { Inject, Injectable } from '@nestjs/common';
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

  /** @throws ClockOffsetLimitError when the cumulative offset would pass the clock's cap. */
  execute(input: AdvanceClockUseCaseInput): AdvanceClockUseCaseResult {
    this.clock.advanceBy((input.days ?? 0) * MS_PER_DAY + (input.hours ?? 0) * MS_PER_HOUR);
    return { offsetMs: this.clock.offsetMs, instanceId: this.clock.instanceId };
  }
}
