import { NotificationTemplate } from '../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';

export const NOTIFICATION_TEMPLATE_REPOSITORY = Symbol('INotificationTemplateRepository');

export interface INotificationTemplateRepository {
  findAllByTriggerEvent(
    tenantId: string,
    triggerEvent: NotificationTemplateKey,
  ): Promise<NotificationTemplate[]>;
  findByTriggerEventAndChannel(
    tenantId: string,
    triggerEvent: NotificationTemplateKey,
    channel: string,
  ): Promise<NotificationTemplate | null>;
  findAllDefaults(): Promise<NotificationTemplate[]>;
  saveAll(templates: NotificationTemplate[]): Promise<void>;
  /**
   * Copies every global default of the locale into the tenant, except the platform-scoped ones
   * (Billing's manager emails), which no tenant ever owns.
   */
  copyGlobalDefaultsForTenant(tenantId: string, locale: string): Promise<number>;
  /**
   * The tenant-less (`tenant_id IS NULL`) EMAIL row of a platform-scoped key for a locale. Throws
   * `PlatformTemplateNotFoundError` when the key is not platform-scoped or the row is missing.
   */
  findPlatformTemplate(
    triggerEvent: NotificationTemplateKey,
    locale: string,
  ): Promise<NotificationTemplate>;
}
