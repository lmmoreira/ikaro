import { GetBookingByIdUseCase } from '../../../booking/application/use-cases/get-booking-by-id.use-case';
import { BookingNotFoundError } from '../../../booking/domain/errors/booking-domain.error';
import { PlatformBookingAdapter } from './platform-booking.adapter';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const BOOKING_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('PlatformBookingAdapter', () => {
  let getBookingById: jest.Mocked<Pick<GetBookingByIdUseCase, 'execute'>>;
  let adapter: PlatformBookingAdapter;

  beforeEach(() => {
    getBookingById = { execute: jest.fn() };
    adapter = new PlatformBookingAdapter(getBookingById as unknown as GetBookingByIdUseCase);
  });

  afterEach(() => jest.resetAllMocks());

  it('returns a minimal summary mapped from the booking use case', async () => {
    getBookingById.execute.mockResolvedValue({
      id: BOOKING_ID,
      customerId: 'cccccccc-0000-4000-8000-000000000001',
      status: 'PENDING',
      type: 'REGULAR',
      contactName: 'Cliente',
      contactEmail: 'cliente@example.com',
      contactPhone: '31999999999',
      contactAddress: null,
      notes: null,
      scheduledAt: '2026-01-01T10:00:00.000Z',
      totalDurationMins: 30,
      totalPrice: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
      totalActualPrice: null,
      pickupAddress: null,
      lines: [],
      beforeServicePhotoUrls: ['before.jpg'],
      afterServicePhotoUrls: ['after.jpg'],
      adminNotes: null,
      infoRequestMessage: null,
      infoResponseMessage: null,
      approvedAt: null,
      approvedBy: null,
      rejectionReason: null,
      createdAt: '2026-01-01T10:00:00.000Z',
    });

    const result = await adapter.findById(BOOKING_ID, TENANT_ID);

    expect(result).toEqual({
      id: BOOKING_ID,
      customerId: 'cccccccc-0000-4000-8000-000000000001',
      beforeServicePhotoUrls: ['before.jpg'],
      afterServicePhotoUrls: ['after.jpg'],
    });
    expect(getBookingById.execute).toHaveBeenCalledWith({ bookingId: BOOKING_ID, tenantId: TENANT_ID, locale: 'pt-BR' });
  });

  it('returns null when the booking does not exist', async () => {
    getBookingById.execute.mockRejectedValue(new BookingNotFoundError(BOOKING_ID));

    const result = await adapter.findById(BOOKING_ID, TENANT_ID);

    expect(result).toBeNull();
  });

  it('returns null when the use case throws', async () => {
    getBookingById.execute.mockRejectedValue(new Error('DB error'));

    const result = await adapter.findById(BOOKING_ID, TENANT_ID);

    expect(result).toBeNull();
  });
});
