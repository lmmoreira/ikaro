import { NotificationTemplateKey } from './notification-template-key.enum';

// Billing's platform-scoped manager emails (M26-S11, UC-124): Ikaro sends them for a tenant, not as the
// tenant. Each wording is its own key and the handler (S12) picks it from the event data. Kept apart
// from NOTIFICATION_TEMPLATE_KEY_MAPPING only to keep that file under the line limit; it is spread
// into it, which checks every entry against NotificationTemplateKeyMapping, and every entry carries
// platformScoped: true (PLATFORM_SCOPED_TEMPLATE_KEYS is derived from that flag).
export const BILLING_NOTIFICATION_TEMPLATE_MAPPING = {
  [NotificationTemplateKey.CHARGE_ISSUED_PERIOD]: {
    eventName: 'ChargeIssued',
    recipientType: 'managerPeriod',
    variables: ['tenantName', 'amount', 'dueDate', 'paymentUrl'],
    platformScoped: true,
  },
  [NotificationTemplateKey.CHARGE_ISSUED_RECOVERY]: {
    eventName: 'ChargeIssued',
    recipientType: 'managerRecovery',
    variables: ['tenantName', 'amount', 'dueDate', 'paymentUrl'],
    platformScoped: true,
  },
  [NotificationTemplateKey.CHARGE_PAID]: {
    eventName: 'ChargePaid',
    recipientType: 'manager',
    variables: ['tenantName', 'amount', 'paidDate'],
    platformScoped: true,
  },
  [NotificationTemplateKey.SUBSCRIPTION_PAST_DUE]: {
    eventName: 'SubscriptionPastDue',
    recipientType: 'manager',
    variables: ['tenantName', 'suspendsOn', 'billingUrl'],
    platformScoped: true,
  },
  [NotificationTemplateKey.SUBSCRIPTION_SUSPENDED_NON_PAYMENT]: {
    eventName: 'SubscriptionSuspended',
    recipientType: 'managerNonPayment',
    variables: ['tenantName', 'purgeDate', 'billingUrl'],
    platformScoped: true,
  },
  [NotificationTemplateKey.SUBSCRIPTION_SUSPENDED_OPERATOR]: {
    eventName: 'SubscriptionSuspended',
    recipientType: 'managerOperator',
    variables: ['tenantName'],
    platformScoped: true,
  },
  [NotificationTemplateKey.SUBSCRIPTION_REACTIVATED]: {
    eventName: 'SubscriptionReactivated',
    recipientType: 'manager',
    variables: ['tenantName'],
    platformScoped: true,
  },
  [NotificationTemplateKey.SUBSCRIPTION_CANCELLED_IMMEDIATE]: {
    eventName: 'SubscriptionCancelled',
    recipientType: 'managerImmediate',
    variables: ['tenantName'],
    platformScoped: true,
  },
  [NotificationTemplateKey.SUBSCRIPTION_CANCELLED_SCHEDULED]: {
    eventName: 'SubscriptionCancelled',
    recipientType: 'managerScheduled',
    variables: ['tenantName', 'cancelDate'],
    platformScoped: true,
  },
  [NotificationTemplateKey.PLAN_CHANGED]: {
    eventName: 'PlanChanged',
    recipientType: 'manager',
    variables: ['tenantName', 'newTotal', 'billingUrl'],
    platformScoped: true,
  },
  [NotificationTemplateKey.BILLING_REMINDER_PLAN_CONFIRMATION]: {
    eventName: 'BillingReminderDue',
    recipientType: 'planConfirmation',
    variables: ['tenantName', 'trialEndsOn', 'billingUrl'],
    platformScoped: true,
  },
  [NotificationTemplateKey.BILLING_REMINDER_TRIAL_ENDING]: {
    eventName: 'BillingReminderDue',
    recipientType: 'trialEnding',
    variables: ['tenantName', 'trialEndsOn', 'billingUrl'],
    platformScoped: true,
  },
  [NotificationTemplateKey.BILLING_REMINDER_CHARGE_DUE_SOON]: {
    eventName: 'BillingReminderDue',
    recipientType: 'chargeDueSoon',
    variables: ['tenantName', 'amount', 'dueDate', 'billingUrl'],
    platformScoped: true,
  },
  [NotificationTemplateKey.BILLING_REMINDER_CHARGE_OVERDUE]: {
    eventName: 'BillingReminderDue',
    recipientType: 'chargeOverdue',
    variables: ['tenantName', 'amount', 'dueDate', 'billingUrl'],
    platformScoped: true,
  },
  [NotificationTemplateKey.BILLING_REMINDER_RECOVERY_CHARGE_OPEN]: {
    eventName: 'BillingReminderDue',
    recipientType: 'recoveryChargeOpen',
    variables: ['tenantName', 'amount', 'dueDate', 'billingUrl'],
    platformScoped: true,
  },
  [NotificationTemplateKey.SUBSCRIPTION_PRICE_CHANGE_ANNOUNCED]: {
    eventName: 'SubscriptionPriceChangeAnnounced',
    recipientType: 'manager',
    variables: ['tenantName', 'changesList', 'effectiveFrom', 'newTotal', 'billingUrl'],
    platformScoped: true,
  },
  [NotificationTemplateKey.TENANT_PURGE_WARNING]: {
    eventName: 'TenantPurgeWarning',
    recipientType: 'manager',
    variables: ['tenantName', 'purgeDate', 'daysBefore', 'billingUrl'],
    platformScoped: true,
  },
} as const;
