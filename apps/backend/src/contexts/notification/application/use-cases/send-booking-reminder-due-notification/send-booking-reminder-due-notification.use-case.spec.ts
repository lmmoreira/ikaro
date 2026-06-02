import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationProcessedEventRepository } from '../../../../../test/repositories/notification/in-memory-processed-event.repository';
import { InMemoryNotificationTenantPort } from '../../../../../test/infrastructure/in-memory-notification-tenant.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingReminderDueNotificationDtoBuilder } from '../../../../../test/builders/notification/send-booking-reminder-due-notification-dto.builder';
import { SendBookingReminderDueNotificationUseCase } from './send-booking-reminder-due-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0001-4000-8000-000000000001';
const EVENT_ID = 'eeeeeeee-0010-4000-8000-000000000001';

const dto = new SendBookingReminderDueNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendBookingReminderDueNotificationUseCase', () => {
  let dispatcher: InMemoryNotificationDispatcher;
  let logRepo: InMemoryNotificationLogRepository;
  let processedEventRepo: InMemoryNotificationProcessedEventRepository;
  let tenantPort: InMemoryNotificationTenantPort;
  let useCase: SendBookingReminderDueNotificationUseCase;

  beforeEach(() => {
    dispatcher = new InMemoryNotificationDispatcher();
    logRepo = new InMemoryNotificationLogRepository();
    processedEventRepo = new InMemoryNotificationProcessedEventRepository();
    tenantPort = new InMemoryNotificationTenantPort();

    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'LavaCar SP',
      slug: 'lavacar-sp',
      timezone: 'America/Sao_Paulo',
      fromEmail: null,
    });

    useCase = new SendBookingReminderDueNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      tenantPort,
      new InMemoryTransactionManager(),
    );
  });

  afterEach(() => jest.resetAllMocks());

  it('dispatches email to recipientEmail with correct subject and template key', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('joao@example.com');
    expect(msg.subject).toBe('Lembrete: seu agendamento é amanhã!');
    expect(msg.templateKey).toBe('booking-reminder-due');
    expect(msg.data['customerName']).toBe('João Silva');
    expect(msg.data['serviceNames']).toBe('Lavagem Completa');
  });

  it('derives localDate and localTime from scheduledAt + tenant timezone', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    const msg = dispatcher.dispatched[0];
    expect(typeof msg.data['localDate']).toBe('string');
    expect(typeof msg.data['localTime']).toBe('string');
  });

  it('falls back to America/Sao_Paulo when tenant not found', async () => {
    const dtoUnknownTenant = new SendBookingReminderDueNotificationDtoBuilder()
      .withTenantId('unknown-tenant-id')
      .withEventId('eeeeeeee-0010-4000-8000-000000000099')
      .build();

    const result = await useCase.execute(dtoUnknownTenant);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);
  });

  it('saves a notification log entry', async () => {
    await useCase.execute(dto);

    expect(logRepo.all).toHaveLength(1);
    expect(logRepo.all[0].notificationType).toBe('booking-reminder-due');
    expect(logRepo.all[0].tenantId).toBe(TENANT_ID);
  });

  it('is idempotent — second call returns emailSent=false without re-dispatching', async () => {
    await useCase.execute(dto);
    const second = await useCase.execute(dto);

    expect(second.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(1);
  });
});
