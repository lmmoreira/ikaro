import { TenantUnavailableNoticeDueCommandBuilder } from '../../../../test/builders/booking';
import { NotificationTemplateBuilder } from '../../../../test/builders/notification/notification-template.builder';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationCustomerPort } from '../../../../test/infrastructure/in-memory-notification-customer.port';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationPlatformPort } from '../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryNotificationLogRepository } from '../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationTemplateRepository } from '../../../../test/repositories/notification/in-memory-notification-template.repository';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { SendTenantUnavailableNoticeNotificationUseCase } from '../../application/use-cases/send-tenant-unavailable-notice-notification/send-tenant-unavailable-notice-notification.use-case';
import { JsonLocalizationAdapter } from '../adapters/json-localization.adapter';
import { TenantUnavailableNoticeHandler } from './tenant-unavailable-notice.handler';

const TENANT_ID = 'aaaaaaaa-0028-4000-8000-0000000000d1';
const CUSTOMER_ID = 'cccccccc-0028-4000-8000-0000000000d1';

describe('TenantUnavailableNoticeHandler', () => {
  let dispatcher: InMemoryNotificationDispatcher;
  let useCase: SendTenantUnavailableNoticeNotificationUseCase;
  let eventBus: InMemoryEventBus;
  let handler: TenantUnavailableNoticeHandler;

  beforeEach(() => {
    dispatcher = new InMemoryNotificationDispatcher();
    const tenantPort = new InMemoryNotificationPlatformPort();
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'Lava Rápido Central',
      slug: 'lava-rapido',
      hotsiteUrl: 'https://app.example.com/lava-rapido',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      replyToEmail: null,
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
    });
    const customerPort = new InMemoryNotificationCustomerPort();
    customerPort.setCustomer(TENANT_ID, CUSTOMER_ID, { email: 'maria@example.com', name: 'Maria' });
    const templateRepo = new InMemoryNotificationTemplateRepository();
    templateRepo.seed(
      new NotificationTemplateBuilder()
        .withTenantId(TENANT_ID)
        .withTriggerEvent(NotificationTemplateKey.TENANT_UNAVAILABLE_CUSTOMER)
        .build(),
    );
    useCase = new SendTenantUnavailableNoticeNotificationUseCase(
      new InMemoryNotificationLogRepository(),
      new InMemoryInboxRepository(),
      dispatcher,
      customerPort,
      new InMemoryTransactionManager(),
      templateRepo,
      tenantPort,
      new JsonLocalizationAdapter(),
    );
    eventBus = new InMemoryEventBus();
    handler = new TenantUnavailableNoticeHandler(useCase, eventBus);
  });

  it('delegates one command to the use case and sends one email', async () => {
    await handler.handle(
      new TenantUnavailableNoticeDueCommandBuilder()
        .withTenantId(TENANT_ID)
        .withCustomerId(CUSTOMER_ID)
        .build(),
    );

    expect(dispatcher.dispatched.map((m) => m.to)).toEqual(['maria@example.com']);
  });

  it('calls the use case exactly once and rethrows on failure so Pub/Sub can nack and retry', async () => {
    const executeSpy = jest.spyOn(useCase, 'execute').mockRejectedValueOnce(new Error('boom'));

    await expect(
      handler.handle(
        new TenantUnavailableNoticeDueCommandBuilder().withTenantId(TENANT_ID).build(),
      ),
    ).rejects.toThrow('boom');

    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('subscribes to TenantUnavailableNoticeDue under its own consumer name', () => {
    handler.onModuleInit();

    expect(eventBus.subscriptions).toEqual([
      expect.objectContaining({
        eventName: 'TenantUnavailableNoticeDue',
        consumerName: 'notify-customer-tenant-unavailable',
      }),
    ]);
  });
});
