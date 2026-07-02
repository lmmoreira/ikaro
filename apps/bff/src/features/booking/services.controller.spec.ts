import { makeBackendHttp } from '../../test/backend-http.mock';
import { ServicesController } from './services.controller';
import { ServiceDetail, ServiceListResponse } from './services.types';

const validCreateBody = {
  name: 'Lavagem Completa',
  priceAmount: 150,
  durationMinutes: 60,
  loyaltyPointsValue: 10,
};

const mockServiceDetail: ServiceDetail = {
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
    it('calls GET /services and maps to StaffServiceListResponse', async () => {
      const backendList: ServiceListResponse = { items: [mockServiceDetail] };
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(backendList) });
      const controller = new ServicesController(backendHttp);

      const result = await controller.list();

      expect(backendHttp.get).toHaveBeenCalledWith('/services');
      expect(result).toEqual({
        items: [
          {
            serviceId: SERVICE_ID,
            name: 'Lavagem Completa',
            description: null,
            price: { amount: 150, currency: 'BRL' },
            durationMinutes: 60,
            loyaltyPointsValue: 10,
            requiresPickupAddress: false,
            isActive: true,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
      });
    });
  });

  describe('getOne()', () => {
    it('calls GET /services/:id and maps to StaffServiceResponse', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(mockServiceDetail) });
      const controller = new ServicesController(backendHttp);

      const result = await controller.getOne(SERVICE_ID);

      expect(backendHttp.get).toHaveBeenCalledWith(`/services/${SERVICE_ID}`);
      expect(result.serviceId).toBe(SERVICE_ID);
    });

    it('propagates 404 from backend', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockRejectedValue(new Error('404')) });
      const controller = new ServicesController(backendHttp);

      await expect(controller.getOne(SERVICE_ID)).rejects.toThrow('404');
    });
  });

  describe('create()', () => {
    it('calls POST /services with body and returns StaffServiceResponse', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockResolvedValue(mockServiceDetail),
      });
      const controller = new ServicesController(backendHttp);

      const result = await controller.create(validCreateBody);

      expect(backendHttp.post).toHaveBeenCalledWith('/services', validCreateBody);
      expect(result.serviceId).toBe(SERVICE_ID);
      expect(result.name).toBe('Lavagem Completa');
    });

    it('forwards optional isActive flag when present', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockResolvedValue(mockServiceDetail),
      });
      const controller = new ServicesController(backendHttp);

      await controller.create({ ...validCreateBody, isActive: false });

      expect(backendHttp.post).toHaveBeenCalledWith('/services', {
        ...validCreateBody,
        isActive: false,
      });
    });

    it('propagates backend errors', async () => {
      const backendHttp = makeBackendHttp({ post: jest.fn().mockRejectedValue(new Error('400')) });
      const controller = new ServicesController(backendHttp);

      await expect(controller.create(validCreateBody)).rejects.toThrow('400');
    });
  });

  describe('update()', () => {
    it('calls PATCH /services/:id with body and returns StaffServiceResponse', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockResolvedValue(mockServiceDetail),
      });
      const controller = new ServicesController(backendHttp);

      const result = await controller.update(SERVICE_ID, { name: 'Novo Nome' });

      expect(backendHttp.patch).toHaveBeenCalledWith(`/services/${SERVICE_ID}`, {
        name: 'Novo Nome',
      });
      expect(result.serviceId).toBe(SERVICE_ID);
    });

    it('propagates 404 from backend', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockRejectedValue(new Error('404')),
      });
      const controller = new ServicesController(backendHttp);

      await expect(controller.update(SERVICE_ID, { name: 'X' })).rejects.toThrow('404');
    });
  });

  describe('activate()', () => {
    it('calls PATCH /services/:id/activate and returns nothing', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockResolvedValue({ id: SERVICE_ID, isActive: true }),
      });
      const controller = new ServicesController(backendHttp);

      const result = await controller.activate(SERVICE_ID);

      expect(backendHttp.patch).toHaveBeenCalledWith(`/services/${SERVICE_ID}/activate`, {});
      expect(result).toBeUndefined();
    });
  });

  describe('deactivate()', () => {
    it('calls DELETE /services/:id and returns nothing (204)', async () => {
      const backendHttp = makeBackendHttp({
        delete: jest.fn().mockResolvedValue({ id: SERVICE_ID, isActive: false }),
      });
      const controller = new ServicesController(backendHttp);

      const result = await controller.deactivate(SERVICE_ID);

      expect(backendHttp.delete).toHaveBeenCalledWith(`/services/${SERVICE_ID}`);
      expect(result).toBeUndefined();
    });
  });
});
