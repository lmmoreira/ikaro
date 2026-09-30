import { Provider } from '@nestjs/common';
import { BOOKING_AVAILABILITY_PORT } from './application/ports/booking-availability.port';
import { TENANT_LOCK_PORT } from './application/ports/tenant-lock.port';
import { BOOKING_REPOSITORY } from './application/ports/booking-repository.port';
import { BOOKING_CUSTOMER_PORT } from './application/ports/booking-customer.port';
import { BOOKING_PLATFORM_PORT } from './application/ports/booking-platform.port';
import { BOOKING_STAFF_PORT } from './application/ports/booking-staff.port';
import { RESOURCE_REPOSITORY } from './application/ports/resource-repository.port';
import { RESOURCE_OCCUPANCY_REPOSITORY } from './application/ports/resource-occupancy-repository.port';
import { SCHEDULE_CLOSURE_REPOSITORY } from './application/ports/schedule-closure-repository.port';
import { SCHEDULE_OPENING_REPOSITORY } from './application/ports/schedule-opening-repository.port';
import { SERVICE_REPOSITORY } from './application/ports/service-repository.port';
import { SERVICE_INTAKE_SCHEMA_REPOSITORY } from './application/ports/service-intake-schema-repository.port';
import { BOOKING_QUOTE_REVISION_REPOSITORY } from './application/ports/booking-quote-revision-repository.port';
import { RECURRING_BOOKING_SCHEDULE_REPOSITORY } from './application/ports/recurring-booking-schedule-repository.port';
import { FUTURE_COMMITMENT_EXCEPTION_REPOSITORY } from './application/ports/future-commitment-exception-repository.port';
import { RaiseFutureCommitmentExceptionsForResourceUseCase } from './application/use-cases/raise-future-commitment-exceptions-for-resource.use-case';
import { ListFutureCommitmentExceptionsUseCase } from './application/use-cases/list-future-commitment-exceptions.use-case';
import { ResolveFutureCommitmentExceptionsUseCase } from './application/use-cases/resolve-future-commitment-exceptions.use-case';
import { DismissFutureCommitmentExceptionsUseCase } from './application/use-cases/dismiss-future-commitment-exceptions.use-case';
import { LogFutureCommitmentExceptionEventUseCase } from './application/use-cases/log-future-commitment-exception-event.use-case';
import { FutureCommitmentExceptionEventsHandler } from './infrastructure/events/future-commitment-exception-events.handler';
import { TypeOrmFutureCommitmentExceptionRepository } from './infrastructure/repositories/typeorm-future-commitment-exception.repository';
import { AdminScheduleReminderJob } from './application/jobs/admin-schedule-reminder.job';
import { BookingReminderJob } from './application/jobs/booking-reminder.job';
import { ResourceOccupancyRetentionPurgeJob } from './application/jobs/resource-occupancy-retention-purge.job';
import { BookingReminderTriggerHandler } from './infrastructure/events/booking-reminder-trigger.handler';
import { AdminScheduleReminderTriggerHandler } from './infrastructure/events/admin-schedule-reminder-trigger.handler';
import { ResourceOccupancyRetentionPurgeTriggerHandler } from './infrastructure/events/resource-occupancy-retention-purge-trigger.handler';
import { StaffDeactivatedHandler } from './infrastructure/events/staff-deactivated.handler';
import { TenantProvisionedBookingHandler } from './infrastructure/events/tenant-provisioned.handler';
import { RecurringBookingScheduleEventsHandler } from './infrastructure/events/recurring-booking-schedule-events.handler';
import { CreateTenantLocationResourceUseCase } from './application/use-cases/create-tenant-location-resource.use-case';
import { CloseScheduleUseCase } from './application/use-cases/close-schedule.use-case';
import { ActivateServiceUseCase } from './application/use-cases/activate-service.use-case';
import { CreateResourceUseCase } from './application/use-cases/create-resource.use-case';
import { GetResourceByIdUseCase } from './application/use-cases/get-resource-by-id.use-case';
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
import { GetScheduleDayGridUseCase } from './application/use-cases/get-schedule-day-grid.use-case';
import { GetServiceByIdUseCase } from './application/use-cases/get-service-by-id.use-case';
import { ListClosuresUseCase } from './application/use-cases/list-closures.use-case';
import { ListOpeningsUseCase } from './application/use-cases/list-openings.use-case';
import { GetServicesUseCase } from './application/use-cases/get-services.use-case';
import { OpenScheduleUseCase } from './application/use-cases/open-schedule.use-case';
import { RemoveClosureUseCase } from './application/use-cases/remove-closure.use-case';
import { RemoveScheduleOpeningUseCase } from './application/use-cases/remove-schedule-opening.use-case';
import { UpdateServiceUseCase } from './application/use-cases/update-service.use-case';
import { UpdateServiceResourceRequirementsUseCase } from './application/use-cases/update-service-resource-requirements.use-case';
import { UpdateServiceLegsUseCase } from './application/use-cases/update-service-legs.use-case';
import { UpdateServiceBookingPolicyUseCase } from './application/use-cases/update-service-booking-policy.use-case';
import { PublishServiceIntakeSchemaUseCase } from './application/use-cases/publish-service-intake-schema.use-case';
import { GetServiceIntakeSchemaUseCase } from './application/use-cases/get-service-intake-schema.use-case';
import { ApproveBookingUseCase } from './application/use-cases/approve-booking.use-case';
import { RejectBookingUseCase } from './application/use-cases/reject-booking.use-case';
import { RequestMoreInfoUseCase } from './application/use-cases/request-more-info.use-case';
import { SubmitBookingInfoUseCase } from './application/use-cases/submit-booking-info.use-case';
import { SubmitGuestBookingInfoUseCase } from './application/use-cases/submit-guest-booking-info.use-case';
import { ListBookingsUseCase } from './application/use-cases/list-bookings.use-case';
import { CancelBookingAsCustomerUseCase } from './application/use-cases/cancel-booking-as-customer.use-case';
import { CancelBookingAsAdminUseCase } from './application/use-cases/cancel-booking-as-admin.use-case';
import { RescheduleBookingUseCase } from './application/use-cases/reschedule-booking.use-case';
import { RescheduleBookingAsCustomerUseCase } from './application/use-cases/reschedule-booking-as-customer.use-case';
import { CompleteBookingUseCase } from './application/use-cases/complete-booking.use-case';
import { GenerateAttachmentSignedUrlUseCase } from './application/use-cases/generate-attachment-signed-url.use-case';
import { GetBookingByIdUseCase } from './application/use-cases/get-booking-by-id.use-case';
import { RequestRecurringBookingScheduleUseCase } from './application/use-cases/request-recurring-booking-schedule.use-case';
import { EndRecurringBookingScheduleUseCase } from './application/use-cases/end-recurring-booking-schedule.use-case';
import { ListRecurringBookingSchedulesUseCase } from './application/use-cases/list-recurring-booking-schedules.use-case';
import { LogRecurringBookingScheduleEventUseCase } from './application/use-cases/log-recurring-booking-schedule-event.use-case';
import { BookingSlotConflictService } from './application/services/booking-slot-conflict.service';
import { BookingQuoteService } from './application/services/booking-quote.service';
import { BookingIntakeValidationService } from './application/services/booking-intake-validation.service';
import { PhotoExistenceService } from './application/services/photo-existence.service';
import { BookingCustomerAdapter } from './infrastructure/cross-context/booking-customer.adapter';
import { BookingStaffAdapter } from './infrastructure/cross-context/booking-staff.adapter';
import { BookingPlatformAdapter } from './infrastructure/cross-context/booking-platform.adapter';
import { TypeOrmBookingAvailabilityAdapter } from './infrastructure/cross-context/typeorm-booking-availability.adapter';
import { TypeOrmBookingRepository } from './infrastructure/repositories/typeorm-booking.repository';
import { TypeOrmScheduleClosureRepository } from './infrastructure/repositories/typeorm-schedule-closure.repository';
import { TypeOrmScheduleOpeningRepository } from './infrastructure/repositories/typeorm-schedule-opening.repository';
import { TypeOrmTenantLockAdapter } from './infrastructure/repositories/typeorm-tenant-lock.adapter';
import { TypeOrmResourceRepository } from './infrastructure/repositories/typeorm-resource.repository';
import { TypeOrmResourceOccupancyRepository } from './infrastructure/repositories/typeorm-resource-occupancy.repository';
import { CachingServiceRepository } from './infrastructure/repositories/caching-service.repository';
import { TypeOrmServiceRepository } from './infrastructure/repositories/typeorm-service.repository';
import { TypeOrmServiceIntakeSchemaRepository } from './infrastructure/repositories/typeorm-service-intake-schema.repository';
import { TypeOrmBookingQuoteRevisionRepository } from './infrastructure/repositories/typeorm-booking-quote-revision.repository';
import { TypeOrmRecurringBookingScheduleRepository } from './infrastructure/repositories/typeorm-recurring-booking-schedule.repository';
import { AvailabilityService } from './domain/services/availability.service';

