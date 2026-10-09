import {
  INotificationPlatformPort,
  NotificationTenantInfo,
} from '../../contexts/notification/application/ports/notification-platform.port';

type TenantInfoInput = Omit<NotificationTenantInfo, 'dateFormat' | 'timeFormat' | 'hotsiteUrl'> &
  Partial<Pick<NotificationTenantInfo, 'dateFormat' | 'timeFormat' | 'hotsiteUrl'>>;

export class InMemoryNotificationPlatformPort implements INotificationPlatformPort {
  private readonly store = new Map<string, NotificationTenantInfo>();

  async getTenantInfo(tenantId: string): Promise<NotificationTenantInfo | null> {
    return this.store.get(tenantId) ?? null;
  }

  // Formats default from the language the way a tenant's do from its country: an English tenant
  // writes MM/DD/YYYY with a 12-hour clock, a pt-BR one DD/MM/YYYY with a 24-hour clock.
  setTenantInfo(tenantId: string, info: TenantInfoInput): void {
    const english = info.locale === 'en';
    this.store.set(tenantId, {
      dateFormat: english ? 'MM/DD/YYYY' : 'DD/MM/YYYY',
      timeFormat: english ? '12h' : '24h',
      hotsiteUrl: `https://app.ikaro.test/${info.slug}`,
      ...info,
    });
  }
}
