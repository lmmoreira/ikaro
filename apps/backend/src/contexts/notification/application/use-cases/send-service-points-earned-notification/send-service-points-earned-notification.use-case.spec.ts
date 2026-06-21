import { InMemoryNotificationCustomerPort } from '../../../../../test/infrastructure/in-memory-notification-customer.port';
import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationProcessedEventRepository } from '../../../../../test/repositories/notification/in-memory-processed-event.repository';
import { InMemoryNotificationBookingPort } from '../../../../../test/infrastructure/in-memory-notification-booking.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryLocalizationPort } from '../../../../../test/infrastructure/in-memory-localization.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendServicePointsEarnedNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendServicePointsEarnedNotificationUseCase } from './send-service-points-earned-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CUSTOMER_ID = 'cccccccc-0000-4000-8000-000000000001';
const SERVICE_ID_1 = 'ssssssss-0000-4000-8000-000000000001';
const SERVICE_ID_2 = 'ssssssss-0000-4000-8000-000000000002';
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
  let processedEventRepo: InMemoryNotificationProcessedEventRepository;
  let customerPort: InMemoryNotificationCustomerPort;
  let servicePort: InMemoryNotificationBookingPort;
  let templateRepo: InMemoryNotificationTemplateRepository;

  beforeEach(() => {
    dispatcher = new InMemoryNotificationDispatcher();
    logRepo = new InMemoryNotificationLogRepository();
    processedEventRepo = new InMemoryNotificationProcessedEventRepository();
    customerPort = new InMemoryNotificationCustomerPort();
    servicePort = new InMemoryNotificationBookingPort();
    templateRepo = new InMemoryNotificationTemplateRepository();

    customerPort.setCustomer(TENANT_ID, CUSTOMER_ID, {
      email: 'maria@example.com',
      name: 'Maria Silva',
    });
    servicePort.setService(TENANT_ID, { serviceId: SERVICE_ID_1, serviceName: 'Lavagem Premium' });
    servicePort.setService(TENANT_ID, { serviceId: SERVICE_ID_2, serviceName: 'Enceramento' });
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
    const localizationPort = new InMemoryLocalizationPort();
    localizationPort.setTemplate('ServicePointsEarned:customer', {
      subject: 'Lavagem concluída! Você ganhou {{totalPointsEarned}} pontos',
      body: '<p>{{customerName}} — saldo: {{currentBalance}}</p>',
    });

    useCase = new SendServicePointsEarnedNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      customerPort,
      servicePort,
      new InMemoryTransactionManager(),
      templateRepo,
      new InMemoryNotificationPlatformPort(),
      localizationPort,
    );
  });

  afterEach(() => jest.resetAllMocks());

  it('dispatches ONE email with rendered subject containing points earned', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('maria@example.com');
    expect(msg.subject).toContain('15 pontos');
    expect(msg.body).toContain('Maria Silva');
    expect(msg.body).toContain('15');
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
});
