import { INotificationTemplateRepository } from '../../../contexts/notification/application/ports/notification-template-repository.port';
import { NotificationTemplate } from '../../../contexts/notification/domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../contexts/notification/domain/notification-template-key.enum';
import { PLATFORM_SCOPED_TEMPLATE_KEYS } from '../../../contexts/notification/domain/notification-template-key.mapping';
import { PlatformTemplateNotFoundError } from '../../../contexts/notification/domain/errors/platform-template-not-found.error';

export class InMemoryNotificationTemplateRepository implements INotificationTemplateRepository {
  private readonly store: NotificationTemplate[] = [];

  async findAllByTriggerEvent(
    tenantId: string,
    triggerEvent: NotificationTemplateKey,
  ): Promise<NotificationTemplate[]> {
    return this.store.filter((t) => t.tenantId === tenantId && t.triggerEvent === triggerEvent);
  }

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

  async copyGlobalDefaultsForTenant(tenantId: string, locale: string): Promise<number> {
    const defaults = this.store.filter(
      (t) =>
        t.tenantId === null &&
        t.locale === locale &&
        !PLATFORM_SCOPED_TEMPLATE_KEYS.includes(t.triggerEvent),
    );
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
          locale: d.locale,
          subject: d.subject,
          body: d.body,
        }),
      );
    for (const t of copies) {
      this.store.push(t);
    }
    return copies.length;
  }

  async findPlatformTemplate(
    triggerEvent: NotificationTemplateKey,
    locale: string,
  ): Promise<NotificationTemplate> {
    const found = PLATFORM_SCOPED_TEMPLATE_KEYS.includes(triggerEvent)
      ? this.store.find(
          (t) =>
            t.tenantId === null &&
            t.triggerEvent === triggerEvent &&
            t.channel === 'EMAIL' &&
            t.locale === locale,
        )
      : undefined;
    if (!found) throw new PlatformTemplateNotFoundError(triggerEvent, locale);
    return found;
  }

  seed(template: NotificationTemplate): void {
    this.store.push(template);
  }
}
