import { NotificationTemplateKey } from './notification-template-key.enum';

export interface NotificationTemplateKeyMapping {
  readonly eventName: string;
  readonly recipientType: string;
}

// Maps each persisted trigger_event key to the (eventName, recipientType) pair used to look up
// localized content via ILocalizationPort / packages/i18n/locales/<locale>/notifications.json.
// trigger_event drops the recipient suffix when an event has only one recipient type — this
// table is the single place that knows the full mapping (used by both the
// CreateNotificationTemplates migration's seed data and ILocalizationPort lookups).
export const NOTIFICATION_TEMPLATE_KEY_MAPPING: Record<
  NotificationTemplateKey,
  NotificationTemplateKeyMapping
> = {
  [NotificationTemplateKey.BOOKING_REQUESTED_ADMIN]: {
    eventName: 'BookingRequested',
    recipientType: 'admin',
  },
  [NotificationTemplateKey.BOOKING_REQUESTED_CUSTOMER]: {
    eventName: 'BookingRequested',
    recipientType: 'customer',
  },
  [NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER]: {
    eventName: 'BookingApproved',
    recipientType: 'customer',
  },
  [NotificationTemplateKey.BOOKING_REJECTED_CUSTOMER]: {
    eventName: 'BookingRejected',
    recipientType: 'customer',
  },
  [NotificationTemplateKey.BOOKING_INFO_REQUESTED_CUSTOMER]: {
    eventName: 'BookingInfoRequested',
    recipientType: 'customer',
  },
  [NotificationTemplateKey.BOOKING_INFO_SUBMITTED_ADMIN]: {
    eventName: 'BookingInfoSubmitted',
    recipientType: 'admin',
  },
  [NotificationTemplateKey.BOOKING_CANCELLED_CUSTOMER]: {
    eventName: 'BookingCancelled',
    recipientType: 'customer',
  },
  [NotificationTemplateKey.BOOKING_CANCELLED_ADMIN]: {
    eventName: 'BookingCancelled',
    recipientType: 'admin',
  },
  [NotificationTemplateKey.BOOKING_RESCHEDULED_CUSTOMER]: {
    eventName: 'BookingRescheduled',
    recipientType: 'customer',
  },
  [NotificationTemplateKey.BOOKING_RESCHEDULED_ADMIN]: {
    eventName: 'BookingRescheduled',
    recipientType: 'admin',
  },
  [NotificationTemplateKey.BOOKING_REMINDER_DUE]: {
    eventName: 'BookingReminderDue',
    recipientType: 'customer',
  },
  [NotificationTemplateKey.BOOKING_REMINDER_DUE_TODAY]: {
    eventName: 'BookingReminderDueToday',
    recipientType: 'customer',
  },
  [NotificationTemplateKey.ADMIN_DAILY_SCHEDULE_REMINDER]: {
    eventName: 'AdminDailyScheduleReminder',
    recipientType: 'admin',
  },
  [NotificationTemplateKey.SERVICE_POINTS_EARNED]: {
    eventName: 'ServicePointsEarned',
    recipientType: 'customer',
  },
  [NotificationTemplateKey.POINTS_EXPIRING_SOON]: {
    eventName: 'PointsExpiringSoon',
    recipientType: 'customer',
  },
  [NotificationTemplateKey.STAFF_INVITATION]: {
    eventName: 'StaffInvited',
    recipientType: 'staff',
  },
  [NotificationTemplateKey.RECURRING_SCHEDULE_CREATED_CUSTOMER]: {
    eventName: 'RecurringBookingScheduleCreated',
    recipientType: 'customer',
  },
  [NotificationTemplateKey.RECURRING_SCHEDULE_APPROVAL_REQUESTED_ADMIN]: {
    eventName: 'RecurringBookingScheduleApprovalRequested',
    recipientType: 'admin',
  },
  [NotificationTemplateKey.RECURRING_SCHEDULE_REJECTED_CUSTOMER]: {
    eventName: 'RecurringBookingScheduleRejected',
    recipientType: 'customer',
  },
  // Same event as the rejected template, told apart by recipientType (the persisted trigger_event
  // is the enum value, so the two never collide) — the copy for an expired request differs.
  [NotificationTemplateKey.RECURRING_SCHEDULE_EXPIRED_CUSTOMER]: {
    eventName: 'RecurringBookingScheduleRejected',
    recipientType: 'customerExpired',
  },
  [NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_CUSTOMER]: {
    eventName: 'RecurringBookingScheduleEnded',
    recipientType: 'customer',
  },
  // Same event, told apart by recipientType: the wording differs when staff ended the schedule.
  [NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_BY_STAFF_CUSTOMER]: {
    eventName: 'RecurringBookingScheduleEnded',
    recipientType: 'customerEndedByStaff',
  },
};
