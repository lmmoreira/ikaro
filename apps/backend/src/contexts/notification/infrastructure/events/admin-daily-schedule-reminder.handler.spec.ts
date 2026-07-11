import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { AdminDailyScheduleReminder } from '../../../booking/domain/commands/admin-daily-schedule-reminder.command';
import { SendAdminDailyScheduleReminderNotificationUseCase } from '../../application/use-cases/send-admin-daily-schedule-reminder-notification/send-admin-daily-schedule-reminder-notification.use-case';
import { AdminDailyScheduleReminderHandler } from './admin-daily-schedule-reminder.handler';

const TENANT_ID = 'aaaaaaaa-0012-4000-8000-000000000001';

const buildEvent = (totalBookingsToday = 1): AdminDailyScheduleReminder =>
  new AdminDailyScheduleReminder(TENANT_ID, 'corr-admin-schedule-1', {
    localDate: '2026-07-02',
    totalBookingsToday,
    bookingsToday:
      totalBookingsToday === 0
        ? []
        : [
            {
              bookingId: 'bbbbbbbb-0003-4000-8000-000000000001',
              customerName: 'Carlos Mendes',
              customerPhone: '+5531988880000',
              lines: [{ serviceId: 'ssss-0001', serviceName: 'Lavagem Completa' }],
              appointmentSlot: {
                startTime: '2026-07-02T13:00:00.000Z',
                endTime: '2026-07-02T14:00:00.000Z',
              },
              adminNotes: null,
            },
          ],
  });

describe('AdminDailyScheduleReminderHandler', () => {
  let useCase: jest.Mocked<Pick<SendAdminDailyScheduleReminderNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: AdminDailyScheduleReminderHandler;

  beforeEach(() => {
    useCase = {
      execute: jest.fn().mockResolvedValue({ emailSent: true, recipientCount: 2 }),
    };
    eventBus = new InMemoryEventBus();
    handler = new AdminDailyScheduleReminderHandler(
      useCase as unknown as SendAdminDailyScheduleReminderNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  afterEach(() => jest.resetAllMocks());

  it('delegates to use case with correct dto fields', async () => {
    const event = buildEvent();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    const dto = useCase.execute.mock.calls[0][0];
    expect(dto.tenantId).toBe(TENANT_ID);
    expect(dto.correlationId).toBe('corr-admin-schedule-1');
    expect(dto.localDate).toBe('2026-07-02');
    expect(dto.totalBookingsToday).toBe(1);
    expect(dto.bookingsToday).toHaveLength(1);
    expect(dto.bookingsToday[0].customerName).toBe('Carlos Mendes');
  });

  it('delegates empty digest when totalBookingsToday is 0', async () => {
    const event = buildEvent(0);

    await handler.handle(event);

    const dto = useCase.execute.mock.calls[0][0];
    expect(dto.totalBookingsToday).toBe(0);
    expect(dto.bookingsToday).toHaveLength(0);
  });

  it('rethrows errors from the use case', async () => {
    const err = new Error('use case failure');
    useCase.execute.mockRejectedValue(err);

    await expect(handler.handle(buildEvent())).rejects.toThrow('use case failure');
  });
});
