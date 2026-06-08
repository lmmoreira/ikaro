import { BookingQueryService } from '../../../booking/application/services/booking-query.service';
import { BookingBuilder } from '../../../../test/builders/booking/booking.builder';
import { BookingLookupAdapter } from './booking-lookup.adapter';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const BOOKING_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('BookingLookupAdapter', () => {
  let queryService: jest.Mocked<Pick<BookingQueryService, 'findById'>>;
  let adapter: BookingLookupAdapter;

  beforeEach(() => {
    queryService = { findById: jest.fn() };
    adapter = new BookingLookupAdapter(queryService as unknown as BookingQueryService);
  });

  afterEach(() => jest.resetAllMocks());

  it('returns a minimal summary mapped from the booking aggregate', async () => {
    const booking = new BookingBuilder()
      .withId(BOOKING_ID)
      .withTenantId(TENANT_ID)
      .withCustomerId('cccccccc-0000-4000-8000-000000000001')
      .build();
    queryService.findById.mockResolvedValue(booking);

    const result = await adapter.findById(BOOKING_ID, TENANT_ID);

    expect(result).toEqual({
      id: booking.id,
      customerId: booking.customerId,
      beforeServicePhotoUrls: booking.beforeServicePhotoUrls,
      afterServicePhotoUrls: booking.afterServicePhotoUrls,
    });
    expect(queryService.findById).toHaveBeenCalledWith(BOOKING_ID, TENANT_ID);
  });

  it('returns null when the booking does not exist', async () => {
    queryService.findById.mockResolvedValue(null);

    const result = await adapter.findById(BOOKING_ID, TENANT_ID);

    expect(result).toBeNull();
  });

  it('returns null when the query service throws', async () => {
    queryService.findById.mockRejectedValue(new Error('DB error'));

    const result = await adapter.findById(BOOKING_ID, TENANT_ID);

    expect(result).toBeNull();
  });
});
