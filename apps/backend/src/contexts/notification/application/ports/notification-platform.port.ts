export const NOTIFICATION_PLATFORM_PORT = Symbol('INotificationPlatformPort');

export interface NotificationTenantInfo {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  /** The tenant's `businessInfo.email`, used as Reply-To; null when unset. */
  replyToEmail: string | null;
}

export interface INotificationPlatformPort {
  getTenantInfo(tenantId: string): Promise<NotificationTenantInfo | null>;
}
