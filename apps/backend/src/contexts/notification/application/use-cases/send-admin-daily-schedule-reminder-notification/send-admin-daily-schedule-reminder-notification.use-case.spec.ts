import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { JsonLocalizationAdapter } from '../../../infrastructure/adapters/json-localization.adapter';
import { SendAdminDailyScheduleReminderNotificationDtoBuilder } from '../../../../../test/builders/notification/send-admin-daily-schedule-reminder-notification-dto.builder';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendAdminDailyScheduleReminderNotificationUseCase } from './send-admin-daily-schedule-reminder-notification.use-case';

const TENANT_ID = 'aaaaaaaa-0003-4000-8000-000000000001';
const EVENT_ID = 'eeeeeeee-0011-4000-8000-000000000001';

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
  let localizationPort: JsonLocalizationAdapter;
  let useCase: SendAdminDailyScheduleReminderNotificationUseCase;

  beforeEach(() => {
    dispatcher = new InMemoryNotificationDispatcher();
    logRepo = new InMemoryNotificationLogRepository();
    inboxRepo = new InMemoryInboxRepository();
    staffPort = new InMemoryNotificationStaffPort();
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

  it('dispatches one email per manager with the date in the tenant format', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(result.recipientCount).toBe(2);
    expect(dispatcher.dispatched.map((d) => d.to)).toEqual([
      'manager1@lavacar.com',
      'manager2@lavacar.com',
    ]);
    expect(dispatcher.dispatched[0].body).toContain('<strong>02/07/2026</strong>');
    expect(dispatcher.dispatched[0].body).not.toContain('2026-07-02');
  });

  it('renders the booking table, with local time, from the shipped pt-BR copy', async () => {
    await useCase.execute(dto);

    const body = dispatcher.dispatched[0].body;
    expect(body).toContain('<th>Horário</th>');
    expect(body).toContain('<th>Cliente</th>');
    expect(body).toContain(
      '<tr><td>10:00</td><td>João Silva</td><td>+5531999990000</td><td>Lavagem Completa</td><td>60 min</td><td>-</td></tr>',
    );
    expect(body).not.toContain('{{');
  });

  it('shows the localized empty-state sentence when there are no bookings today', async () => {
    const emptyDto = new SendAdminDailyScheduleReminderNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId('eeeeeeee-0011-4000-8000-000000000002')
      .withNoBookings()
      .build();

    await useCase.execute(emptyDto);

    const body = dispatcher.dispatched[0].body;
    expect(body).toContain('Nenhum agendamento para hoje');
    expect(body).not.toContain('<table>');
  });

  it('writes the English copy, a 12-hour clock and the US date for an en tenant', async () => {
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'LavaCar SP',
      slug: 'lavacar-sp',
      timezone: 'America/Sao_Paulo',
      locale: 'en',
      replyToEmail: null,
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h',
    });

    await useCase.execute(dto);

    const { body } = dispatcher.dispatched[0];
    expect(body).toContain('<strong>07/02/2026</strong>');
    expect(body).toContain('<th>Time</th>');
    expect(body).toContain('<th>Customer</th>');
    expect(body).toContain('<td>10:00 AM</td>');
  });

  it('escapes customer-typed text in the table', async () => {
    const hostile = new SendAdminDailyScheduleReminderNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId('eeeeeeee-0011-4000-8000-000000000003')
      .withBookingsToday([
        {
          bookingId: 'bbbbbbbb-0001-4000-8000-000000000009',
          customerName: '<img src=x onerror=alert(1)>',
          customerPhone: null,
          lines: [{ serviceId: 'ssss-0009', serviceName: 'Wash <b>Pro</b>' }],
          appointmentSlot: {
            startTime: '2026-07-02T13:00:00.000Z',
            endTime: '2026-07-02T14:00:00.000Z',
          },
          adminNotes: '<script>x</script>',
        },
      ])
      .build();

    await useCase.execute(hostile);

    const body = dispatcher.dispatched[0].body;
    expect(body).not.toContain('<img');
    expect(body).not.toContain('<script>');
    expect(body).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(body).toContain('Wash &lt;b&gt;Pro&lt;/b&gt;');
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