// Split out of booking.module.ts to stay under docs/CODE_STANDARDS.md's file-length limit — a
// plain data array, no logic, so the split carries no behavioral risk (mirrors the *.types.ts
// split precedent used elsewhere in this context).
export const bookingModuleProviders: Provider[] = [
  TypeOrmServiceRepository,
  { provide: SERVICE_REPOSITORY, useClass: CachingServiceRepository },
  { provide: SERVICE_INTAKE_SCHEMA_REPOSITORY, useClass: TypeOrmServiceIntakeSchemaRepository },
  {
    provide: BOOKING_QUOTE_REVISION_REPOSITORY,
    useClass: TypeOrmBookingQuoteRevisionRepository,
  },
  {
    provide: RECURRING_BOOKING_SCHEDULE_REPOSITORY,
    useClass: TypeOrmRecurringBookingScheduleRepository,
  },
  {
    provide: FUTURE_COMMITMENT_EXCEPTION_REPOSITORY,
    useClass: TypeOrmFutureCommitmentExceptionRepository,
  },
  { provide: SCHEDULE_CLOSURE_REPOSITORY, useClass: TypeOrmScheduleClosureRepository },
  { provide: SCHEDULE_OPENING_REPOSITORY, useClass: TypeOrmScheduleOpeningRepository },
  { provide: RESOURCE_REPOSITORY, useClass: TypeOrmResourceRepository },
  { provide: RESOURCE_OCCUPANCY_REPOSITORY, useClass: TypeOrmResourceOccupancyRepository },
  { provide: BOOKING_PLATFORM_PORT, useClass: BookingPlatformAdapter },
  { provide: BOOKING_AVAILABILITY_PORT, useClass: TypeOrmBookingAvailabilityAdapter },
  { provide: TENANT_LOCK_PORT, useClass: TypeOrmTenantLockAdapter },
  { provide: BOOKING_REPOSITORY, useClass: TypeOrmBookingRepository },
  { provide: BOOKING_CUSTOMER_PORT, useClass: BookingCustomerAdapter },
  { provide: BOOKING_STAFF_PORT, useClass: BookingStaffAdapter },
  AvailabilityService,
  BookingReminderJob,
  AdminScheduleReminderJob,
  ResourceOccupancyRetentionPurgeJob,
  BookingReminderTriggerHandler,
  AdminScheduleReminderTriggerHandler,
  ResourceOccupancyRetentionPurgeTriggerHandler,
  BookingSlotConflictService,
  BookingQuoteService,
  BookingIntakeValidationService,
  PhotoExistenceService,
  ActivateServiceUseCase,
  CreateServiceUseCase,
  RequestBookingUseCase,
  RequestAuthenticatedBookingUseCase,
  GetServicesUseCase,
  GetServiceByIdUseCase,
  GetBookingByIdUseCase,
  UpdateServiceUseCase,
  UpdateServiceResourceRequirementsUseCase,
  UpdateServiceLegsUseCase,
  UpdateServiceBookingPolicyUseCase,
  PublishServiceIntakeSchemaUseCase,
  GetServiceIntakeSchemaUseCase,
  DeactivateServiceUseCase,
  CloseScheduleUseCase,
  RemoveClosureUseCase,
  ListClosuresUseCase,
  OpenScheduleUseCase,
  RemoveScheduleOpeningUseCase,
  ListOpeningsUseCase,
  GetAvailabilityUseCase,
  GetAvailabilitySummaryUseCase,
  GetScheduleDayGridUseCase,
  ApproveBookingUseCase,
  RejectBookingUseCase,
  RequestMoreInfoUseCase,
  SubmitBookingInfoUseCase,
  SubmitGuestBookingInfoUseCase,
  ListBookingsUseCase,
  CancelBookingAsCustomerUseCase,
  CancelBookingAsAdminUseCase,
  RescheduleBookingUseCase,
  RescheduleBookingAsCustomerUseCase,
  CompleteBookingUseCase,
  GenerateAttachmentSignedUrlUseCase,
  CreateResourceUseCase,
  GetResourceByIdUseCase,
  UpdateResourceUseCase,
  StaffWrapValidationService,
  DeactivateResourceUseCase,
  ReactivateResourceUseCase,
  ListResourcesUseCase,
  CascadeStaffDeactivationUseCase,
  StaffDeactivatedHandler,
  CreateTenantLocationResourceUseCase,
  TenantProvisionedBookingHandler,
  RequestRecurringBookingScheduleUseCase,
  EndRecurringBookingScheduleUseCase,
  ListRecurringBookingSchedulesUseCase,
  LogRecurringBookingScheduleEventUseCase,
  RecurringBookingScheduleEventsHandler,
  RaiseFutureCommitmentExceptionsForResourceUseCase,
  ListFutureCommitmentExceptionsUseCase,
  ResolveFutureCommitmentExceptionsUseCase,
  DismissFutureCommitmentExceptionsUseCase,
  LogFutureCommitmentExceptionEventUseCase,
  FutureCommitmentExceptionEventsHandler,
];
