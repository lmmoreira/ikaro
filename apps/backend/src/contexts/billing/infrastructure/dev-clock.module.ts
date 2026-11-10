import { DynamicModule, Module } from '@nestjs/common';
import { AppEnv } from '../../../shared/database/resolve-app-env';
import { AdvanceableClock } from '../../../shared/infrastructure/clock/advanceable-clock.adapter';
import { DEV_CLOCK_CONTROL } from '../../../shared/ports/dev-clock-control.port';
import { AdvanceClockUseCase } from '../application/use-cases/advance-clock.use-case';
import { GetClockUseCase } from '../application/use-cases/get-clock.use-case';
import { ResetClockUseCase } from '../application/use-cases/reset-clock.use-case';
import { InternalDevClockController } from './controllers/internal-dev-clock.controller';

/**
 * The dev-only clock routes. In `production` this is an empty module: no controller, no use case
 * and no `IDevClockControl` binding exist, so the routes answer 404 and nothing can resolve the
 * control token. `local` and `staging` get all of it; `ClockModule.register` binds the matching
 * `AdvanceableClock` in those environments.
 */
@Module({})
export class DevClockModule {
  static register(appEnv: AppEnv): DynamicModule {
    if (appEnv === 'production') {
      return { module: DevClockModule };
    }
    return {
      module: DevClockModule,
      controllers: [InternalDevClockController],
      providers: [
        {
          provide: DEV_CLOCK_CONTROL,
          useFactory: (clock: AdvanceableClock) => clock,
          inject: [AdvanceableClock],
        },
        AdvanceClockUseCase,
        ResetClockUseCase,
        GetClockUseCase,
      ],
    };
  }
}
