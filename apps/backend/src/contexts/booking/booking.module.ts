import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventBusModule } from '../../shared/infrastructure/event-bus.module';
import { TenantModule } from '../../shared/tenant/tenant.module';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { CustomerModule } from '../customer/customer.module';
import { PlatformSettingsModule } from '../platform/platform-settings.module';
import { BOOKING_AVAILABILITY_PORT } from './application/ports/booking-availability.port';
import { BOOKING_REPOSITORY } from './application/ports/booking-repository.port';
import { CUSTOMER_PROFILE_PORT } from './application/ports/customer-profile.port';
import { SCHEDULE_CLOSURE_REPOSITORY } from './application/ports/schedule-closure-repository.port';
import { SCHEDULE_OPENING_REPOSITORY } from './application/ports/schedule-opening-repository.port';
import { SCHEDULE_TENANT_SETTINGS_PORT } from './application/ports/schedule-tenant-settings.port';
import { SERVICE_REPOSITORY } from './application/ports/service-repository.port';
import { CloseScheduleUseCase } from './application/use-cases/close-schedule.use-case';
import { CreateServiceUseCase } from './application/use-cases/create-service.use-case';
import { RequestAuthenticatedBookingUseCase } from './application/use-cases/request-authenticated-booking.use-case';
import { RequestBookingUseCase } from './application/use-cases/request-booking.use-case';
import { DeactivateServiceUseCase } from './application/use-cases/deactivate-service.use-case';
import { GetAvailabilityUseCase } from './application/use-cases/get-availability.use-case';
import { GetAvailabilitySummaryUseCase } from './application/use-cases/get-availability-summary.use-case';
import { ListClosuresUseCase } from './application/use-cases/list-closures.use-case';
import { ListOpeningsUseCase } from './application/use-cases/list-openings.use-case';
import { ListServicesUseCase } from './application/use-cases/list-services.use-case';
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
import { GetBookingUseCase } from './application/use-cases/get-booking.use-case';
import { CancelBookingAsCustomerUseCase } from './application/use-cases/cancel-booking-as-customer.use-case';
import { CancelBookingAsAdminUseCase } from './application/use-cases/cancel-booking-as-admin.use-case';
import { BookingSlotConflictService } from './application/services/booking-slot-conflict.service';
import { BookingEntity } from './infrastructure/entities/booking.entity';
import { BookingLineEntity } from './infrastructure/entities/booking-line.entity';
import { ScheduleClosureEntity } from './infrastructure/entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from './infrastructure/entities/schedule-opening.entity';
import { ServiceEntity } from './infrastructure/entities/service.entity';
import { CustomerProfileAdapter } from './infrastructure/adapters/customer-profile.adapter';
import { BookingController } from './infrastructure/controllers/booking.controller';
import { ScheduleAvailabilityController } from './infrastructure/controllers/schedule-availability.controller';
import { ScheduleAvailabilitySummaryController } from './infrastructure/controllers/schedule-availability-summary.controller';
import { ScheduleClosureController } from './infrastructure/controllers/schedule-closure.controller';
import { ScheduleOpeningController } from './infrastructure/controllers/schedule-opening.controller';
import { ServiceController } from './infrastructure/controllers/service.controller';
import { ScheduleTenantSettingsAdapter } from './infrastructure/cross-context/schedule-tenant-settings.adapter';
import { TypeOrmBookingAvailabilityAdapter } from './infrastructure/cross-context/typeorm-booking-availability.adapter';
import { TypeOrmBookingRepository } from './infrastructure/repositories/typeorm-booking.repository';
import { TypeOrmScheduleClosureRepository } from './infrastructure/repositories/typeorm-schedule-closure.repository';
import { TypeOrmScheduleOpeningRepository } from './infrastructure/repositories/typeorm-schedule-opening.repository';
import { TypeOrmServiceRepository } from './infrastructure/repositories/typeorm-service.repository';
import { AvailabilityService } from './domain/services/availability.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceEntity,
      ScheduleClosureEntity,
      ScheduleOpeningEntity,
      BookingEntity,
      BookingLineEntity,
    ]),
    EventBusModule,
    TenantModule,
    TransactionManagerModule,
    CustomerModule,
    PlatformSettingsModule,
  ],
  controllers: [
    BookingController,
    ServiceController,
    ScheduleClosureController,
    ScheduleOpeningController,
    ScheduleAvailabilityController,
    ScheduleAvailabilitySummaryController,
  ],
  providers: [
    { provide: SERVICE_REPOSITORY, useClass: TypeOrmServiceRepository },
    { provide: SCHEDULE_CLOSURE_REPOSITORY, useClass: TypeOrmScheduleClosureRepository },
    { provide: SCHEDULE_OPENING_REPOSITORY, useClass: TypeOrmScheduleOpeningRepository },
    { provide: SCHEDULE_TENANT_SETTINGS_PORT, useClass: ScheduleTenantSettingsAdapter },
    { provide: BOOKING_AVAILABILITY_PORT, useClass: TypeOrmBookingAvailabilityAdapter },
    { provide: BOOKING_REPOSITORY, useClass: TypeOrmBookingRepository },
    { provide: CUSTOMER_PROFILE_PORT, useClass: CustomerProfileAdapter },
    AvailabilityService,
    BookingSlotConflictService,
    CreateServiceUseCase,
    RequestBookingUseCase,
    RequestAuthenticatedBookingUseCase,
    ListServicesUseCase,
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
    GetBookingUseCase,
    CancelBookingAsCustomerUseCase,
    CancelBookingAsAdminUseCase,
  ],
})
export class BookingModule {}
