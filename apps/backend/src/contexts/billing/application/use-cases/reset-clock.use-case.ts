import { Inject, Injectable } from '@nestjs/common';
import {
  DEV_CLOCK_CONTROL,
  IDevClockControl,
} from '../../../../shared/ports/dev-clock-control.port';

export type ResetClockUseCaseResult = {
  offsetMs: number;
  instanceId: string;
};

/** Dev only: sets the offset back to zero. Idempotent. */
@Injectable()
export class ResetClockUseCase {
  constructor(@Inject(DEV_CLOCK_CONTROL) private readonly clock: IDevClockControl) {}

  execute(): ResetClockUseCaseResult {
    this.clock.reset();
    return { offsetMs: this.clock.offsetMs, instanceId: this.clock.instanceId };
  }
}
