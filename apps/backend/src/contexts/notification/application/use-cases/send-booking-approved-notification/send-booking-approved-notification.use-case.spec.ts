import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationTenantPort } from '../../../../../test/infrastructure/in-memory-notification-tenant.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingApprovedNotificationDtoBuilder } from '../../../../../test/builders/notification/index';
import { SendBookingApprovedNotificationUseCase } from './send-booking-approved-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0001-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0001-4000-8000-000000000001';

const dto = new SendBookingApprovedNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendBookingApprovedNotificationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let tenantPort: InMemoryNotificationTenantPort;
  let useCase: SendBookingApprovedNotificationUseCase;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    tenantPort = new InMemoryNotificationTenantPort();
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'Lava Car',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
    });
    useCase = new SendBookingApprovedNotificationUseCase(
      logRepo,
      dispatcher,
      tenantPort,
      new InMemoryTransactionManager(),
    );
  });

  it('dispatches confirmation email to customer with timezone-converted time', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('joao@example.com');
    expect(msg.subject).toBe('Seu agendamento foi confirmado! ✓');
    expect(msg.templateKey).toBe('booking-approved-customer');
    // 2026-06-15T16:00:00Z in America/Sao_Paulo (UTC-3) = 13:00
    expect(msg.data['localTime']).toBe('13:00');
    expect(msg.data['localDate']).toBe('2026-06-15');
    expect(msg.data['serviceNames']).toBe('Lavagem Completa, Polimento');
    expect(msg.data['totalPrice']).toContain('150');

    const logs = logRepo.all;
    expect(logs).toHaveLength(1);
    expect(logs[0].notificationType).toBe('booking-approved-customer');
    expect(logs[0].tenantId).toBe(TENANT_ID);
  });

  it('falls back to America/Sao_Paulo when tenant info is unavailable', async () => {
    const emptyTenantPort = new InMemoryNotificationTenantPort();
    const uc = new SendBookingApprovedNotificationUseCase(
      logRepo,
      dispatcher,
      emptyTenantPort,
      new InMemoryTransactionManager(),
    );
    const result = await uc.execute(dto);
    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched[0].data['localTime']).toBeDefined();
  });

  it('is idempotent: second call with same eventId sends no email', async () => {
    await useCase.execute(dto);
    dispatcher.clear();
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
    expect(logRepo.all).toHaveLength(1);
  });

  it('tenant isolation: log is scoped to correct tenantId', async () => {
    await useCase.execute(dto);
    expect(logRepo.all.every((l) => l.tenantId === TENANT_ID)).toBe(true);
  });
});
