import { NotificationTemplate } from '../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';

export const NOTIFICATION_TEMPLATE_REPOSITORY = Symbol('INotificationTemplateRepository');

export interface INotificationTemplateRepository {
  findByTriggerEventAndChannel(
    tenantId: string,
    triggerEvent: NotificationTemplateKey,
    channel: string,
  ): Promise<NotificationTemplate | null>;
  findAllDefaults(): Promise<NotificationTemplate[]>;
  saveAll(templates: NotificationTemplate[]): Promise<void>;
  copyGlobalDefaultsForTenant(tenantId: string): Promise<number>;
}
