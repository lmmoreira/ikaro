import {
  BookingReminderDueCommandBuilder,
  BookingReminderDueTodayCommandBuilder,
} from '../../../../test/builders/booking';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { BookingReminderDue } from '../../../booking/domain/commands/booking-reminder-due.command';
import { BookingReminderDueToday } from '../../../booking/domain/commands/booking-reminder-due-today.command';
import { SendBookingReminderDueNotificationUseCase } from '../../application/use-cases/send-booking-reminder-due-notification/send-booking-reminder-due-notification.use-case';
import { SendBookingReminderDueTodayNotificationUseCase } from '../../application/use-cases/send-booking-reminder-due-today-notification/send-booking-reminder-due-today-notification.use-case';
import { BookingReminderHandler } from './booking-reminder.handler';

const TENANT_ID = 'aaaaaaaa-0010-4000-8000-000000000001';

const buildDueEvent = (): BookingReminderDue =>
  new BookingReminderDueCommandBuilder().withTenantId(TENANT_ID).build();

const buildDueTodayEvent = (): BookingReminderDueToday =>
  new BookingReminderDueTodayCommandBuilder().withTenantId(TENANT_ID).build();

describe('BookingReminderHandler', () => {
  let sendDue: jest.Mocked<Pick<SendBookingReminderDueNotificationUseCase, 'execute'>>;
  let sendDueToday: jest.Mocked<Pick<SendBookingReminderDueTodayNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: BookingReminderHandler;

  beforeEach(() => {
    sendDue = { execute: jest.fn().mockResolvedValue({ emailSent: true }) };
    sendDueToday = { execute: jest.fn().mockResolvedValue({ emailSent: true }) };
    eventBus = new InMemoryEventBus();
    handler = new BookingReminderHandler(
      sendDue as unknown as SendBookingReminderDueNotificationUseCase,
      sendDueToday as unknown as SendBookingReminderDueTodayNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  afterEach(() => jest.resetAllMocks());

  describe('BookingReminderDue', () => {
    it('delegates to sendDue use case with correct dto fields', async () => {
      const event = buildDueEvent();

      await handler.handleDue(event);

      expect(sendDue.execute).toHaveBeenCalledTimes(1);
      const dto = sendDue.execute.mock.calls[0][0];
      expect(dto.tenantId).toBe(TENANT_ID);
      expect(dto.correlationId).toBe('corr-reminder-due-1');
      expect(dto.recipientEmail).toBe('joao@example.com');
      expect(dto.customerName).toBe('João Silva');
      expect(dto.lines[0].serviceName).toBe('Lavagem Completa');
    });

    it('rethrows errors from sendDue use case', async () => {
      sendDue.execute.mockRejectedValue(new Error('due failure'));

      await expect(handler.handleDue(buildDueEvent())).rejects.toThrow('due failure');
    });
  });

  describe('BookingReminderDueToday', () => {
    it('delegates to sendDueToday use case with correct dto fields', async () => {
      const event = buildDueTodayEvent();

      await handler.handleDueToday(event);

      expect(sendDueToday.execute).toHaveBeenCalledTimes(1);
      const dto = sendDueToday.execute.mock.calls[0][0];
      expect(dto.tenantId).toBe(TENANT_ID);
      expect(dto.correlationId).toBe('corr-reminder-today-1');
      expect(dto.recipientEmail).toBe('maria@example.com');
      expect(dto.customerName).toBe('Maria Costa');
      expect(dto.lines[0].serviceName).toBe('Polimento');
    });

    it('rethrows errors from sendDueToday use case', async () => {
      sendDueToday.execute.mockRejectedValue(new Error('due-today failure'));

      await expect(handler.handleDueToday(buildDueTodayEvent())).rejects.toThrow(
        'due-today failure',
      );
    });
  });
});
