import { BookingCompleted } from '../../../booking/domain/events/booking-completed.event';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { RecordLoyaltyEntriesUseCase } from '../../application/use-cases/record-loyalty-entries/record-loyalty-entries.use-case';
import { BookingCompletedHandler } from './booking-completed.handler';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CORRELATION_ID = '00000000-0000-7000-8000-000000000099';
const BOOKING_ID = '00000000-0000-7000-8000-000000000020';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000030';

function makeEvent(customerId: string | null = CUSTOMER_ID): BookingCompleted {
  return new BookingCompleted(TENANT_ID, CORRELATION_ID, {
    bookingId: BOOKING_ID,
    customerId,
    contactEmail: 'test@example.com',
    contactName: 'Test User',
    completedSlot: { startTime: '2026-06-01T10:00:00Z', endTime: '2026-06-01T11:00:00Z' },
    completedBy: '00000000-0000-7000-8000-000000000050',
    afterServicePhotoUrls: [],
    adminNotes: null,
    pickupAddress: null,
    totalPrice: { amount: '100.00', currency: 'BRL' },
    totalActualPrice: { amount: '100.00', currency: 'BRL' },
    lines: [
      {
        lineId: '00000000-0000-7000-8000-000000000060',
        serviceId: '00000000-0000-7000-8000-000000000070',
        priceAtBooking: { amount: '100.00', currency: 'BRL' },
        actualPriceCharged: { amount: '100.00', currency: 'BRL' },
        pointsValueAtBooking: 10,
      },
    ],
  });
}

describe('BookingCompletedHandler', () => {
  let handler: BookingCompletedHandler;
  let useCase: jest.Mocked<RecordLoyaltyEntriesUseCase>;
  let eventBus: InMemoryEventBus;

  beforeEach(() => {
    useCase = {
      execute: jest
        .fn()
        .mockResolvedValue({ skipped: false, entriesCreated: 1, totalPointsEarned: 10 }),
    } as unknown as jest.Mocked<RecordLoyaltyEntriesUseCase>;
    eventBus = new InMemoryEventBus();
    handler = new BookingCompletedHandler(useCase, eventBus);
  });

  it('subscribes to BookingCompleted with CONSUMER_NAME on init', () => {
    const spy = jest.spyOn(eventBus, 'subscribe');
    handler.onModuleInit();
    expect(spy).toHaveBeenCalledWith(
      'BookingCompleted',
      expect.any(Function),
      RecordLoyaltyEntriesUseCase.CONSUMER_NAME,
    );
  });

  it('delegates to RecordLoyaltyEntriesUseCase with correct DTO', async () => {
    const event = makeEvent();
    await handler.handle(event);

    expect(useCase.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      eventId: event.eventId,
      correlationId: CORRELATION_ID,
      customerId: CUSTOMER_ID,
      bookingId: BOOKING_ID,
      lines: [
        {
          lineId: '00000000-0000-7000-8000-000000000060',
          serviceId: '00000000-0000-7000-8000-000000000070',
          pointsValueAtBooking: 10,
        },
      ],
    });
  });

  it('rethrows use case errors so Pub/Sub nacks and retries', async () => {
    useCase.execute.mockRejectedValue(new Error('db failure'));
    await expect(handler.handle(makeEvent())).rejects.toThrow('db failure');
  });
});
