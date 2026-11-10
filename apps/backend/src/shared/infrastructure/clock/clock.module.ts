import { DynamicModule, Module } from '@nestjs/common';
import { AppEnv } from '../../database/resolve-app-env';
import { CLOCK } from '../../ports/clock.port';
import { AdvanceableClock } from './advanceable-clock.adapter';
import { SystemClock } from './system-clock.adapter';

/**
 * Binds `CLOCK`: the advanceable clock in `local`/`staging` (so the dev routes move what every
 * Billing date rule sees), the system clock in `production`. Global, imported once in `AppModule`.
 * The `CLOCK` token is exported (a global module still needs `exports:`).
 */
@Module({})
export class ClockModule {
  static register(appEnv: AppEnv): DynamicModule {
    if (appEnv === 'production') {
      return {
        module: ClockModule,
        global: true,
        providers: [{ provide: CLOCK, useClass: SystemClock }],
        exports: [CLOCK],
      };
    }
    return {
      module: ClockModule,
      global: true,
      providers: [
        AdvanceableClock,
        {
          provide: CLOCK,
          useFactory: (clock: AdvanceableClock) => clock,
          inject: [AdvanceableClock],
        },
      ],
      exports: [CLOCK, AdvanceableClock],
    };
  }
}
