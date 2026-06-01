import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationProcessedEventRepository } from '../../../../../test/repositories/notification/in-memory-processed-event.repository';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationTenantPort } from '../../../../../test/infrastructure/in-memory-notification-tenant.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingRescheduledNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { SendBookingRescheduledNotificationUseCase } from './send-booking-rescheduled-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0002-4000-8000-000000000001';

const dto = new SendBookingRescheduledNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendBookingRescheduledNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let processedEventRepo: InMemoryNotificationProcessedEventRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let staffPort: InMemoryNotificationStaffPort;
  let tenantPort: InMemoryNotificationTenantPort;
  let useCase: SendBookingRescheduledNotificationUseCase;

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
    useCase = new SendBookingRescheduledNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
    );
  });

  it('dispatches customer and admin emails with old and new slot data', async () => {
    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(true);
    expect(result.adminEmailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(2);

    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    expect(customerMsg).toBeDefined();
    expect(customerMsg!.subject).toBe('Seu agendamento foi reagendado');
    expect(customerMsg!.templateKey).toBe('booking-rescheduled-customer');
    expect(customerMsg!.data['guestName']).toBe('João Silva');
    expect(customerMsg!.data['previousLocalDate']).toBeDefined();
    expect(customerMsg!.data['previousLocalTime']).toBeDefined();
    expect(customerMsg!.data['newLocalDate']).toBeDefined();
    expect(customerMsg!.data['newLocalTime']).toBeDefined();
    expect(customerMsg!.data['serviceNames']).toBe('Lavagem Completa');

    const adminMsg = dispatcher.dispatched.find((m) => m.to === 'manager@lavacar.com.br');
    expect(adminMsg).toBeDefined();
    expect(adminMsg!.subject).toBe('Agendamento reagendado');
    expect(adminMsg!.templateKey).toBe('booking-rescheduled-admin');
    expect(adminMsg!.data['previousLocalDate']).toBeDefined();
    expect(adminMsg!.data['newLocalDate']).toBeDefined();

    const logs = logRepo.all;
    expect(logs).toHaveLength(2);
    const types = logs.map((l) => l.notificationType);
    expect(types).toContain('booking-rescheduled-customer');
    expect(types).toContain('booking-rescheduled-admin');
  });

  it('old and new dates differ in dispatched data', async () => {
    await useCase.execute(dto);

    const customerMsg = dispatcher.dispatched.find(
      (m) => m.templateKey === 'booking-rescheduled-customer',
    );
    expect(customerMsg!.data['previousLocalDate']).not.toBe(customerMsg!.data['newLocalDate']);
  });

  it('skips admin email gracefully when no managers exist', async () => {
    staffPort.setManagerEmails(TENANT_ID, []);

    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(true);
    expect(result.adminEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].templateKey).toBe('booking-rescheduled-customer');
  });

  it('sends only admin email when customer already processed (partial retry)', async () => {
    await processedEventRepo.markProcessed(EVENT_ID, 'booking-rescheduled-customer', 'EMAIL');

    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(false);
    expect(result.adminEmailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].templateKey).toBe('booking-rescheduled-admin');
  });

  it('sends only customer email when admin already processed (partial retry)', async () => {
    await processedEventRepo.markProcessed(EVENT_ID, 'booking-rescheduled-admin', 'EMAIL');

    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(true);
    expect(result.adminEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].templateKey).toBe('booking-rescheduled-customer');
  });

  it('is idempotent: second call with same eventId dispatches no emails and creates no extra logs', async () => {
    await useCase.execute(dto);
    dispatcher.clear();

    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(false);
    expect(result.adminEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
    expect(logRepo.all).toHaveLength(2);
  });

  it('tenant isolation: log rows are scoped to the correct tenantId', async () => {
    await useCase.execute(dto);

    expect(logRepo.all.every((l) => l.tenantId === TENANT_ID)).toBe(true);
  });

  it('falls back to America/Sao_Paulo timezone when tenant info is not found', async () => {
    const unknownTenantDto = new SendBookingRescheduledNotificationDtoBuilder()
      .withTenantId('ffffffff-0000-4000-8000-000000000099')
      .withEventId('cccccccc-0099-4000-8000-000000000002')
      .build();

    await expect(useCase.execute(unknownTenantDto)).resolves.not.toThrow();
  });
});
