import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryLocalizationPort } from '../../../../test/infrastructure/in-memory-localization.port';
import { NotificationTemplate } from '../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { BaseNotificationUseCase } from './base-notification.use-case';

class TestNotificationUseCase extends BaseNotificationUseCase {
  localize(
    templates: NotificationTemplate[],
    localizationPort: InMemoryLocalizationPort,
    locale: string,
  ): void {
    this.localizeTemplates(templates, localizationPort, locale);
  }
}

describe('BaseNotificationUseCase.localizeTemplates', () => {
  let useCase: TestNotificationUseCase;
  let localizationPort: InMemoryLocalizationPort;

  beforeEach(() => {
    useCase = new TestNotificationUseCase(
      new InMemoryNotificationLogRepository(),
      new InMemoryInboxRepository(),
      new InMemoryNotificationDispatcher(),
      new InMemoryTransactionManager(),
    );
    localizationPort = new InMemoryLocalizationPort();
  });

  it('throws a descriptive error when triggerEvent has no entry in NOTIFICATION_TEMPLATE_KEY_MAPPING', () => {
    const template = NotificationTemplate.reconstitute({
      id: '00000000-0000-4000-8000-000000000001',
      tenantId: null,
      triggerEvent: 'drifted-trigger-event' as NotificationTemplateKey,
      channel: 'EMAIL',
      locale: 'pt-BR',
      subject: 'subject',
      body: 'body',
      updatedAt: new Date(),
    });

    expect(() => useCase.localize([template], localizationPort, 'pt-BR')).toThrow(
      'No mapping found for trigger event "drifted-trigger-event"',
    );
  });

  it('overlays subject/body for every mapped template without throwing', () => {
    const template = NotificationTemplate.reconstitute({
      id: '00000000-0000-4000-8000-000000000002',
      tenantId: null,
      triggerEvent: NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
      channel: 'EMAIL',
      locale: 'pt-BR',
      subject: 'DB SUBJECT (unused)',
      body: 'DB BODY (unused)',
      updatedAt: new Date(),
    });
    localizationPort.setTemplate('BookingApproved:customer', {
      subject: 'Localized subject',
      body: 'Localized body',
    });

    useCase.localize([template], localizationPort, 'pt-BR');

    expect(template.subject).toBe('Localized subject');
    expect(template.body).toBe('Localized body');
  });
});
