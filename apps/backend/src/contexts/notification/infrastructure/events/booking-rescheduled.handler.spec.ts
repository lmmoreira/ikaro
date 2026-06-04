import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { BookingRescheduledEventBuilder } from '../../../../test/builders/booking/booking-rescheduled-event.builder';
import { SendBookingRescheduledNotificationUseCase } from '../../application/use-cases/send-booking-rescheduled-notification/send-booking-rescheduled-notification.use-case';
import { BookingRescheduledHandler } from './booking-rescheduled.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';

describe('BookingRescheduledHandler', () => {
  let useCase: jest.Mocked<Pick<SendBookingRescheduledNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: BookingRescheduledHandler;

  beforeEach(() => {
    useCase = {
      execute: jest.fn().mockResolvedValue({ customerEmailSent: true, adminEmailSent: true }),
    };
    eventBus = new InMemoryEventBus();
    handler = new BookingRescheduledHandler(
      useCase as unknown as SendBookingRescheduledNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('delegates to use case with correct dto fields', async () => {
    const event = new BookingRescheduledEventBuilder().withTenantId(TENANT_ID).build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    const dto = useCase.execute.mock.calls[0][0];
    expect(dto.tenantId).toBe(TENANT_ID);
    expect(dto.correlationId).toBe('corr-rescheduled-1');
    expect(dto.contactEmail).toBe('joao@example.com');
    expect(dto.contactName).toBe('João Silva');
    expect(dto.previousSlot).toEqual({
      startTime: '2026-07-01T10:00:00.000Z',
      endTime: '2026-07-01T11:00:00.000Z',
    });
    expect(dto.newSlot).toEqual({
      startTime: '2026-07-07T10:00:00.000Z',
      endTime: '2026-07-07T11:00:00.000Z',
    });
    expect(dto.rescheduledBy).toBe('staffid-0000-4000-8000-000000000001');
    expect(dto.adminNotes).toBeNull();
    expect(dto.lineSummary).toHaveLength(1);
    expect(dto.lineSummary[0].serviceNameAtBooking).toBe('Lavagem Completa');
    expect(dto.totalPrice).toEqual({ amount: '150.00', currency: 'BRL' });
  });

  it('rethrows errors from the use case', async () => {
    const err = new Error('use case failure');
    useCase.execute.mockRejectedValue(err);

    await expect(
      handler.handle(new BookingRescheduledEventBuilder().withTenantId(TENANT_ID).build()),
    ).rejects.toThrow('use case failure');
  });
});
