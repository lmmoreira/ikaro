import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationProcessedEventRepository } from '../../../../../test/repositories/notification/in-memory-processed-event.repository';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationTenantPort } from '../../../../../test/infrastructure/in-memory-notification-tenant.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingRequestedNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { SendBookingRequestedNotificationUseCase } from './send-booking-requested-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0000-4000-8000-000000000001';

const dto = new SendBookingRequestedNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendBookingRequestedNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let processedEventRepo: InMemoryNotificationProcessedEventRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let staffPort: InMemoryNotificationStaffPort;
  let tenantPort: InMemoryNotificationTenantPort;
  let useCase: SendBookingRequestedNotificationUseCase;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    processedEventRepo = new InMemoryNotificationProcessedEventRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    staffPort = new InMemoryNotificationStaffPort();
    staffPort.setManagerEmails(TENANT_ID, ['manager@lavacar.com.br']);
    tenantPort = new InMemoryNotificationTenantPort();
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'Lava Car',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
    });
    useCase = new SendBookingRequestedNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
    );
  });

  it('dispatches admin and customer emails and saves two log rows', async () => {
    const result = await useCase.execute(dto);

    expect(result.adminEmailSent).toBe(true);
    expect(result.customerEmailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(2);

    const adminMsg = dispatcher.dispatched.find((m) => m.to === 'manager@lavacar.com.br');
    expect(adminMsg).toBeDefined();
    expect(adminMsg!.subject).toBe('Nova solicitação de agendamento — Lavagem Completa, Polimento');
    expect(adminMsg!.templateKey).toBe('booking-requested-admin');
    expect(adminMsg!.data['guestName']).toBe('João Silva');
    expect(adminMsg!.data['serviceNames']).toBe('Lavagem Completa, Polimento');
    expect(adminMsg!.data['totalPrice']).toContain('150');

    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    expect(customerMsg).toBeDefined();
    expect(customerMsg!.subject).toBe('Seu agendamento foi recebido');
    expect(customerMsg!.templateKey).toBe('booking-requested-customer');
    expect(customerMsg!.data['tenantName']).toBe('Lava Car');

    const logs = logRepo.all;
    expect(logs).toHaveLength(2);
    const types = logs.map((l) => l.notificationType);
    expect(types).toContain('booking-requested-admin');
    expect(types).toContain('booking-requested-customer');
  });

  it('sends admin email to each manager when multiple managers exist', async () => {
    staffPort.setManagerEmails(TENANT_ID, ['mgr1@lavacar.com.br', 'mgr2@lavacar.com.br']);

    await useCase.execute(dto);

    const adminMsgs = dispatcher.dispatched.filter(
      (m) => m.templateKey === 'booking-requested-admin',
    );
    expect(adminMsgs).toHaveLength(2);
    expect(adminMsgs.map((m) => m.to)).toEqual(
      expect.arrayContaining(['mgr1@lavacar.com.br', 'mgr2@lavacar.com.br']),
    );
    const adminLog = logRepo.all.filter((l) => l.notificationType === 'booking-requested-admin');
    expect(adminLog).toHaveLength(1);
  });

  it('skips admin email gracefully when no managers exist', async () => {
    staffPort.setManagerEmails(TENANT_ID, []);

    const result = await useCase.execute(dto);

    expect(result.adminEmailSent).toBe(false);
    expect(result.customerEmailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].templateKey).toBe('booking-requested-customer');
    const adminLog = logRepo.all.filter((l) => l.notificationType === 'booking-requested-admin');
    expect(adminLog).toHaveLength(0);
  });

  it('is idempotent: second call with same eventId dispatches no emails and creates no extra logs', async () => {
    await useCase.execute(dto);
    dispatcher.clear();
    const result = await useCase.execute(dto);

    expect(result.adminEmailSent).toBe(false);
    expect(result.customerEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
    expect(logRepo.all).toHaveLength(2);
  });

  it('is independently idempotent per notification type', async () => {
    await useCase.execute(dto);
    const firstDispatchCount = dispatcher.dispatched.length;

    staffPort.setManagerEmails(TENANT_ID, []);
    dispatcher.clear();
    const secondResult = await useCase.execute(dto);

    expect(secondResult.adminEmailSent).toBe(false);
    expect(secondResult.customerEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
    expect(firstDispatchCount).toBe(2);
  });

  it('tenant isolation: log rows are scoped to the correct tenantId', async () => {
    await useCase.execute(dto);

    const logs = logRepo.all;
    expect(logs.every((l) => l.tenantId === TENANT_ID)).toBe(true);
  });
});
