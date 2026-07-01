import { GetBookingByIdUseCase } from '../../../booking/application/use-cases/get-booking-by-id.use-case';
import { GetServicesUseCase } from '../../../booking/application/use-cases/get-services.use-case';
import { BookingNotFoundError } from '../../../booking/domain/errors/booking-domain.error';
import { LoyaltyBookingAdapter } from './loyalty-booking.adapter';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const BOOKING_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('LoyaltyBookingAdapter', () => {
  let getServices: jest.Mocked<Pick<GetServicesUseCase, 'execute'>>;
  let getBookingById: jest.Mocked<Pick<GetBookingByIdUseCase, 'execute'>>;
  let adapter: LoyaltyBookingAdapter;

  beforeEach(() => {
    getServices = { execute: jest.fn() };
    getBookingById = { execute: jest.fn() };
    adapter = new LoyaltyBookingAdapter(
      getServices as unknown as GetServicesUseCase,
      getBookingById as unknown as GetBookingByIdUseCase,
    );
  });

  afterEach(() => jest.resetAllMocks());

  it('returns service summaries for given IDs', async () => {
    getServices.execute.mockResolvedValue({
      items: [
        {
          id: 'svc-1',
          name: 'Car wash',
          description: null,
          price: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
          durationMinutes: 60,
          loyaltyPointsValue: 10,
          requiresPickupAddress: false,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const result = await adapter.findServicesByIds(TENANT_ID, ['svc-1']);

    expect(result).toEqual([{ serviceId: 'svc-1', serviceName: 'Car wash' }]);
    expect(getServices.execute).toHaveBeenCalledWith({ tenantId: TENANT_ID, ids: ['svc-1'] });
  });

  it('returns empty array when no IDs provided', async () => {
    const result = await adapter.findServicesByIds(TENANT_ID, []);

    expect(result).toEqual([]);
    expect(getServices.execute).not.toHaveBeenCalled();
  });

  it('returns booking service summaries', async () => {
    getBookingById.execute.mockResolvedValue({
      id: BOOKING_ID,
      customerId: null,
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
      lines: [
        {
          serviceId: 'cccccccc-0000-4000-8000-000000000001',
          serviceNameAtBooking: 'Lavagem Completa',
        },
        {
          serviceId: 'cccccccc-0000-4000-8000-000000000002',
          serviceNameAtBooking: 'Busca e Entrega',
        },
      ] as never,
      beforeServicePhotoUrls: [],
      afterServicePhotoUrls: [],
      adminNotes: null,
      infoRequestMessage: null,
      infoResponseMessage: null,
      approvedAt: null,
      approvedBy: null,
      rejectionReason: null,
      createdAt: '2026-01-01T10:00:00.000Z',
    });

    const result = await adapter.findBookingServices(TENANT_ID, BOOKING_ID);

    expect(result).toEqual([
      { serviceId: 'cccccccc-0000-4000-8000-000000000001', serviceName: 'Lavagem Completa' },
      { serviceId: 'cccccccc-0000-4000-8000-000000000002', serviceName: 'Busca e Entrega' },
    ]);
    expect(getBookingById.execute).toHaveBeenCalledWith({
      bookingId: BOOKING_ID,
      tenantId: TENANT_ID,
      locale: 'pt-BR',
    });
  });

  it('returns an empty array when the booking does not exist', async () => {
    getBookingById.execute.mockRejectedValue(new BookingNotFoundError(BOOKING_ID));

    const result = await adapter.findBookingServices(TENANT_ID, BOOKING_ID);

    expect(result).toEqual([]);
  });
});
