import { BackendHttpService } from '../shared/http/backend-http.service';
import { ServicesController } from './services.controller';
import { ServiceResponse } from './services.types';

const makeBackendHttp = (overrides?: Partial<BackendHttpService>): BackendHttpService =>
  ({
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  }) as unknown as BackendHttpService;

const validBody = {
  name: 'Lavagem Completa',
  priceAmount: 150,
  durationMinutes: 60,
  loyaltyPointsValue: 10,
};

const mockResponse: ServiceResponse = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Lavagem Completa',
  description: null,
  price: { amount: 150, currency: 'BRL', formatted: 'R$ 150,00' },
  durationMinutes: 60,
  loyaltyPointsValue: 10,
  requiresPickupAddress: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ServicesController', () => {
  describe('create()', () => {
    it('calls POST /services with body and returns the backend response', async () => {
      const backendHttp = makeBackendHttp({ post: jest.fn().mockResolvedValue(mockResponse) });
      const controller = new ServicesController(backendHttp);

      const result = await controller.create(validBody);

      expect(backendHttp.post).toHaveBeenCalledWith('/services', validBody);
      expect(result).toBe(mockResponse);
    });

    it('propagates backend errors', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockRejectedValue(new Error('400')),
      });
      const controller = new ServicesController(backendHttp);

      await expect(controller.create(validBody)).rejects.toThrow('400');
    });
  });
});
