import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { NoopEventBusAdapter } from './shared/infrastructure/noop-event-bus.adapter';
import { EVENT_BUS } from './shared/ports/index';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: EVENT_BUS,
      useClass: NoopEventBusAdapter,
    },
  ],
})
export class AppModule {}
