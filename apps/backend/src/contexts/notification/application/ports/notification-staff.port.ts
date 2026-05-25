export interface NotificationStaffInfo {
  id: string;
  email: string;
  name: string | null;
}

export const NOTIFICATION_STAFF_PORT = Symbol('INotificationStaffPort');

export interface INotificationStaffPort {
  getStaffInfo(staffId: string, tenantId: string): Promise<NotificationStaffInfo | null>;
  getManagerEmails(tenantId: string): Promise<string[]>;
}
