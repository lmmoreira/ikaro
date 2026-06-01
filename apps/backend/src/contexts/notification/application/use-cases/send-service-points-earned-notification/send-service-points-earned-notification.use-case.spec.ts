import { InMemoryNotificationCustomerPort } from '../../../../../test/infrastructure/in-memory-notification-customer.port';
import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationProcessedEventRepository } from '../../../../../test/repositories/notification/in-memory-processed-event.repository';
import { InMemoryNotificationServicePort } from '../../../../../test/infrastructure/in-memory-notification-service.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendServicePointsEarnedNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
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
  let servicePort: InMemoryNotificationServicePort;

  beforeEach(() => {
    dispatcher = new InMemoryNotificationDispatcher();
    logRepo = new InMemoryNotificationLogRepository();
    processedEventRepo = new InMemoryNotificationProcessedEventRepository();
    customerPort = new InMemoryNotificationCustomerPort();
    servicePort = new InMemoryNotificationServicePort();

    customerPort.setCustomer(TENANT_ID, CUSTOMER_ID, {
      email: 'maria@example.com',
      name: 'Maria Silva',
    });
    servicePort.setService(TENANT_ID, { serviceId: SERVICE_ID_1, serviceName: 'Lavagem Premium' });
    servicePort.setService(TENANT_ID, { serviceId: SERVICE_ID_2, serviceName: 'Enceramento' });

    useCase = new SendServicePointsEarnedNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      customerPort,
      servicePort,
      new InMemoryTransactionManager(),
    );
  });

  afterEach(() => jest.resetAllMocks());

  it('dispatches ONE email per booking with total points and all services', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('maria@example.com');
    expect(msg.subject).toContain('15 pontos');
    expect(msg.templateKey).toBe('service-points-earned');
    expect(msg.data['customerName']).toBe('Maria Silva');
    expect(msg.data['totalPointsEarned']).toBe(15);
    expect(msg.data['currentBalance']).toBe(15);

    const services = msg.data['services'] as Array<{ serviceName: string; pointsEarned: number }>;
    expect(services).toHaveLength(2);
    expect(services[0].serviceName).toBe('Lavagem Premium');
    expect(services[0].pointsEarned).toBe(10);
    expect(services[1].serviceName).toBe('Enceramento');
    expect(services[1].pointsEarned).toBe(5);
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

  it('falls back to serviceId string when service is not found', async () => {
    const unknownServiceId = 'unknown-service-id';
    await useCase.execute(
      new SendServicePointsEarnedNotificationDtoBuilder()
        .withTenantId(TENANT_ID)
        .withEventId('eeeeeeee-0098-4000-8000-000000000001')
        .withCustomerId(CUSTOMER_ID)
        .withTotalPointsEarned(10)
        .withLines([
          {
            entryId: 'e1',
            serviceId: unknownServiceId,
            pointsEarned: 10,
            expiresAt: '2026-11-28T10:00:00.000Z',
          },
        ])
        .build(),
    );

    const services = dispatcher.dispatched[0].data['services'] as Array<{ serviceName: string }>;
    expect(services[0].serviceName).toBe(unknownServiceId);
  });
});
