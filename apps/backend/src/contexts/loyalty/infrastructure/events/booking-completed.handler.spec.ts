import { BookingCompletedEventBuilder } from '../../../../test/builders/booking';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { CompleteBookingLoyaltyEffectsUseCase } from '../../application/use-cases/complete-booking-loyalty-effects/complete-booking-loyalty-effects.use-case';
import { BookingCompletedHandler } from './booking-completed.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CORRELATION_ID = '00000000-0000-7000-8000-000000000099';
const BOOKING_ID = '00000000-0000-7000-8000-000000000020';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000030';

describe('BookingCompletedHandler', () => {
  let handler: BookingCompletedHandler;
  let useCase: jest.Mocked<CompleteBookingLoyaltyEffectsUseCase>;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    useCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CompleteBookingLoyaltyEffectsUseCase>;
    eventBus = new InMemoryEventBus();
    handler = new BookingCompletedHandler(useCase, eventBus);
  });

  it('subscribes to BookingCompleted with CONSUMER_NAME on init', () => {
    const spy = jest.spyOn(eventBus, 'subscribe');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith(
      'BookingCompleted',
      expect.any(Function),
      CompleteBookingLoyaltyEffectsUseCase.CONSUMER_NAME,
    );
  });

  it('delegates to CompleteBookingLoyaltyEffectsUseCase with correct DTO', async () => {
    const event = new BookingCompletedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .withBookingId(BOOKING_ID)
      .withCustomerId(CUSTOMER_ID)
      .build();
    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      eventId: event.eventId,
      correlationId: CORRELATION_ID,
      customerId: CUSTOMER_ID,
      bookingId: BOOKING_ID,
      completedBy: '00000000-0000-7000-8000-000000000050',
      lines: [
        {
          lineId: '00000000-0000-7000-8000-000000000060',
          serviceId: '00000000-0000-7000-8000-000000000070',
          pointsValueAtBooking: 10,
        },
      ],
      discountByPoints: undefined,
    });
  });

  it('passes discountByPoints through when present on the event', async () => {
    const event = new BookingCompletedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .withBookingId(BOOKING_ID)
      .withCustomerId(CUSTOMER_ID)
      .withDiscountByPoints({
        pointsUsed: 200,
        amountDeducted: { amount: '20.00', currency: 'BRL' },
      })
      .build();
    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        discountByPoints: { pointsUsed: 200, amountDeducted: 20 },
      }),
    );
  });

  it('rethrows use case errors so Pub/Sub nacks and retries', async () => {
    useCase.execute.mockRejectedValue(new Error('db failure'));
    await expect(
      handler.handle(
        new BookingCompletedEventBuilder()
          .withTenantId(TENANT_ID)
          .withCorrelationId(CORRELATION_ID)
          .withBookingId(BOOKING_ID)
          .withCustomerId(CUSTOMER_ID)
          .build(),
      ),
    ).rejects.toThrow('db failure');
  });
});
