import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventBusModule } from '../../shared/infrastructure/event-bus/event-bus.module';
import { RequestModule } from '../../shared/request/request.module';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { StorageModule } from '../../shared/infrastructure/storage.module';
import { CustomerModule } from '../customer/customer.module';
import { PlatformSettingsModule } from '../platform/platform-settings.module';
import { StaffModule } from '../staff/staff.module';
import { GetBookingByIdUseCase } from './application/use-cases/get-booking-by-id.use-case';
import { GetServicesUseCase } from './application/use-cases/get-services.use-case';
import { BookingAttachmentsController } from './infrastructure/controllers/booking-attachments.controller';
import { BookingEntity } from './infrastructure/entities/booking.entity';
import { BookingLineEntity } from './infrastructure/entities/booking-line.entity';
import { ScheduleClosureEntity } from './infrastructure/entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from './infrastructure/entities/schedule-opening.entity';
import { ServiceEntity } from './infrastructure/entities/service.entity';
import {
  ServiceResourceRequirementEntity,
  ServiceResourceRequirementPoolEntity,
} from './infrastructure/entities/service-resource-requirement.entity';
import {
  ServiceLegEntity,
  ServiceLegResourceRequirementEntity,
  ServiceLegResourceRequirementPoolEntity,
} from './infrastructure/entities/service-leg.entity';
import { ServiceClassResourcePoolEntity } from './infrastructure/entities/service-class-resource-pool.entity';
import { ServiceBookingIntakeSchemaEntity } from './infrastructure/entities/service-booking-intake-schema.entity';
import { BookingQuoteRevisionEntity } from './infrastructure/entities/booking-quote-revision.entity';
import { RecurringBookingScheduleEntity } from './infrastructure/entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from './infrastructure/entities/recurring-booking-schedule-resource-assignment.entity';
import { FutureCommitmentExceptionEntity } from './infrastructure/entities/future-commitment-exception.entity';
import { BookingAttendeeEntity } from './infrastructure/entities/booking-attendee.entity';
import { ResourceEntity } from './infrastructure/entities/resource.entity';
import { BookingLineResourceAssignmentEntity } from './infrastructure/entities/booking-line-resource-assignment.entity';
import { ResourceOccupancyEntity } from './infrastructure/entities/resource-occupancy.entity';
import { BookingController } from './infrastructure/controllers/booking.controller';
import { BookingLifecycleController } from './infrastructure/controllers/booking-lifecycle.controller';
import { BookingCompletionController } from './infrastructure/controllers/booking-completion.controller';
import { CronBookingController } from './infrastructure/controllers/cron-booking.controller';
import { ResourceController } from './infrastructure/controllers/resource.controller';
import { RecurringBookingScheduleController } from './infrastructure/controllers/recurring-booking-schedule.controller';
import { SchedulingExceptionController } from './infrastructure/controllers/scheduling-exception.controller';
import { ScheduleAvailabilityController } from './infrastructure/controllers/schedule-availability.controller';
import { ScheduleAvailabilitySummaryController } from './infrastructure/controllers/schedule-availability-summary.controller';
import { ScheduleDayGridController } from './infrastructure/controllers/schedule-day-grid.controller';
import { ScheduleClosureController } from './infrastructure/controllers/schedule-closure.controller';
import { ScheduleOpeningController } from './infrastructure/controllers/schedule-opening.controller';
import { ServiceController } from './infrastructure/controllers/service.controller';
import { SharedCacheModule } from '../../shared/infrastructure/cache/shared-cache.module';
import { bookingModuleProviders } from './booking.module-providers';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceEntity,
      ServiceResourceRequirementEntity,
      ServiceResourceRequirementPoolEntity,
      ServiceLegEntity,
      ServiceLegResourceRequirementEntity,
      ServiceLegResourceRequirementPoolEntity,
      ServiceClassResourcePoolEntity,
      ServiceBookingIntakeSchemaEntity,
      BookingAttendeeEntity,
      ScheduleClosureEntity,
      ScheduleOpeningEntity,
      BookingEntity,
      BookingLineEntity,
      ResourceEntity,
      BookingLineResourceAssignmentEntity,
      ResourceOccupancyEntity,
      BookingQuoteRevisionEntity,
      RecurringBookingScheduleEntity,
      RecurringBookingScheduleResourceAssignmentEntity,
      FutureCommitmentExceptionEntity,
    ]),
    EventBusModule,
    RequestModule,
    TransactionManagerModule,
    StorageModule,
    CustomerModule,
    PlatformSettingsModule,
    StaffModule,
    SharedCacheModule,
  ],
  controllers: [
    BookingAttachmentsController,
    BookingController,
    BookingLifecycleController,
    BookingCompletionController,
    ServiceController,
    ScheduleClosureController,
    ScheduleOpeningController,
    ScheduleAvailabilityController,
    ScheduleAvailabilitySummaryController,
    ScheduleDayGridController,
    ResourceController,
    CronBookingController,
    RecurringBookingScheduleController,
    SchedulingExceptionController,
  ],
  providers: bookingModuleProviders,
  exports: [GetBookingByIdUseCase, GetServicesUseCase],
})
export class BookingModule {}
