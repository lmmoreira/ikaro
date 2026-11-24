import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { ApplicationConfigModule } from '../../shared/infrastructure/application-config.module';
import { BookingModule } from '../booking/booking.module';
import { PlatformModule } from '../platform/platform.module';
import { StaffModule } from '../staff/staff.module';
import { CustomerModule } from '../customer/customer.module';
import { NOTIFICATION_CUSTOMER_PORT } from './application/ports/notification-customer.port';
import { NOTIFICATION_DISPATCHER } from './application/ports/notification-dispatcher.port';
import { NOTIFICATION_LOG_REPOSITORY } from './application/ports/notification-log-repository.port';
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
import { SendBookingApprovalExpiredNotificationUseCase } from './application/use-cases/send-booking-approval-expired-notification/send-booking-approval-expired-notification.use-case';
import { SendBookingCancelledNotificationUseCase } from './application/use-cases/send-booking-cancelled-notification/send-booking-cancelled-notification.use-case';
import { SendBookingResourceReassignedNotificationUseCase } from './application/use-cases/send-booking-resource-reassigned-notification/send-booking-resource-reassigned-notification.use-case';
import { SendResourceDeactivationImpactNotificationUseCase } from './application/use-cases/send-resource-deactivation-impact-notification/send-resource-deactivation-impact-notification.use-case';
import { SendBookingNoShowNotificationUseCase } from './application/use-cases/send-booking-no-show-notification/send-booking-no-show-notification.use-case';
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
import { BrevoEmailAdapter } from './infrastructure/delivery/brevo-email.adapter';
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
import { BookingResourceReassignedHandler } from './infrastructure/events/booking-resource-reassigned.handler';
import { ResourceDeactivationImpactHandler } from './infrastructure/events/resource-deactivation-impact.handler';
import { BookingNoShowHandler } from './infrastructure/events/booking-no-show.handler';
import { BookingRescheduledHandler } from './infrastructure/events/booking-rescheduled.handler';
import { ServicePointsEarnedHandler } from './infrastructure/events/service-points-earned.handler';
import { BookingReminderHandler } from './infrastructure/events/booking-reminder.handler';
import { TenantUnavailableNoticeHandler } from './infrastructure/events/tenant-unavailable-notice.handler';
import { SendTenantUnavailableNoticeNotificationUseCase } from './application/use-cases/send-tenant-unavailable-notice-notification/send-tenant-unavailable-notice-notification.use-case';
import { AdminDailyScheduleReminderHandler } from './infrastructure/events/admin-daily-schedule-reminder.handler';
import { PointsExpiringSoonHandler } from './infrastructure/events/points-expiring-soon.handler';
import { TypeOrmNotificationLogRepository } from './infrastructure/repositories/typeorm-notification-log.repository';
import { TypeOrmNotificationTemplateRepository } from './infrastructure/repositories/typeorm-notification-template.repository';
import { NotificationTemplateEntity } from './infrastructure/entities/notification-template.entity';
import { NOTIFICATION_TEMPLATE_REPOSITORY } from './application/ports/notification-template-repository.port';
import { SeedDefaultTemplatesUseCase } from './application/use-cases/seed-default-templates/seed-default-templates.use-case';
import { TenantProvisionedNotificationHandler } from './infrastructure/events/tenant-provisioned.handler';
import { SendRecurringScheduleCreatedNotificationUseCase } from './application/use-cases/send-recurring-schedule-created-notification/send-recurring-schedule-created-notification.use-case';
import { SendRecurringScheduleApprovalRequestedNotificationUseCase } from './application/use-cases/send-recurring-schedule-approval-requested-notification/send-recurring-schedule-approval-requested-notification.use-case';
import { SendRecurringScheduleRejectedNotificationUseCase } from './application/use-cases/send-recurring-schedule-rejected-notification/send-recurring-schedule-rejected-notification.use-case';
import { SendRecurringScheduleEndedNotificationUseCase } from './application/use-cases/send-recurring-schedule-ended-notification/send-recurring-schedule-ended-notification.use-case';
import { SendRecurringScheduleRenewalNotificationUseCase } from './application/use-cases/send-recurring-schedule-renewal-notification/send-recurring-schedule-renewal-notification.use-case';
import { RecurringScheduleCreatedNotificationHandler } from './infrastructure/events/recurring-schedule-created.handler';
import { RecurringScheduleApprovalRequestedNotificationHandler } from './infrastructure/events/recurring-schedule-approval-requested.handler';
import { RecurringScheduleRejectedNotificationHandler } from './infrastructure/events/recurring-schedule-rejected.handler';
import { RecurringScheduleEndedNotificationHandler } from './infrastructure/events/recurring-schedule-ended.handler';
import { RecurringScheduleRenewalNotificationHandler } from './infrastructure/events/recurring-schedule-renewal.handler';
import { SendAvailabilityAlertMatchedEmailService } from './application/services/send-availability-alert-matched-email.service';
import { SendAvailabilityAlertMatchedNotificationUseCase } from './application/use-cases/send-availability-alert-matched-notification/send-availability-alert-matched-notification.use-case';
import { AvailabilityAlertMatchedNotificationHandler } from './infrastructure/events/availability-alert-matched.handler';
import { AVAILABILITY_ALERT_OUTCOME_PORT } from './application/ports/availability-alert-outcome.port';
import { NotificationAvailabilityAlertOutcomeAdapter } from './infrastructure/cross-context/notification-availability-alert-outcome.adapter';
import { DeadLetterHandler } from './infrastructure/events/dead-letter.handler';
import { SendChargeIssuedNotificationUseCase } from './application/use-cases/send-charge-issued-notification/send-charge-issued-notification.use-case';
import { ChargeIssuedNotificationHandler } from './infrastructure/events/charge-issued-notification.handler';
import { SendChargePaidNotificationUseCase } from './application/use-cases/send-charge-paid-notification/send-charge-paid-notification.use-case';
import { ChargePaidNotificationHandler } from './infrastructure/events/charge-paid-notification.handler';
import { SendSubscriptionPastDueNotificationUseCase } from './application/use-cases/send-subscription-past-due-notification/send-subscription-past-due-notification.use-case';
import { SubscriptionPastDueNotificationHandler } from './infrastructure/events/subscription-past-due-notification.handler';
import { SendSubscriptionSuspendedNotificationUseCase } from './application/use-cases/send-subscription-suspended-notification/send-subscription-suspended-notification.use-case';
import { SubscriptionSuspendedNotificationHandler } from './infrastructure/events/subscription-suspended-notification.handler';
import { SendSubscriptionReactivatedNotificationUseCase } from './application/use-cases/send-subscription-reactivated-notification/send-subscription-reactivated-notification.use-case';
import { SubscriptionReactivatedNotificationHandler } from './infrastructure/events/subscription-reactivated-notification.handler';
import { SendSubscriptionCancelledNotificationUseCase } from './application/use-cases/send-subscription-cancelled-notification/send-subscription-cancelled-notification.use-case';
import { SubscriptionCancelledNotificationHandler } from './infrastructure/events/subscription-cancelled-notification.handler';
import { SendPlanChangedNotificationUseCase } from './application/use-cases/send-plan-changed-notification/send-plan-changed-notification.use-case';
import { PlanChangedNotificationHandler } from './infrastructure/events/plan-changed-notification.handler';
import { SendBillingReminderNotificationUseCase } from './application/use-cases/send-billing-reminder-notification/send-billing-reminder-notification.use-case';
import { BillingReminderNotificationHandler } from './infrastructure/events/billing-reminder-notification.handler';
import { SendPriceChangeAnnouncedNotificationUseCase } from './application/use-cases/send-price-change-announced-notification/send-price-change-announced-notification.use-case';
import { PriceChangeAnnouncedNotificationHandler } from './infrastructure/events/price-change-announced-notification.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationLogEntity, NotificationTemplateEntity]),
    TransactionManagerModule,
    ApplicationConfigModule,
    BookingModule,
    StaffModule,
    PlatformModule,
    CustomerModule,
  ],
  providers: [
    { provide: NOTIFICATION_LOG_REPOSITORY, useClass: TypeOrmNotificationLogRepository },
    { provide: NOTIFICATION_TEMPLATE_REPOSITORY, useClass: TypeOrmNotificationTemplateRepository },
    SeedDefaultTemplatesUseCase,
    TenantProvisionedNotificationHandler,
    MailhogEmailAdapter,
    BrevoEmailAdapter,
    {
      provide: EMAIL_SENDER,
      useFactory: (
        mailhog: MailhogEmailAdapter,
        brevo: BrevoEmailAdapter,
        config: ConfigService,
      ) => (config.get('EMAIL_ADAPTER') === 'brevo' ? brevo : mailhog),
      inject: [MailhogEmailAdapter, BrevoEmailAdapter, ConfigService],
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
    {
      provide: AVAILABILITY_ALERT_OUTCOME_PORT,
      useClass: NotificationAvailabilityAlertOutcomeAdapter,
    },
    { provide: LOCALIZATION_PORT, useClass: JsonLocalizationAdapter },
    SendStaffInvitationUseCase,
    SendBookingRequestedNotificationUseCase,
    SendBookingApprovedNotificationUseCase,
    SendBookingRejectedNotificationUseCase,
    SendBookingInfoRequestedNotificationUseCase,
    SendBookingInfoSubmittedNotificationUseCase,
    SendBookingCancelledNotificationUseCase,
    SendBookingApprovalExpiredNotificationUseCase,
    SendTenantUnavailableNoticeNotificationUseCase,
    SendBookingNoShowNotificationUseCase,
    SendBookingResourceReassignedNotificationUseCase,
    SendResourceDeactivationImpactNotificationUseCase,
    SendBookingRescheduledNotificationUseCase,
    SendServicePointsEarnedNotificationUseCase,
    SendBookingReminderDueNotificationUseCase,
    SendBookingReminderDueTodayNotificationUseCase,
    SendAdminDailyScheduleReminderNotificationUseCase,
    SendPointsExpiringSoonNotificationUseCase,
    SendRecurringScheduleCreatedNotificationUseCase,
    SendRecurringScheduleApprovalRequestedNotificationUseCase,
    SendRecurringScheduleRejectedNotificationUseCase,
    SendRecurringScheduleEndedNotificationUseCase,
    SendRecurringScheduleRenewalNotificationUseCase,
    SendAvailabilityAlertMatchedEmailService,
    SendAvailabilityAlertMatchedNotificationUseCase,
    SendChargeIssuedNotificationUseCase,
    SendChargePaidNotificationUseCase,
    SendSubscriptionPastDueNotificationUseCase,
    SendSubscriptionSuspendedNotificationUseCase,
    SendSubscriptionReactivatedNotificationUseCase,
    SendSubscriptionCancelledNotificationUseCase,
    SendPlanChangedNotificationUseCase,
    SendBillingReminderNotificationUseCase,
    SendPriceChangeAnnouncedNotificationUseCase,
    StaffInvitedHandler,
    BookingRequestedHandler,
    BookingApprovedHandler,
    BookingRejectedHandler,
    BookingInfoRequestedHandler,
    BookingInfoSubmittedHandler,
    BookingCancelledHandler,
    BookingNoShowHandler,
    BookingResourceReassignedHandler,
    ResourceDeactivationImpactHandler,
    BookingRescheduledHandler,
    ServicePointsEarnedHandler,
    BookingReminderHandler,
    TenantUnavailableNoticeHandler,
    AdminDailyScheduleReminderHandler,
    PointsExpiringSoonHandler,
    RecurringScheduleCreatedNotificationHandler,
    RecurringScheduleApprovalRequestedNotificationHandler,
    RecurringScheduleRejectedNotificationHandler,
    RecurringScheduleEndedNotificationHandler,
    RecurringScheduleRenewalNotificationHandler,
    AvailabilityAlertMatchedNotificationHandler,
    DeadLetterHandler,
    ChargeIssuedNotificationHandler,
    ChargePaidNotificationHandler,
    SubscriptionPastDueNotificationHandler,
    SubscriptionSuspendedNotificationHandler,
    SubscriptionReactivatedNotificationHandler,
    SubscriptionCancelledNotificationHandler,
    PlanChangedNotificationHandler,
    BillingReminderNotificationHandler,
    PriceChangeAnnouncedNotificationHandler,
  ],
})
export class NotificationModule {}
