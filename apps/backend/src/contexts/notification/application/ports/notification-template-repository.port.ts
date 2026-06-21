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
  copyGlobalDefaultsForTenant(tenantId: string, locale: string): Promise<number>;
}
