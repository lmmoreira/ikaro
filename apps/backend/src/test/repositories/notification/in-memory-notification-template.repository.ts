import { INotificationTemplateRepository } from '../../../contexts/notification/application/ports/notification-template-repository.port';
import { NotificationTemplate } from '../../../contexts/notification/domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../contexts/notification/domain/notification-template-key.enum';

export class InMemoryNotificationTemplateRepository implements INotificationTemplateRepository {
  private readonly store: NotificationTemplate[] = [];

  async findByTriggerEventAndChannel(
    tenantId: string,
    triggerEvent: NotificationTemplateKey,
    channel: string,
  ): Promise<NotificationTemplate | null> {
    return (
      this.store.find(
        (t) => t.tenantId === tenantId && t.triggerEvent === triggerEvent && t.channel === channel,
      ) ?? null
    );
  }

  async findAllDefaults(): Promise<NotificationTemplate[]> {
    return this.store.filter((t) => t.tenantId === null);
  }

  async saveAll(templates: NotificationTemplate[]): Promise<void> {
    for (const t of templates) {
      this.store.push(t);
    }
  }

  async copyGlobalDefaultsForTenant(tenantId: string): Promise<number> {
    const defaults = this.store.filter((t) => t.tenantId === null);
    const copies = defaults
      .filter(
        (d) =>
          !this.store.some(
            (t) =>
              t.tenantId === tenantId &&
              t.triggerEvent === d.triggerEvent &&
              t.channel === d.channel,
          ),
      )
      .map((d) =>
        NotificationTemplate.create({
          tenantId,
          triggerEvent: d.triggerEvent,
          channel: d.channel as 'EMAIL' | 'SMS' | 'WHATSAPP',
          subject: d.subject,
          body: d.body,
        }),
      );
    for (const t of copies) {
      this.store.push(t);
    }
    return copies.length;
  }

  seed(template: NotificationTemplate): void {
    this.store.push(template);
  }
}
