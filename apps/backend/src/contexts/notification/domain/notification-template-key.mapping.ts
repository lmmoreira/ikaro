import { NotificationTemplateKey } from './notification-template-key.enum';

export interface NotificationTemplateKeyMapping {
  readonly eventName: string;
  readonly recipientType: string;
  // The placeholders the template (subject and body, both languages) uses. A use case types its
  // variables object against this list (TemplateVariables<>), and the mapping spec compares it
  // with the placeholders in notifications.json, so a placeholder nobody supplies — which
  // render() would silently turn into '' — fails CI instead of shipping a blank email.
  readonly variables: readonly string[];
}

// Maps each persisted trigger_event key to the (eventName, recipientType) pair used to look up
// localized content via ILocalizationPort / packages/i18n/locales/<locale>/notifications.json.
// trigger_event drops the recipient suffix when an event has only one recipient type — this
// table is the single place that knows the full mapping (used by both the
// CreateNotificationTemplates migration's seed data and ILocalizationPort lookups).
export const NOTIFICATION_TEMPLATE_KEY_MAPPING = {
  [NotificationTemplateKey.BOOKING_REQUESTED_ADMIN]: {
    eventName: 'BookingRequested',
    recipientType: 'admin',
    variables: ['contactName', 'pickupAddressLine', 'scheduledAt', 'serviceNames', 'totalPrice'],
  },
  [NotificationTemplateKey.BOOKING_REQUESTED_CUSTOMER]: {
    eventName: 'BookingRequested',
    recipientType: 'customer',
    variables: ['contactName', 'scheduledAt', 'serviceNames', 'tenantName', 'totalPrice'],
  },
  [NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER]: {
    eventName: 'BookingApproved',
    recipientType: 'customer',
    variables: ['contactName', 'localDate', 'localTime', 'serviceNames', 'totalPrice'],
  },
  [NotificationTemplateKey.BOOKING_REJECTED_CUSTOMER]: {
    eventName: 'BookingRejected',
    recipientType: 'customer',
    variables: ['contactName', 'reason'],
  },
  [NotificationTemplateKey.BOOKING_INFO_REQUESTED_CUSTOMER]: {
    eventName: 'BookingInfoRequested',
    recipientType: 'customer',
    variables: ['contactName', 'informationNeeded', 'respondLink'],
  },
  [NotificationTemplateKey.BOOKING_INFO_SUBMITTED_ADMIN]: {
    eventName: 'BookingInfoSubmitted',
    recipientType: 'admin',
    variables: ['bookingLink', 'customerResponse', 'submittedByEmail'],
  },
  [NotificationTemplateKey.BOOKING_CANCELLED_CUSTOMER]: {
    eventName: 'BookingCancelled',
    recipientType: 'customer',
    variables: [
      'contactName',
      'localDate',
      'localTime',
      'reasonLine',
      'serviceNames',
      'totalPrice',
    ],
  },
  [NotificationTemplateKey.BOOKING_CANCELLED_ADMIN]: {
    eventName: 'BookingCancelled',
    recipientType: 'admin',
    variables: [
      'cancelledByLine',
      'contactName',
      'localDate',
      'localTime',
      'reasonLine',
      'serviceNames',
      'totalPrice',
    ],
  },
  [NotificationTemplateKey.BOOKING_RESCHEDULED_CUSTOMER]: {
    eventName: 'BookingRescheduled',
    recipientType: 'customer',
    variables: [
      'contactName',
      'newLocalDate',
      'newLocalTime',
      'previousLocalDate',
      'previousLocalTime',
      'serviceNames',
      'totalPrice',
    ],
  },
  [NotificationTemplateKey.BOOKING_RESCHEDULED_ADMIN]: {
    eventName: 'BookingRescheduled',
    recipientType: 'admin',
    variables: [
      'contactName',
      'newLocalDate',
      'newLocalTime',
      'previousLocalDate',
      'previousLocalTime',
      'rescheduledByLine',
      'serviceNames',
      'totalPrice',
    ],
  },
  [NotificationTemplateKey.BOOKING_NO_SHOW_CUSTOMER]: {
    eventName: 'BookingNoShow',
    recipientType: 'customer',
    variables: ['contactName', 'localDate', 'localTime', 'serviceNames', 'tenantName'],
  },

  [NotificationTemplateKey.BOOKING_REMINDER_DUE]: {
    eventName: 'BookingReminderDue',
    recipientType: 'customer',
    variables: ['contactName', 'localDate', 'localTime', 'serviceNames'],
  },
  [NotificationTemplateKey.BOOKING_REMINDER_DUE_TODAY]: {
    eventName: 'BookingReminderDueToday',
    recipientType: 'customer',
    variables: ['contactName', 'localTime', 'serviceNames'],
  },
  [NotificationTemplateKey.ADMIN_DAILY_SCHEDULE_REMINDER]: {
    eventName: 'AdminDailyScheduleReminder',
    recipientType: 'admin',
    variables: ['bookingsSummary', 'localDate'],
  },
  [NotificationTemplateKey.SERVICE_POINTS_EARNED]: {
    eventName: 'ServicePointsEarned',
    recipientType: 'customer',
    variables: ['currentBalance', 'customerName', 'totalPointsEarned'],
  },
  [NotificationTemplateKey.POINTS_EXPIRING_SOON]: {
    eventName: 'PointsExpiringSoon',
    recipientType: 'customer',
    variables: ['customerName', 'earliestExpiresAt', 'pointsExpiringSoon'],
  },
  [NotificationTemplateKey.STAFF_INVITATION]: {
    eventName: 'StaffInvited',
    recipientType: 'staff',
    variables: ['activationLink', 'staffName', 'tenantName'],
  },
  [NotificationTemplateKey.RECURRING_SCHEDULE_CREATED_CUSTOMER]: {
    eventName: 'RecurringBookingScheduleCreated',
    recipientType: 'customer',
    variables: [
      'contactName',
      'endsOn',
      'localTime',
      'serviceName',
      'startsOn',
      'tenantName',
      'weekdays',
    ],
  },
  [NotificationTemplateKey.RECURRING_SCHEDULE_APPROVAL_REQUESTED_ADMIN]: {
    eventName: 'RecurringBookingScheduleApprovalRequested',
    recipientType: 'admin',
    variables: [
      'contactName',
      'endsOn',
      'holdExpiresAt',
      'localTime',
      'serviceName',
      'startsOn',
      'weekdays',
    ],
  },
  [NotificationTemplateKey.RECURRING_SCHEDULE_REJECTED_CUSTOMER]: {
    eventName: 'RecurringBookingScheduleRejected',
    recipientType: 'customer',
    variables: ['contactName', 'serviceName'],
  },
  // Same event as the rejected template, told apart by recipientType (the persisted trigger_event
  // is the enum value, so the two never collide) — the copy for an expired request differs.
  [NotificationTemplateKey.RECURRING_SCHEDULE_EXPIRED_CUSTOMER]: {
    eventName: 'RecurringBookingScheduleRejected',
    recipientType: 'customerExpired',
    variables: ['contactName', 'serviceName'],
  },
  [NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_CUSTOMER]: {
    eventName: 'RecurringBookingScheduleEnded',
    recipientType: 'customer',
    variables: ['contactName', 'serviceName'],
  },
  // Same event, told apart by recipientType: the wording differs when staff ended the schedule.
  [NotificationTemplateKey.RECURRING_SCHEDULE_ENDED_BY_STAFF_CUSTOMER]: {
    eventName: 'RecurringBookingScheduleEnded',
    recipientType: 'customerEndedByStaff',
    variables: ['contactName', 'serviceName', 'tenantName'],
  },
  [NotificationTemplateKey.AVAILABILITY_ALERT_MATCHED_CUSTOMER]: {
    eventName: 'AvailabilityAlertMatched',
    recipientType: 'customer',
    variables: ['bookingUrl', 'contactName', 'matchingWindow', 'serviceName'],
  },
} as const satisfies Record<NotificationTemplateKey, NotificationTemplateKeyMapping>;

// The variables object a use case must supply for one or more templates: every placeholder of each
// listed template, and nothing else. Several keys give the union (one object serving a customer
// and a manager email); an extra or a missing key is a compile error.
type VariablesOf<K extends NotificationTemplateKey> =
  (typeof NOTIFICATION_TEMPLATE_KEY_MAPPING)[K]['variables'][number];

export type TemplateVariables<K extends NotificationTemplateKey> = {
  [V in VariablesOf<K>]: string;
};
