import { InMemoryNotificationCustomerPort } from '../../../../../test/infrastructure/in-memory-notification-customer.port';
import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { JsonLocalizationAdapter } from '../../../infrastructure/adapters/json-localization.adapter';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendServicePointsEarnedNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendServicePointsEarnedNotificationUseCase } from './send-service-points-earned-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CUSTOMER_ID = 'cccccccc-0000-4000-8000-000000000001';
const EVENT_ID = 'eeeeeeee-0000-4000-8000-000000000001';

const dto = new SendServicePointsEarnedNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .withCustomerId(CUSTOMER_ID)
  .build();

describe('SendServicePointsEarnedNotificationUseCase', () => {
  let useCase: SendServicePointsEarnedNotificationUseCase;
  let dispatcher: InMemoryNotificationDispatcher;
  let logRepo: InMemoryNotificationLogRepository;
  let inboxRepo: InMemoryInboxRepository;
  let customerPort: InMemoryNotificationCustomerPort;
  let templateRepo: InMemoryNotificationTemplateRepository;

  beforeEach(() => {
    dispatcher = new InMemoryNotificationDispatcher();
    logRepo = new InMemoryNotificationLogRepository();
    inboxRepo = new InMemoryInboxRepository();
    customerPort = new InMemoryNotificationCustomerPort();
    templateRepo = new InMemoryNotificationTemplateRepository();

    customerPort.setCustomer(TENANT_ID, CUSTOMER_ID, {
      email: 'maria@example.com',
      name: 'Maria Silva',
    });
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.SERVICE_POINTS_EARNED,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
    useCase = new SendServicePointsEarnedNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      customerPort,
      new InMemoryTransactionManager(),
      templateRepo,
      new InMemoryNotificationPlatformPort(),
      new JsonLocalizationAdapter(),
    );
  });

  afterEach(() => jest.resetAllMocks());

  it('dispatches ONE email with rendered subject containing points earned', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('maria@example.com');
    expect(msg.subject).toBe('Você ganhou pontos de fidelidade!');
    expect(msg.body).toContain('15');
    expect(msg.body).toContain('Maria Silva');
    expect(msg.body).not.toContain('{{');
  });

  it('saves a notification log entry', async () => {
    await useCase.execute(dto);

    expect(logRepo.all).toHaveLength(1);
    expect(logRepo.all[0].notificationType).toBe('service-points-earned');
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
      new SendServicePointsEarnedNotificationDtoBuilder()
        .withTenantId(TENANT_ID)
        .withEventId('eeeeeeee-0099-4000-8000-000000000001')
        .withCustomerId('unknown-customer-id')
        .build(),
    );

    expect(result.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('escapes the customer name', async () => {
    customerPort.setCustomer(TENANT_ID, CUSTOMER_ID, {
      email: 'maria@example.com',
      name: '<img src=x>',
    });

    await useCase.execute(dto);

    expect(dispatcher.dispatched[0].body).not.toContain('<img');
    expect(dispatcher.dispatched[0].body).toContain('&lt;img src=x&gt;');
  });
});
