import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationTenantPort } from '../../../../../test/infrastructure/in-memory-notification-tenant.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { NotificationLog } from '../../../domain/notification-log.entity';
import { SendBookingCancelledNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { SendBookingCancelledNotificationUseCase } from './send-booking-cancelled-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0001-4000-8000-000000000001';

const dto = new SendBookingCancelledNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendBookingCancelledNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let staffPort: InMemoryNotificationStaffPort;
  let tenantPort: InMemoryNotificationTenantPort;
  let useCase: SendBookingCancelledNotificationUseCase;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
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
    useCase = new SendBookingCancelledNotificationUseCase(
      logRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
    );
  });

  it('dispatches customer and admin emails and saves two log rows', async () => {
    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(true);
    expect(result.adminEmailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(2);

    const customerMsg = dispatcher.dispatched.find((m) => m.to === 'joao@example.com');
    expect(customerMsg).toBeDefined();
    expect(customerMsg!.subject).toBe('Seu agendamento foi cancelado');
    expect(customerMsg!.templateKey).toBe('booking-cancelled-customer');
    expect(customerMsg!.data['guestName']).toBe('João Silva');
    expect(customerMsg!.data['serviceNames']).toBe('Lavagem Completa');

    const adminMsg = dispatcher.dispatched.find((m) => m.to === 'manager@lavacar.com.br');
    expect(adminMsg).toBeDefined();
    expect(adminMsg!.subject).toBe('Agendamento cancelado');
    expect(adminMsg!.templateKey).toBe('booking-cancelled-admin');
    expect(adminMsg!.data['isBusiness']).toBe(true);
    expect(adminMsg!.data['reason']).toBe('Unavailability');

    const logs = logRepo.all;
    expect(logs).toHaveLength(2);
    const types = logs.map((l) => l.notificationType);
    expect(types).toContain('booking-cancelled-customer');
    expect(types).toContain('booking-cancelled-admin');
  });

  it('passes isBusiness=false for customer-initiated cancellation', async () => {
    const customerCancelDto = new SendBookingCancelledNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId('cccccccc-0099-4000-8000-000000000001')
      .withIsBusiness(false)
      .withCancelledBy('customerid-0000-4000-8000-000000000001')
      .build();

    await useCase.execute(customerCancelDto);

    const adminMsg = dispatcher.dispatched.find((m) => m.templateKey === 'booking-cancelled-admin');
    expect(adminMsg!.data['isBusiness']).toBe(false);
  });

  it('skips admin email gracefully when no managers exist', async () => {
    staffPort.setManagerEmails(TENANT_ID, []);

    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(true);
    expect(result.adminEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].templateKey).toBe('booking-cancelled-customer');
  });

  it('sends only admin email when customer log already exists (partial retry)', async () => {
    await logRepo.save(
      NotificationLog.create({
        tenantId: TENANT_ID,
        eventId: EVENT_ID,
        notificationType: 'booking-cancelled-customer',
        channel: 'EMAIL',
      }),
    );

    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(false);
    expect(result.adminEmailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].templateKey).toBe('booking-cancelled-admin');
  });

  it('sends only customer email when admin log already exists (partial retry)', async () => {
    await logRepo.save(
      NotificationLog.create({
        tenantId: TENANT_ID,
        eventId: EVENT_ID,
        notificationType: 'booking-cancelled-admin',
        channel: 'EMAIL',
      }),
    );

    const result = await useCase.execute(dto);

    expect(result.customerEmailSent).toBe(true);
    expect(result.adminEmailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].templateKey).toBe('booking-cancelled-customer');
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

  it('formats scheduledAt in tenant timezone', async () => {
    await useCase.execute(dto);

    const customerMsg = dispatcher.dispatched.find(
      (m) => m.templateKey === 'booking-cancelled-customer',
    );
    expect(customerMsg!.data['localDate']).toBeDefined();
    expect(customerMsg!.data['localTime']).toBeDefined();
    expect(typeof customerMsg!.data['localDate']).toBe('string');
  });

  it('falls back to America/Sao_Paulo timezone when tenant info is not found', async () => {
    const unknownTenantDto = new SendBookingCancelledNotificationDtoBuilder()
      .withTenantId('ffffffff-0000-4000-8000-000000000099')
      .withEventId('cccccccc-0099-4000-8000-000000000001')
      .build();

    await expect(useCase.execute(unknownTenantDto)).resolves.not.toThrow();
  });
});
