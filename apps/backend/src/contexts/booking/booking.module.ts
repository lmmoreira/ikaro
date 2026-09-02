import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventBusModule } from '../../shared/infrastructure/event-bus/event-bus.module';
import { RequestModule } from '../../shared/request/request.module';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { StorageModule } from '../../shared/infrastructure/storage.module';
import { CustomerModule } from '../customer/customer.module';
import { PlatformSettingsModule } from '../platform/platform-settings.module';
import { StaffModule } from '../staff/staff.module';
import { BOOKING_AVAILABILITY_PORT } from './application/ports/booking-availability.port';
import { BOOKING_REPOSITORY } from './application/ports/booking-repository.port';
import { BOOKING_CUSTOMER_PORT } from './application/ports/booking-customer.port';
import { BOOKING_PLATFORM_PORT } from './application/ports/booking-platform.port';
import { BOOKING_STAFF_PORT } from './application/ports/booking-staff.port';
import { RESOURCE_REPOSITORY } from './application/ports/resource-repository.port';
import { SCHEDULE_CLOSURE_REPOSITORY } from './application/ports/schedule-closure-repository.port';
import { SCHEDULE_OPENING_REPOSITORY } from './application/ports/schedule-opening-repository.port';
import { SERVICE_REPOSITORY } from './application/ports/service-repository.port';
import { AdminScheduleReminderJob } from './application/jobs/admin-schedule-reminder.job';
import { BookingReminderJob } from './application/jobs/booking-reminder.job';
import { BookingReminderTriggerHandler } from './infrastructure/events/booking-reminder-trigger.handler';
import { AdminScheduleReminderTriggerHandler } from './infrastructure/events/admin-schedule-reminder-trigger.handler';
import { StaffDeactivatedHandler } from './infrastructure/events/staff-deactivated.handler';
import { CloseScheduleUseCase } from './application/use-cases/close-schedule.use-case';
import { ActivateServiceUseCase } from './application/use-cases/activate-service.use-case';
import { CreateResourceUseCase } from './application/use-cases/create-resource.use-case';
import { UpdateResourceUseCase } from './application/use-cases/update-resource.use-case';
import { StaffWrapValidationService } from './application/services/staff-wrap-validation.service';
import { DeactivateResourceUseCase } from './application/use-cases/deactivate-resource.use-case';
import { ReactivateResourceUseCase } from './application/use-cases/reactivate-resource.use-case';
import { ListResourcesUseCase } from './application/use-cases/list-resources.use-case';
import { CascadeStaffDeactivationUseCase } from './application/use-cases/cascade-staff-deactivation.use-case';
import { CreateServiceUseCase } from './application/use-cases/create-service.use-case';
import { RequestAuthenticatedBookingUseCase } from './application/use-cases/request-authenticated-booking.use-case';
import { RequestBookingUseCase } from './application/use-cases/request-booking.use-case';
import { DeactivateServiceUseCase } from './application/use-cases/deactivate-service.use-case';
import { GetAvailabilityUseCase } from './application/use-cases/get-availability.use-case';
import { GetAvailabilitySummaryUseCase } from './application/use-cases/get-availability-summary.use-case';
import { GetServiceByIdUseCase } from './application/use-cases/get-service-by-id.use-case';
import { ListClosuresUseCase } from './application/use-cases/list-closures.use-case';
import { ListOpeningsUseCase } from './application/use-cases/list-openings.use-case';
import { GetServicesUseCase } from './application/use-cases/get-services.use-case';
import { OpenScheduleUseCase } from './application/use-cases/open-schedule.use-case';
import { RemoveClosureUseCase } from './application/use-cases/remove-closure.use-case';
import { RemoveScheduleOpeningUseCase } from './application/use-cases/remove-schedule-opening.use-case';
import { UpdateServiceUseCase } from './application/use-cases/update-service.use-case';
import { ApproveBookingUseCase } from './application/use-cases/approve-booking.use-case';
import { RejectBookingUseCase } from './application/use-cases/reject-booking.use-case';
import { RequestMoreInfoUseCase } from './application/use-cases/request-more-info.use-case';
import { SubmitBookingInfoUseCase } from './application/use-cases/submit-booking-info.use-case';
import { SubmitGuestBookingInfoUseCase } from './application/use-cases/submit-guest-booking-info.use-case';
import { ListBookingsUseCase } from './application/use-cases/list-bookings.use-case';
import { CancelBookingAsCustomerUseCase } from './application/use-cases/cancel-booking-as-customer.use-case';
import { CancelBookingAsAdminUseCase } from './application/use-cases/cancel-booking-as-admin.use-case';
import { RescheduleBookingUseCase } from './application/use-cases/reschedule-booking.use-case';
import { CompleteBookingUseCase } from './application/use-cases/complete-booking.use-case';
import { GenerateAttachmentSignedUrlUseCase } from './application/use-cases/generate-attachment-signed-url.use-case';
import { GetBookingByIdUseCase } from './application/use-cases/get-booking-by-id.use-case';
import { BookingAttachmentsController } from './infrastructure/controllers/booking-attachments.controller';
import { BookingSlotConflictService } from './application/services/booking-slot-conflict.service';
import { PhotoExistenceService } from './application/services/photo-existence.service';
import { BookingEntity } from './infrastructure/entities/booking.entity';
import { BookingLineEntity } from './infrastructure/entities/booking-line.entity';
import { ScheduleClosureEntity } from './infrastructure/entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from './infrastructure/entities/schedule-opening.entity';
import { ServiceEntity } from './infrastructure/entities/service.entity';
import { ResourceEntity } from './infrastructure/entities/resource.entity';
import { BookingCustomerAdapter } from './infrastructure/cross-context/booking-customer.adapter';
import { BookingStaffAdapter } from './infrastructure/cross-context/booking-staff.adapter';
import { BookingController } from './infrastructure/controllers/booking.controller';
import { BookingLifecycleController } from './infrastructure/controllers/booking-lifecycle.controller';
import { BookingCompletionController } from './infrastructure/controllers/booking-completion.controller';
import { CronBookingController } from './infrastructure/controllers/cron-booking.controller';
import { ResourceController } from './infrastructure/controllers/resource.controller';
import { ScheduleAvailabilityController } from './infrastructure/controllers/schedule-availability.controller';
import { ScheduleAvailabilitySummaryController } from './infrastructure/controllers/schedule-availability-summary.controller';
import { ScheduleClosureController } from './infrastructure/controllers/schedule-closure.controller';
import { ScheduleOpeningController } from './infrastructure/controllers/schedule-opening.controller';
import { ServiceController } from './infrastructure/controllers/service.controller';
import { BookingPlatformAdapter } from './infrastructure/cross-context/booking-platform.adapter';
import { TypeOrmBookingAvailabilityAdapter } from './infrastructure/cross-context/typeorm-booking-availability.adapter';
import { TypeOrmBookingRepository } from './infrastructure/repositories/typeorm-booking.repository';
import { TypeOrmScheduleClosureRepository } from './infrastructure/repositories/typeorm-schedule-closure.repository';
import { TypeOrmScheduleOpeningRepository } from './infrastructure/repositories/typeorm-schedule-opening.repository';
import { TypeOrmResourceRepository } from './infrastructure/repositories/typeorm-resource.repository';
import { CachingServiceRepository } from './infrastructure/repositories/caching-service.repository';
import { TypeOrmServiceRepository } from './infrastructure/repositories/typeorm-service.repository';
import { AvailabilityService } from './domain/services/availability.service';
import { SharedCacheModule } from '../../shared/infrastructure/cache/shared-cache.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceEntity,
      ScheduleClosureEntity,
      ScheduleOpeningEntity,
      BookingEntity,
      BookingLineEntity,
      ResourceEntity,
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
    ResourceController,
    CronBookingController,
  ],
  providers: [
    TypeOrmServiceRepository,
    { provide: SERVICE_REPOSITORY, useClass: CachingServiceRepository },
    { provide: SCHEDULE_CLOSURE_REPOSITORY, useClass: TypeOrmScheduleClosureRepository },
    { provide: SCHEDULE_OPENING_REPOSITORY, useClass: TypeOrmScheduleOpeningRepository },
    { provide: RESOURCE_REPOSITORY, useClass: TypeOrmResourceRepository },
    { provide: BOOKING_PLATFORM_PORT, useClass: BookingPlatformAdapter },
    { provide: BOOKING_AVAILABILITY_PORT, useClass: TypeOrmBookingAvailabilityAdapter },
    { provide: BOOKING_REPOSITORY, useClass: TypeOrmBookingRepository },
    { provide: BOOKING_CUSTOMER_PORT, useClass: BookingCustomerAdapter },
    { provide: BOOKING_STAFF_PORT, useClass: BookingStaffAdapter },
    AvailabilityService,
    BookingReminderJob,
    AdminScheduleReminderJob,
    BookingReminderTriggerHandler,
    AdminScheduleReminderTriggerHandler,
    BookingSlotConflictService,
    PhotoExistenceService,
    ActivateServiceUseCase,
    CreateServiceUseCase,
    RequestBookingUseCase,
    RequestAuthenticatedBookingUseCase,
    GetServicesUseCase,
    GetServiceByIdUseCase,
    GetBookingByIdUseCase,
    UpdateServiceUseCase,
    DeactivateServiceUseCase,
    CloseScheduleUseCase,
    RemoveClosureUseCase,
    ListClosuresUseCase,
    OpenScheduleUseCase,
    RemoveScheduleOpeningUseCase,
    ListOpeningsUseCase,
    GetAvailabilityUseCase,
    GetAvailabilitySummaryUseCase,
    ApproveBookingUseCase,
    RejectBookingUseCase,
    RequestMoreInfoUseCase,
    SubmitBookingInfoUseCase,
    SubmitGuestBookingInfoUseCase,
    ListBookingsUseCase,
    CancelBookingAsCustomerUseCase,
    CancelBookingAsAdminUseCase,
    RescheduleBookingUseCase,
    CompleteBookingUseCase,
    GenerateAttachmentSignedUrlUseCase,
    CreateResourceUseCase,
    UpdateResourceUseCase,
    StaffWrapValidationService,
    DeactivateResourceUseCase,
    ReactivateResourceUseCase,
    ListResourcesUseCase,
    CascadeStaffDeactivationUseCase,
    StaffDeactivatedHandler,
  ],
  exports: [GetBookingByIdUseCase, GetServicesUseCase],
})
export class BookingModule {}
