import { GetServicesUseCase } from '../../../booking/application/use-cases/get-services.use-case';
import { NotificationBookingAdapter } from './notification-booking.adapter';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('NotificationBookingAdapter', () => {
  let getServices: jest.Mocked<Pick<GetServicesUseCase, 'execute'>>;
  let adapter: NotificationBookingAdapter;

  beforeEach(() => {
    getServices = { execute: jest.fn() };
    adapter = new NotificationBookingAdapter(getServices as unknown as GetServicesUseCase);
  });

  afterEach(() => jest.resetAllMocks());

  it('returns service info for given IDs', async () => {
    getServices.execute.mockResolvedValue({
      items: [
        {
          id: 'svc-1',
          name: 'Full detail',
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

    expect(result).toEqual([{ serviceId: 'svc-1', serviceName: 'Full detail' }]);
    expect(getServices.execute).toHaveBeenCalledWith({ tenantId: TENANT_ID, ids: ['svc-1'] });
  });

  it('returns empty array when no IDs provided', async () => {
    const result = await adapter.findServicesByIds(TENANT_ID, []);

    expect(result).toEqual([]);
    expect(getServices.execute).not.toHaveBeenCalled();
  });
});
