import { HotsiteServiceResponse } from '@ikaro/types';
import { makeBackendHttp } from '../test/backend-http.mock';
import { ServicesController } from './services.controller';

const validCreateBody = {
  name: 'Lavagem Completa',
  priceAmount: 150,
  durationMinutes: 60,
  loyaltyPointsValue: 10,
};

const mockServiceResponse: HotsiteServiceResponse = {
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

const SERVICE_ID = '10000000-0000-4000-8000-000000000001';

describe('ServicesController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('create()', () => {
    it('calls POST /services with body and returns the backend response', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockResolvedValue(mockServiceResponse),
      });
      const controller = new ServicesController(backendHttp);

      const result = await controller.create(validCreateBody);

      expect(backendHttp.post).toHaveBeenCalledWith('/services', validCreateBody);
      expect(result).toBe(mockServiceResponse);
    });

    it('propagates backend errors', async () => {
      const backendHttp = makeBackendHttp({ post: jest.fn().mockRejectedValue(new Error('400')) });
      const controller = new ServicesController(backendHttp);

      await expect(controller.create(validCreateBody)).rejects.toThrow('400');
    });
  });

  describe('update()', () => {
    it('calls PATCH /services/:id with body', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockResolvedValue(mockServiceResponse),
      });
      const controller = new ServicesController(backendHttp);

      const result = await controller.update(SERVICE_ID, { name: 'Novo Nome' });

      expect(backendHttp.patch).toHaveBeenCalledWith(`/services/${SERVICE_ID}`, {
        name: 'Novo Nome',
      });
      expect(result).toBe(mockServiceResponse);
    });

    it('propagates 404 from backend', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockRejectedValue(new Error('404')),
      });
      const controller = new ServicesController(backendHttp);

      await expect(controller.update(SERVICE_ID, { name: 'X' })).rejects.toThrow('404');
    });
  });

  describe('deactivate()', () => {
    it('calls DELETE /services/:id', async () => {
      const backendHttp = makeBackendHttp({
        delete: jest.fn().mockResolvedValue({ id: SERVICE_ID, isActive: false }),
      });
      const controller = new ServicesController(backendHttp);

      const result = await controller.deactivate(SERVICE_ID);

      expect(backendHttp.delete).toHaveBeenCalledWith(`/services/${SERVICE_ID}`);
      expect(result.isActive).toBe(false);
    });
  });
});
