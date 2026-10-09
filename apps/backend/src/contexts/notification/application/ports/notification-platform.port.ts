import type { DateFormat, TimeFormat } from '@ikaro/i18n';

export const NOTIFICATION_PLATFORM_PORT = Symbol('INotificationPlatformPort');

export interface NotificationTenantInfo {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  /** The tenant's `businessInfo.email`, used as Reply-To; null when unset. */
  replyToEmail: string | null;
  /** How the tenant writes dates and times (from its country), the same the dashboard uses. */
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
}

export interface INotificationPlatformPort {
  getTenantInfo(tenantId: string): Promise<NotificationTenantInfo | null>;
}
