import { HttpException } from '@nestjs/common';
import { makeBackendHttp } from '../test/backend-http.mock';
import { ServicesController } from './services.controller';
import { ServiceListResponse, ServiceResponse } from './services.types';

const validCreateBody = {
  name: 'Lavagem Completa',
  priceAmount: 150,
  durationMinutes: 60,
  loyaltyPointsValue: 10,
};

const mockServiceResponse: ServiceResponse = {
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

  describe('list()', () => {
    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const backendHttp = makeBackendHttp();
      const controller = new ServicesController(backendHttp);

      const err = await controller.list(undefined).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
    });

    it('resolves slug to tenantId then calls GET /services', async () => {
      const tenantInfo = { id: 'tenant-uuid', slug: 'lavacar-bh', name: 'Lavacar BH' };
      const mockList: ServiceListResponse = { items: [mockServiceResponse] };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        getForPublic: jest.fn().mockResolvedValue(mockList),
      });
      const controller = new ServicesController(backendHttp);

      const result = await controller.list('lavacar-bh');

      expect(backendHttp.get).toHaveBeenCalledWith('/internal/tenants/by-slug/lavacar-bh');
      expect(backendHttp.getForPublic).toHaveBeenCalledWith('/services', 'tenant-uuid');
      expect(result).toBe(mockList);
    });
  });

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
