import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { PlatformModule } from '../platform/platform.module';
import { StaffModule } from '../staff/staff.module';
import { NOTIFICATION_DISPATCHER } from './application/ports/notification-dispatcher.port';
import { NOTIFICATION_LOG_REPOSITORY } from './application/ports/notification-log-repository.port';
import { NOTIFICATION_STAFF_PORT } from './application/ports/notification-staff.port';
import { NOTIFICATION_TENANT_PORT } from './application/ports/notification-tenant.port';
import { SendStaffInvitationUseCase } from './application/use-cases/send-staff-invitation/send-staff-invitation.use-case';
import { SendBookingRequestedNotificationUseCase } from './application/use-cases/send-booking-requested-notification/send-booking-requested-notification.use-case';
import { StaffInfoAdapter } from './infrastructure/cross-context/staff-info.adapter';
import { TenantInfoAdapter } from './infrastructure/cross-context/tenant-info.adapter';
import { DELIVERY_CHANNEL } from './application/ports/delivery-channel.port';
import { SmtpEmailAdapter } from './infrastructure/delivery/smtp-email.adapter';
import { NotificationDispatcherAdapter } from './infrastructure/delivery/notification-dispatcher.adapter';
import { NotificationLogEntity } from './infrastructure/entities/notification-log.entity';
import { StaffInvitedHandler } from './infrastructure/events/staff-invited.handler';
import { BookingRequestedHandler } from './infrastructure/events/booking-requested.handler';
import { TypeOrmNotificationLogRepository } from './infrastructure/repositories/typeorm-notification-log.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationLogEntity]),
    TransactionManagerModule,
    StaffModule,
    PlatformModule,
  ],
  providers: [
    { provide: NOTIFICATION_LOG_REPOSITORY, useClass: TypeOrmNotificationLogRepository },
    SmtpEmailAdapter,
    {
      provide: DELIVERY_CHANNEL,
      useFactory: (smtp: SmtpEmailAdapter) => [smtp],
      inject: [SmtpEmailAdapter],
    },
    { provide: NOTIFICATION_DISPATCHER, useClass: NotificationDispatcherAdapter },
    { provide: NOTIFICATION_STAFF_PORT, useClass: StaffInfoAdapter },
    { provide: NOTIFICATION_TENANT_PORT, useClass: TenantInfoAdapter },
    SendStaffInvitationUseCase,
    SendBookingRequestedNotificationUseCase,
    StaffInvitedHandler,
    BookingRequestedHandler,
  ],
})
export class NotificationModule {}
