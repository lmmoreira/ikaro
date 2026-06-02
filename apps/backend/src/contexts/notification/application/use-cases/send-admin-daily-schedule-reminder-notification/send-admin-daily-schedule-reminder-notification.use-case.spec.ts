import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationProcessedEventRepository } from '../../../../../test/repositories/notification/in-memory-processed-event.repository';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationTenantPort } from '../../../../../test/infrastructure/in-memory-notification-tenant.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendAdminDailyScheduleReminderNotificationDtoBuilder } from '../../../../../test/builders/notification/send-admin-daily-schedule-reminder-notification-dto.builder';
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
  let processedEventRepo: InMemoryNotificationProcessedEventRepository;
  let staffPort: InMemoryNotificationStaffPort;
  let tenantPort: InMemoryNotificationTenantPort;
  let useCase: SendAdminDailyScheduleReminderNotificationUseCase;

  beforeEach(() => {
    dispatcher = new InMemoryNotificationDispatcher();
    logRepo = new InMemoryNotificationLogRepository();
    processedEventRepo = new InMemoryNotificationProcessedEventRepository();
    staffPort = new InMemoryNotificationStaffPort();
    tenantPort = new InMemoryNotificationTenantPort();

    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'LavaCar SP',
      slug: 'lavacar-sp',
      timezone: 'America/Sao_Paulo',
      fromEmail: null,
    });
    staffPort.setManagerEmails(TENANT_ID, ['manager1@lavacar.com', 'manager2@lavacar.com']);

    useCase = new SendAdminDailyScheduleReminderNotificationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
    );
  });

  afterEach(() => jest.resetAllMocks());

  it('dispatches one email per manager with correct subject and template key', async () => {
    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(true);
    expect(result.recipientCount).toBe(2);
    expect(dispatcher.dispatched).toHaveLength(2);

    expect(dispatcher.dispatched[0].to).toBe('manager1@lavacar.com');
    expect(dispatcher.dispatched[1].to).toBe('manager2@lavacar.com');
    expect(dispatcher.dispatched[0].subject).toBe('Agenda do dia — 2026-07-02');
    expect(dispatcher.dispatched[0].templateKey).toBe('admin-daily-schedule-reminder');
  });

  it('includes localDate and totalBookingsToday in dispatched data', async () => {
    await useCase.execute(dto);

    const data = dispatcher.dispatched[0].data;
    expect(data['localDate']).toBe('2026-07-02');
    expect(data['totalBookingsToday']).toBe(1);
    expect(typeof data['bookingsHtml']).toBe('string');
  });

  it('sets bookingsHtml to empty message when totalBookingsToday is 0', async () => {
    const emptyDto = new SendAdminDailyScheduleReminderNotificationDtoBuilder()
      .withTenantId(TENANT_ID)
      .withEventId('eeeeeeee-0011-4000-8000-000000000002')
      .withNoBookings()
      .build();

    await useCase.execute(emptyDto);

    const data = dispatcher.dispatched[0].data;
    expect(data['bookingsHtml']).toContain('Nenhum agendamento para hoje');
  });

  it('dispatches nothing and returns emailSent=false when no managers', async () => {
    staffPort.setManagerEmails(TENANT_ID, []);

    const result = await useCase.execute(dto);

    expect(result.emailSent).toBe(false);
    expect(result.recipientCount).toBe(0);
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('saves log with first manager email as canonical recipient', async () => {
    await useCase.execute(dto);

    expect(logRepo.all).toHaveLength(1);
    expect(logRepo.all[0].recipientEmail).toBe('manager1@lavacar.com');
    expect(logRepo.all[0].notificationType).toBe('admin-daily-schedule-reminder');
  });

  it('is idempotent — second call returns emailSent=false without re-dispatching', async () => {
    await useCase.execute(dto);
    const second = await useCase.execute(dto);

    expect(second.emailSent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(2);
  });
});
