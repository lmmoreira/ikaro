import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryLocalizationPort } from '../../../../../test/infrastructure/in-memory-localization.port';
import { SendAdminDailyScheduleReminderNotificationDtoBuilder } from '../../../../../test/builders/notification/send-admin-daily-schedule-reminder-notification-dto.builder';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendAdminDailyScheduleReminderNotificationUseCase } from './send-admin-daily-schedule-reminder-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0003-4000-8000-000000000001';
const EVENT_ID = 'eeeeeeee-0011-4000-8000-000000000001';

const PT_BR_HEADERS = {
  time: 'Horário',
  customer: 'Cliente',
  phone: 'Telefone',
  services: 'Serviços',
  duration: 'Duração',
  notes: 'Notas',
  emptyState: 'Nenhum agendamento para hoje',
};

const dto = new SendAdminDailyScheduleReminderNotificationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendAdminDailyScheduleReminderNotificationUseCase', () => {
  let dispatcher: InMemoryNotificationDispatcher;
  let logRepo: InMemoryNotificationLogRepository;
  let inboxRepo: InMemoryInboxRepository;
  let staffPort: InMemoryNotificationStaffPort;
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let localizationPort: InMemoryLocalizationPort;
  let useCase: SendAdminDailyScheduleReminderNotificationUseCase;

  beforeEach(() => {
    dispatcher = new InMemoryNotificationDispatcher();
    logRepo = new InMemoryNotificationLogRepository();
    inboxRepo = new InMemoryInboxRepository();
    staffPort = new InMemoryNotificationStaffPort();
    tenantPort = new InMemoryNotificationPlatformPort();
    templateRepo = new InMemoryNotificationTemplateRepository();
    localizationPort = new InMemoryLocalizationPort();

    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'LavaCar SP',
      slug: 'lavacar-sp',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      fromEmail: null,
    });
    staffPort.setManagerEmails(TENANT_ID, ['manager1@lavacar.com', 'manager2@lavacar.com']);
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.ADMIN_DAILY_SCHEDULE_REMINDER,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
    localizationPort.setTemplate('AdminDailyScheduleReminder:admin', {
      subject: 'Agenda do dia — {{localDate}}',
      body: '<p>Total: {{totalBookingsToday}} — {{bookingsHtml}}</p>',
    });
    localizationPort.setTableHeaders('adminDailySchedule', 'pt-BR', PT_BR_HEADERS);

    useCase = new SendAdminDailyScheduleReminderNotificationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      localizationPort,
    );
  });

  afterEach(() => jest.resetAllMocks());

  it('dispatches one email per manager with correct subject and body', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(result.recipientCount).toBe(2);
    expect(dispatcher.dispatched).toHaveLength(2);

    expect(dispatcher.dispatched[0].to).toBe('manager1@lavacar.com');
    expect(dispatcher.dispatched[1].to).toBe('manager2@lavacar.com');
    expect(dispatcher.dispatched[0].subject).toBe('Agenda do dia — 2026-07-02');
    expect(dispatcher.dispatched[0].body).toContain('1');
  });

  it('uses localized column headers in the schedule table', async () => {
    await useCase.execute(dto);

    const body = dispatcher.dispatched[0].body;
    expect(body).toContain('Horário');
    expect(body).toContain('Cliente');
    expect(body).toContain('Serviços');
  });

  it('sets bookingsHtml to localized empty message when totalBookingsToday is 0', async () => {
    const emptyDto = new SendAdminDailyScheduleReminderNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId('eeeeeeee-0011-4000-8000-000000000002')
      .withNoBookings()
      .build();

    await useCase.execute(emptyDto);

    expect(dispatcher.dispatched[0].body).toContain('Nenhum agendamento para hoje');
  });

  it('uses English headers when tenant locale is en', async () => {
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'LavaCar SP',
      slug: 'lavacar-sp',
      timezone: 'America/Sao_Paulo',
      locale: 'en',
      fromEmail: null,
    });
    localizationPort.setTemplateForLocale('AdminDailyScheduleReminder:admin', 'en', {
      subject: "Today's schedule — {{localDate}}",
      body: '<p>Total: {{totalBookingsToday}} — {{bookingsHtml}}</p>',
    });
    localizationPort.setTableHeaders('adminDailySchedule', 'en', {
      ...PT_BR_HEADERS,
      time: 'Time',
      customer: 'Customer',
      services: 'Services',
      emptyState: 'No bookings for today',
    });

    await useCase.execute(dto);

    expect(dispatcher.dispatched[0].body).toContain('Time');
    expect(dispatcher.dispatched[0].body).toContain('Customer');
  });

  it('dispatches nothing and returns emailSent=false when no managers', async () => {
    staffPort.setManagerEmails(TENANT_ID, []);

    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(false);
    expect(result.recipientCount).toBe(0);
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('saves one log row per manager recipient', async () => {
    await useCase.execute(dto);

    // AUD-004 item 3: one log row per recipient now (previously only the first manager was
    // logged as a "canonical" recipient for the whole batch).
    expect(logRepo.all).toHaveLength(2);
    expect(logRepo.all.map((l) => l.recipientEmail.address)).toEqual(
      expect.arrayContaining(['manager1@lavacar.com', 'manager2@lavacar.com']),
    );
    expect(logRepo.all.every((l) => l.notificationType === 'admin-daily-schedule-reminder')).toBe(
      true,
    );
  });

  it('is idempotent — second call returns emailSent=false without re-dispatching', async () => {
    await useCase.execute(dto);
    const second = await useCase.execute(dto);

    expect(second.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(2);
  });
});
