import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { JsonLocalizationAdapter } from '../../../infrastructure/adapters/json-localization.adapter';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendBookingReminderDueNotificationDtoBuilder } from '../../../../../test/builders/notification/send-booking-reminder-due-notification-dto.builder';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
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
  let inboxRepo: InMemoryInboxRepository;
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let localizationPort: JsonLocalizationAdapter;
  let useCase: SendBookingReminderDueNotificationUseCase;

  beforeEach(() => {
    dispatcher = new InMemoryNotificationDispatcher();
    logRepo = new InMemoryNotificationLogRepository();
    inboxRepo = new InMemoryInboxRepository();
    tenantPort = new InMemoryNotificationPlatformPort();
    templateRepo = new InMemoryNotificationTemplateRepository();
    localizationPort = new JsonLocalizationAdapter();

    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'LavaCar SP',
      slug: 'lavacar-sp',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      replyToEmail: null,
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
    });
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.BOOKING_REMINDER_DUE,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );

    useCase = new SendBookingReminderDueNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      localizationPort,
    );
  });

  afterEach(() => jest.resetAllMocks());

  it('dispatches email to recipientEmail with correct rendered subject', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('joao@example.com');
    expect(msg.subject).toBe('Lembrete: seu agendamento é amanhã!');
    expect(msg.channel).toBe('EMAIL');
    expect(msg.body).toContain('Olá, João Silva!');
    expect(msg.body).not.toContain('{{');
    expect(msg.body).toContain('Lavagem Completa');
  });

  it('derives localDate and localTime from scheduledAt + tenant timezone', async () => {
    await useCase.execute(dto);
    const msg = dispatcher.dispatched[0];
    expect(msg.body).toContain('<strong>Data:</strong> 02/07/2026');
    expect(msg.body).toContain('10:00');
    expect(msg.body).not.toContain('2026-07-02');
  });

  it('falls back to America/Sao_Paulo when tenant not found', async () => {
    const dtoUnknownTenant = new SendBookingReminderDueNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId('eeeeeeee-0010-4000-8000-000000000099')
      .build();

    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.BOOKING_REMINDER_DUE,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );

    const result = await useCase.execute(dtoUnknownTenant);
    expect(result.emailSent).toBe(true);
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

  it('returns emailSent=false when no template found', async () => {
    const uc = new SendBookingReminderDueNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      tenantPort,
      new InMemoryTransactionManager(),
      new InMemoryNotificationTemplateRepository(),
      localizationPort,
    );
    const result = await uc.execute(dto);
    expect(result.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('escapes the customer and service names', async () => {
    const hostile = new SendBookingReminderDueNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId('eeeeeeee-0010-4000-8000-0000000000aa')
      .withCustomerName('<img src=x>')
      .build();

    await useCase.execute(hostile);

    expect(dispatcher.dispatched[0].body).not.toContain('<img');
    expect(dispatcher.dispatched[0].body).toContain('&lt;img src=x&gt;');
  });

  it('writes the English copy with a 12-hour clock for an en tenant', async () => {
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'LavaCar SP',
      slug: 'lavacar-sp',
      timezone: 'America/Sao_Paulo',
      locale: 'en',
      replyToEmail: null,
    });

    await useCase.execute(dto);

    const msg = dispatcher.dispatched[0];
    expect(msg.body).toContain('Hello, João Silva!');
    expect(msg.body).toContain('10:00 AM');
  });
});
