import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformModule } from './contexts/platform/platform.module';
import { HealthController } from './health/health.controller';
import { NoopEventBusAdapter } from './shared/infrastructure/noop-event-bus.adapter';
import { EVENT_BUS } from './shared/ports/index';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env['DATABASE_URL'],
      synchronize: false,
      migrationsRun: false,
      entities: [__dirname + '/contexts/**/infrastructure/entities/*.entity{.ts,.js}'],
    }),
    PlatformModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: EVENT_BUS,
      useClass: NoopEventBusAdapter,
    },
  ],
})
export class AppModule {}
