import { InMemoryNotificationCustomerPort } from '../../../../../test/infrastructure/in-memory-notification-customer.port';
import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { JsonLocalizationAdapter } from '../../../infrastructure/adapters/json-localization.adapter';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendPointsExpiringSoonNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendPointsExpiringSoonNotificationUseCase } from './send-points-expiring-soon-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000001603';
const CUSTOMER_ID = 'cccccccc-0000-4000-8000-000000001603';
const EVENT_ID = 'eeeeeeee-0000-4000-8000-000000001603';

const dto = new SendPointsExpiringSoonNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .withCustomerId(CUSTOMER_ID)
  .withPointsExpiringSoon(20)
  .build();

describe('SendPointsExpiringSoonNotificationUseCase', () => {
  let useCase: SendPointsExpiringSoonNotificationUseCase;
  let dispatcher: InMemoryNotificationDispatcher;
  let logRepo: InMemoryNotificationLogRepository;
  let inboxRepo: InMemoryInboxRepository;
  let customerPort: InMemoryNotificationCustomerPort;
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;

  beforeEach(() => {
    dispatcher = new InMemoryNotificationDispatcher();
    logRepo = new InMemoryNotificationLogRepository();
    inboxRepo = new InMemoryInboxRepository();
    customerPort = new InMemoryNotificationCustomerPort();
    templateRepo = new InMemoryNotificationTemplateRepository();

    customerPort.setCustomer(TENANT_ID, CUSTOMER_ID, {
      email: 'joao@example.com',
      name: 'João Silva',
    });
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.POINTS_EXPIRING_SOON,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
    tenantPort = new InMemoryNotificationPlatformPort();
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'Lava Car',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      replyToEmail: null,
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
    });

    useCase = new SendPointsExpiringSoonNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      customerPort,
      new InMemoryTransactionManager(),
      templateRepo,
      tenantPort,
      new JsonLocalizationAdapter(),
    );
  });

  afterEach(() => jest.resetAllMocks());

  it('dispatches email with rendered subject and body', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);
    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('joao@example.com');
    expect(msg.subject).toBe('Seus pontos estão prestes a expirar');
    expect(msg.body).toContain('João Silva');
    expect(msg.body).toContain('20');
    expect(msg.body).not.toContain('{{');
  });

  it('saves a notification log entry', async () => {
    await useCase.execute(dto);

    expect(logRepo.all).toHaveLength(1);
    expect(logRepo.all[0].notificationType).toBe('points-expiring-soon');
    expect(logRepo.all[0].tenantId).toBe(TENANT_ID);
  });

  it('is idempotent — second call returns emailSent=false without re-dispatching', async () => {
    await useCase.execute(dto);
    const second = await useCase.execute(dto);

    expect(second.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(1);
  });

  it('returns emailSent=false and skips dispatch when customer is not found', async () => {
    const result = await useCase.execute(
      new SendPointsExpiringSoonNotificationDtoBuilder()
        .withTenantId(TENANT_ID)
        .withEventId('eeeeeeee-0099-4000-8000-000000001603')
        .withCustomerId('unknown-customer-id')
        .build(),
    );

    expect(result.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('writes the expiry as the tenant-local calendar day, in the tenant format', async () => {
    // 2026-06-09T00:00Z is still 8 June in São Paulo (UTC-3).
    await useCase.execute(dto);

    expect(dispatcher.dispatched[0].body).toContain('08/06/2026');
    expect(dispatcher.dispatched[0].body).not.toContain('2026-06-09');
  });

  it('writes the US date for an en tenant', async () => {
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'Lava Car',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      locale: 'en',
      replyToEmail: null,
    });

    await useCase.execute(dto);

    expect(dispatcher.dispatched[0].body).toContain('06/08/2026');
  });

  it('escapes the customer name', async () => {
    customerPort.setCustomer(TENANT_ID, CUSTOMER_ID, {
      email: 'joao@example.com',
      name: '<img src=x>',
    });

    await useCase.execute(dto);

    expect(dispatcher.dispatched[0].body).not.toContain('<img');
  });
});
