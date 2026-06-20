import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { BookingModule } from '../booking/booking.module';
import { PlatformModule } from '../platform/platform.module';
import { StaffModule } from '../staff/staff.module';
import { CustomerModule } from '../customer/customer.module';
import { NOTIFICATION_CUSTOMER_PORT } from './application/ports/notification-customer.port';
import { NOTIFICATION_DISPATCHER } from './application/ports/notification-dispatcher.port';
import { NOTIFICATION_LOG_REPOSITORY } from './application/ports/notification-log-repository.port';
import { NOTIFICATION_PROCESSED_EVENT_REPOSITORY } from './application/ports/processed-event-repository.port';
import { NOTIFICATION_BOOKING_PORT } from './application/ports/notification-booking.port';
import { NOTIFICATION_STAFF_PORT } from './application/ports/notification-staff.port';
import { NOTIFICATION_PLATFORM_PORT } from './application/ports/notification-platform.port';
import { LOCALIZATION_PORT } from './application/ports/localization.port';
import { SendStaffInvitationUseCase } from './application/use-cases/send-staff-invitation/send-staff-invitation.use-case';
import { SendBookingRequestedNotificationUseCase } from './application/use-cases/send-booking-requested-notification/send-booking-requested-notification.use-case';
import { SendBookingApprovedNotificationUseCase } from './application/use-cases/send-booking-approved-notification/send-booking-approved-notification.use-case';
import { SendBookingRejectedNotificationUseCase } from './application/use-cases/send-booking-rejected-notification/send-booking-rejected-notification.use-case';
import { SendBookingInfoRequestedNotificationUseCase } from './application/use-cases/send-booking-info-requested-notification/send-booking-info-requested-notification.use-case';
import { SendBookingInfoSubmittedNotificationUseCase } from './application/use-cases/send-booking-info-submitted-notification/send-booking-info-submitted-notification.use-case';
import { SendBookingCancelledNotificationUseCase } from './application/use-cases/send-booking-cancelled-notification/send-booking-cancelled-notification.use-case';
import { SendBookingRescheduledNotificationUseCase } from './application/use-cases/send-booking-rescheduled-notification/send-booking-rescheduled-notification.use-case';
import { SendServicePointsEarnedNotificationUseCase } from './application/use-cases/send-service-points-earned-notification/send-service-points-earned-notification.use-case';
import { SendBookingReminderDueNotificationUseCase } from './application/use-cases/send-booking-reminder-due-notification/send-booking-reminder-due-notification.use-case';
import { SendBookingReminderDueTodayNotificationUseCase } from './application/use-cases/send-booking-reminder-due-today-notification/send-booking-reminder-due-today-notification.use-case';
import { SendAdminDailyScheduleReminderNotificationUseCase } from './application/use-cases/send-admin-daily-schedule-reminder-notification/send-admin-daily-schedule-reminder-notification.use-case';
import { SendPointsExpiringSoonNotificationUseCase } from './application/use-cases/send-points-expiring-soon-notification/send-points-expiring-soon-notification.use-case';
import { NotificationCustomerAdapter } from './infrastructure/cross-context/notification-customer.adapter';
import { NotificationBookingAdapter } from './infrastructure/cross-context/notification-booking.adapter';
import { NotificationStaffAdapter } from './infrastructure/cross-context/notification-staff.adapter';
import { NotificationPlatformAdapter } from './infrastructure/cross-context/notification-platform.adapter';
import { JsonLocalizationAdapter } from './infrastructure/adapters/json-localization.adapter';
import { DELIVERY_CHANNEL } from './application/ports/delivery-channel.port';
import { EMAIL_SENDER } from './application/ports/email-sender.port';
import { MailhogEmailAdapter } from './infrastructure/delivery/mailhog-email.adapter';
import { SendGridEmailAdapter } from './infrastructure/delivery/sendgrid-email.adapter';
import { EmailDeliveryChannelAdapter } from './infrastructure/delivery/email-delivery-channel.adapter';
import { NotificationDispatcherAdapter } from './infrastructure/delivery/notification-dispatcher.adapter';
import { NotificationLogEntity } from './infrastructure/entities/notification-log.entity';
import { StaffInvitedHandler } from './infrastructure/events/staff-invited.handler';
import { BookingRequestedHandler } from './infrastructure/events/booking-requested.handler';
import { BookingApprovedHandler } from './infrastructure/events/booking-approved.handler';
import { BookingRejectedHandler } from './infrastructure/events/booking-rejected.handler';
import { BookingInfoRequestedHandler } from './infrastructure/events/booking-info-requested.handler';
import { BookingInfoSubmittedHandler } from './infrastructure/events/booking-info-submitted.handler';
import { BookingCancelledHandler } from './infrastructure/events/booking-cancelled.handler';
import { BookingRescheduledHandler } from './infrastructure/events/booking-rescheduled.handler';
import { ServicePointsEarnedHandler } from './infrastructure/events/service-points-earned.handler';
import { BookingReminderHandler } from './infrastructure/events/booking-reminder.handler';
import { AdminDailyScheduleReminderHandler } from './infrastructure/events/admin-daily-schedule-reminder.handler';
import { PointsExpiringSoonHandler } from './infrastructure/events/points-expiring-soon.handler';
import { TypeOrmNotificationLogRepository } from './infrastructure/repositories/typeorm-notification-log.repository';
import { TypeOrmNotificationProcessedEventRepository } from './infrastructure/repositories/typeorm-processed-event.repository';
import { TypeOrmNotificationTemplateRepository } from './infrastructure/repositories/typeorm-notification-template.repository';
import { NotificationProcessedEventEntity } from './infrastructure/entities/processed-event.entity';
import { NotificationTemplateEntity } from './infrastructure/entities/notification-template.entity';
import { NOTIFICATION_TEMPLATE_REPOSITORY } from './application/ports/notification-template-repository.port';
import { SeedDefaultTemplatesUseCase } from './application/use-cases/seed-default-templates/seed-default-templates.use-case';
import { TenantProvisionedNotificationHandler } from './infrastructure/events/tenant-provisioned.handler';
import { DeadLetterHandler } from './infrastructure/events/dead-letter.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationLogEntity,
      NotificationProcessedEventEntity,
      NotificationTemplateEntity,
    ]),
    TransactionManagerModule,
    BookingModule,
    StaffModule,
    PlatformModule,
    CustomerModule,
  ],
  providers: [
    { provide: NOTIFICATION_LOG_REPOSITORY, useClass: TypeOrmNotificationLogRepository },
    {
      provide: NOTIFICATION_PROCESSED_EVENT_REPOSITORY,
      useClass: TypeOrmNotificationProcessedEventRepository,
    },
    { provide: NOTIFICATION_TEMPLATE_REPOSITORY, useClass: TypeOrmNotificationTemplateRepository },
    SeedDefaultTemplatesUseCase,
    TenantProvisionedNotificationHandler,
    MailhogEmailAdapter,
    SendGridEmailAdapter,
    {
      provide: EMAIL_SENDER,
      useFactory: (
        mailhog: MailhogEmailAdapter,
        sendgrid: SendGridEmailAdapter,
        config: ConfigService,
      ) => (config.get('EMAIL_ADAPTER') === 'sendgrid' ? sendgrid : mailhog),
      inject: [MailhogEmailAdapter, SendGridEmailAdapter, ConfigService],
    },
    EmailDeliveryChannelAdapter,
    {
      provide: DELIVERY_CHANNEL,
      useFactory: (email: EmailDeliveryChannelAdapter) => [email],
      inject: [EmailDeliveryChannelAdapter],
    },
    { provide: NOTIFICATION_DISPATCHER, useClass: NotificationDispatcherAdapter },
    { provide: NOTIFICATION_STAFF_PORT, useClass: NotificationStaffAdapter },
    { provide: NOTIFICATION_PLATFORM_PORT, useClass: NotificationPlatformAdapter },
    { provide: NOTIFICATION_CUSTOMER_PORT, useClass: NotificationCustomerAdapter },
    { provide: NOTIFICATION_BOOKING_PORT, useClass: NotificationBookingAdapter },
    { provide: LOCALIZATION_PORT, useClass: JsonLocalizationAdapter },
    SendStaffInvitationUseCase,
    SendBookingRequestedNotificationUseCase,
    SendBookingApprovedNotificationUseCase,
    SendBookingRejectedNotificationUseCase,
    SendBookingInfoRequestedNotificationUseCase,
    SendBookingInfoSubmittedNotificationUseCase,
    SendBookingCancelledNotificationUseCase,
    SendBookingRescheduledNotificationUseCase,
    SendServicePointsEarnedNotificationUseCase,
    SendBookingReminderDueNotificationUseCase,
    SendBookingReminderDueTodayNotificationUseCase,
    SendAdminDailyScheduleReminderNotificationUseCase,
    SendPointsExpiringSoonNotificationUseCase,
    StaffInvitedHandler,
    BookingRequestedHandler,
    BookingApprovedHandler,
    BookingRejectedHandler,
    BookingInfoRequestedHandler,
    BookingInfoSubmittedHandler,
    BookingCancelledHandler,
    BookingRescheduledHandler,
    ServicePointsEarnedHandler,
    BookingReminderHandler,
    AdminDailyScheduleReminderHandler,
    PointsExpiringSoonHandler,
    DeadLetterHandler,
  ],
})
export class NotificationModule {}
