import {
  INotificationStaffPort,
  NotificationStaffInfo,
} from '../../contexts/notification/application/ports/notification-staff.port';

export class InMemoryNotificationStaffPort implements INotificationStaffPort {
  private readonly staffStore = new Map<string, NotificationStaffInfo>();
  private readonly managerEmailsStore = new Map<string, string[]>();

  async getStaffInfo(staffId: string, tenantId: string): Promise<NotificationStaffInfo | null> {
    return this.staffStore.get(`${tenantId}:${staffId}`) ?? null;
  }

  async getManagerEmails(tenantId: string): Promise<string[]> {
    return this.managerEmailsStore.get(tenantId) ?? [];
  }

  setStaff(tenantId: string, staff: NotificationStaffInfo): void {
    this.staffStore.set(`${tenantId}:${staff.id}`, staff);
  }

  setManagerEmails(tenantId: string, emails: string[]): void {
    this.managerEmailsStore.set(tenantId, emails);
  }
}
