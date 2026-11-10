import { Inject, Injectable } from '@nestjs/common';
import {
  DEV_CLOCK_CONTROL,
  IDevClockControl,
} from '../../../../shared/ports/dev-clock-control.port';

export type GetClockUseCaseResult = {
  offsetMs: number;
  instanceId: string;
};

/** Dev only: the current offset and the serving `instanceId` (the single-instance check). */
@Injectable()
export class GetClockUseCase {
  constructor(@Inject(DEV_CLOCK_CONTROL) private readonly clock: IDevClockControl) {}

  execute(): GetClockUseCaseResult {
    return { offsetMs: this.clock.offsetMs, instanceId: this.clock.instanceId };
  }
}
