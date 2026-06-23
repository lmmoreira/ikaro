import { BookingQueryService } from '../../../booking/application/services/booking-query.service';
import { ServiceQueryService } from '../../../booking/application/services/service-query.service';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { BookingBuilder } from '../../../../test/builders/booking/booking.builder';
import { BookingLineBuilder } from '../../../../test/builders/booking/booking-line.builder';
import { LoyaltyBookingAdapter } from './loyalty-booking.adapter';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const BOOKING_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('LoyaltyBookingAdapter', () => {
  let serviceQueryService: jest.Mocked<Pick<ServiceQueryService, 'findByIds'>>;
  let bookingQueryService: jest.Mocked<Pick<BookingQueryService, 'findById'>>;
  let adapter: LoyaltyBookingAdapter;

  beforeEach(() => {
    serviceQueryService = { findByIds: jest.fn() };
    bookingQueryService = { findById: jest.fn() };
    adapter = new LoyaltyBookingAdapter(
      serviceQueryService as unknown as ServiceQueryService,
      bookingQueryService as unknown as BookingQueryService,
    );
  });

  afterEach(() => jest.resetAllMocks());

  it('returns service summaries for given IDs', async () => {
    const svc = new ServiceBuilder().withName('Car wash').build();
    serviceQueryService.findByIds.mockResolvedValue([svc]);

    const result = await adapter.findServicesByIds(TENANT_ID, [svc.id]);

    expect(result).toEqual([{ serviceId: svc.id, serviceName: svc.name }]);
    expect(serviceQueryService.findByIds).toHaveBeenCalledWith([svc.id], TENANT_ID);
  });

  it('returns empty array when no IDs provided', async () => {
    const result = await adapter.findServicesByIds(TENANT_ID, []);

    expect(result).toEqual([]);
    expect(serviceQueryService.findByIds).not.toHaveBeenCalled();
  });

  it('returns the line service summary for a single-line booking', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_ID)
      .withLines([
        new BookingLineBuilder()
          .withServiceId('cccccccc-0000-4000-8000-000000000001')
          .withServiceNameAtBooking('Lavagem Completa')
          .build(),
      ])
      .build();
    bookingQueryService.findById.mockResolvedValue(booking);

    const result = await adapter.findBookingServices(TENANT_ID, BOOKING_ID);

    expect(result).toEqual([
      { serviceId: 'cccccccc-0000-4000-8000-000000000001', serviceName: 'Lavagem Completa' },
    ]);
    expect(bookingQueryService.findById).toHaveBeenCalledWith(BOOKING_ID, TENANT_ID);
  });

  it('returns a summary per line for a multi-line booking (e.g. a pickup-requiring service)', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_ID)
      .withLines([
        new BookingLineBuilder()
          .withServiceId('cccccccc-0000-4000-8000-000000000001')
          .withServiceNameAtBooking('Lavagem Completa')
          .build(),
        new BookingLineBuilder()
          .withServiceId('cccccccc-0000-4000-8000-000000000002')
          .withServiceNameAtBooking('Busca e Entrega')
          .build(),
      ])
      .build();
    bookingQueryService.findById.mockResolvedValue(booking);

    const result = await adapter.findBookingServices(TENANT_ID, BOOKING_ID);

    expect(result).toEqual([
      { serviceId: 'cccccccc-0000-4000-8000-000000000001', serviceName: 'Lavagem Completa' },
      { serviceId: 'cccccccc-0000-4000-8000-000000000002', serviceName: 'Busca e Entrega' },
    ]);
  });

  it('returns an empty array when the booking does not exist', async () => {
    bookingQueryService.findById.mockResolvedValue(null);

    const result = await adapter.findBookingServices(TENANT_ID, BOOKING_ID);

    expect(result).toEqual([]);
  });
});
