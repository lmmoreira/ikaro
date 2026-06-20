import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationProcessedEventRepository } from '../../../../../test/repositories/notification/in-memory-processed-event.repository';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingReminderDueNotificationDtoBuilder } from '../../../../../test/builders/notification/send-booking-reminder-due-notification-dto.builder';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
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
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SendBookingReminderDueTodayNotificationUseCase;

  beforeEach(() => {
    dispatcher = new InMemoryNotificationDispatcher();
    logRepo = new InMemoryNotificationLogRepository();
    processedEventRepo = new InMemoryNotificationProcessedEventRepository();
    tenantPort = new InMemoryNotificationPlatformPort();
    templateRepo = new InMemoryNotificationTemplateRepository();

    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'LavaCar SP',
      slug: 'lavacar-sp',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      fromEmail: null,
    });
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.BOOKING_REMINDER_DUE_TODAY,
        channel: 'EMAIL',
        subject: 'Lembrete: seu agendamento é hoje!',
        body: '<p>{{customerName}} — {{serviceNames}} — {{localDate}} {{localTime}}</p>',
      }),
    );

    useCase = new SendBookingReminderDueTodayNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
    );
  });

  afterEach(() => jest.resetAllMocks());

  it('dispatches email to recipientEmail with correct rendered subject', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('joao@example.com');
    expect(msg.subject).toBe('Lembrete: seu agendamento é hoje!');
    expect(msg.channel).toBe('EMAIL');
    expect(msg.body).toContain('João Silva');
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
