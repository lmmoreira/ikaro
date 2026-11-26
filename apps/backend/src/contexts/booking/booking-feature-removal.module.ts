import { Module } from '@nestjs/common';
import { PlatformSettingsModule } from '../platform/platform-settings.module';
import { FEATURE_REMOVAL_BLOCKERS_REPOSITORY } from './application/ports/feature-removal-blockers-repository.port';
import { GetBookingFeatureRemovalImpactUseCase } from './application/use-cases/get-booking-feature-removal-impact.use-case';
import { TypeOrmFeatureRemovalBlockersRepository } from './infrastructure/repositories/typeorm-feature-removal-blockers.repository';

// The lighter Booking module Billing imports (M26-S18a), the way Booking and Billing already import
// `PlatformSettingsModule` instead of the whole Platform module: it provides only the read-only
// BOOKING-removal guard and its read model, so Billing never pulls Booking's entities, event
// handlers or controllers into its own module graph or its integration harness. `BookingModule`
// does not import it and none of its providers are registered twice.
@Module({
  imports: [PlatformSettingsModule],
  providers: [
    {
      provide: FEATURE_REMOVAL_BLOCKERS_REPOSITORY,
      useClass: TypeOrmFeatureRemovalBlockersRepository,
    },
    GetBookingFeatureRemovalImpactUseCase,
  ],
  exports: [GetBookingFeatureRemovalImpactUseCase],
})
export class BookingFeatureRemovalModule {}
