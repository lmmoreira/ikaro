import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationProcessedEventRepository } from '../../../../../test/repositories/notification/in-memory-processed-event.repository';
import { InMemoryNotificationTenantPort } from '../../../../../test/infrastructure/in-memory-notification-tenant.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingReminderDueNotificationDtoBuilder } from '../../../../../test/builders/notification/send-booking-reminder-due-notification-dto.builder';
import { SendBookingReminderDueTodayNotificationUseCase } from './send-booking-reminder-due-today-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0002-4000-8000-000000000001';
const EVENT_ID = 'eeeeeeee-0012-4000-8000-000000000001';

const dto = new SendBookingReminderDueNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendBookingReminderDueTodayNotificationUseCase', () => {
  let dispatcher: InMemoryNotificationDispatcher;
  let logRepo: InMemoryNotificationLogRepository;
  let processedEventRepo: InMemoryNotificationProcessedEventRepository;
  let tenantPort: InMemoryNotificationTenantPort;
  let useCase: SendBookingReminderDueTodayNotificationUseCase;

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

    useCase = new SendBookingReminderDueTodayNotificationUseCase(
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
    expect(msg.subject).toBe('Lembrete: seu agendamento é hoje!');
    expect(msg.templateKey).toBe('booking-reminder-due-today');
    expect(msg.data['customerName']).toBe('João Silva');
    expect(msg.data['serviceNames']).toBe('Lavagem Completa');
  });

  it('saves a notification log entry', async () => {
    await useCase.execute(dto);

    expect(logRepo.all).toHaveLength(1);
    expect(logRepo.all[0].notificationType).toBe('booking-reminder-due-today');
    expect(logRepo.all[0].tenantId).toBe(TENANT_ID);
  });

  it('is idempotent — second call returns emailSent=false without re-dispatching', async () => {
    await useCase.execute(dto);
    const second = await useCase.execute(dto);

    expect(second.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(1);
  });
});
