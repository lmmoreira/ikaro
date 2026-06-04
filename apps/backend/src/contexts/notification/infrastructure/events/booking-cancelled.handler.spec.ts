import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { BookingCancelledEventBuilder } from '../../../../test/builders/booking/booking-cancelled-event.builder';
import { SendBookingCancelledNotificationUseCase } from '../../application/use-cases/send-booking-cancelled-notification/send-booking-cancelled-notification.use-case';
import { BookingCancelledHandler } from './booking-cancelled.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';

describe('BookingCancelledHandler', () => {
  let useCase: jest.Mocked<Pick<SendBookingCancelledNotificationUseCase, 'execute'>>;
  let eventBus: InMemoryEventBus;
  let handler: BookingCancelledHandler;

  beforeEach(() => {
    useCase = {
      execute: jest.fn().mockResolvedValue({ customerEmailSent: true, adminEmailSent: true }),
    };
    eventBus = new InMemoryEventBus();
    handler = new BookingCancelledHandler(
      useCase as unknown as SendBookingCancelledNotificationUseCase,
      eventBus,
    );
    handler.onModuleInit();
  });

  it('delegates to use case with correct dto fields', async () => {
    const event = new BookingCancelledEventBuilder()
      .withTenantId(TENANT_ID)
      .withIsBusiness(true)
      .withReason('Slot unavailable')
      .build();

    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledTimes(1);
    const dto = useCase.execute.mock.calls[0][0];
    expect(dto.tenantId).toBe(TENANT_ID);
    expect(dto.correlationId).toBe('corr-cancelled-1');
    expect(dto.contactEmail).toBe('joao@example.com');
    expect(dto.contactName).toBe('João Silva');
    expect(dto.isBusiness).toBe(true);
    expect(dto.reason).toBe('Slot unavailable');
    expect(dto.scheduledAt).toBe('2026-07-01T10:00:00.000Z');
    expect(dto.lineSummary).toHaveLength(1);
    expect(dto.lineSummary[0].serviceNameAtBooking).toBe('Lavagem Completa');
    expect(dto.totalPrice).toEqual({ amount: '150.00', currency: 'BRL' });
  });

  it('passes isBusiness=false for customer-initiated cancellation', async () => {
    const event = new BookingCancelledEventBuilder()
      .withTenantId(TENANT_ID)
      .withIsBusiness(false)
      .withCancelledBy('customerid-0000-4000-8000-000000000001')
      .build();

    await handler.handle(event);

    const dto = useCase.execute.mock.calls[0][0];
    expect(dto.isBusiness).toBe(false);
    expect(dto.cancelledBy).toBe('customerid-0000-4000-8000-000000000001');
  });

  it('rethrows errors from the use case', async () => {
    const err = new Error('use case failure');
    useCase.execute.mockRejectedValue(err);

    await expect(
      handler.handle(new BookingCancelledEventBuilder().withTenantId(TENANT_ID).build()),
    ).rejects.toThrow('use case failure');
  });
});
