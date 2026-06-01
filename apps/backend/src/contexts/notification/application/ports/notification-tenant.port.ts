export interface NotificationTenantInfo {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  fromEmail: string | null;
}

export const NOTIFICATION_TENANT_PORT = Symbol('INotificationTenantPort');

export interface INotificationTenantPort {
  getTenantInfo(tenantId: string): Promise<NotificationTenantInfo | null>;
}
