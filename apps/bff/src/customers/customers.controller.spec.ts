import { HttpException } from '@nestjs/common';
import { CustomerProfileResponse, CustomerSearchListResponse } from '@ikaro/types';
import { makeBackendHttp } from '../test/backend-http.mock';
import { CustomersController } from './customers.controller';

const mockProfile: CustomerProfileResponse = {
  customerId: '20000000-0000-4000-8000-000000000001',
  email: 'cliente@example.com',
  name: 'João Silva',
  phone: '+5531999999999',
  defaultAddress: null,
};

const mockSearchResult: CustomerSearchListResponse = {
  items: [
    {
      customerId: '20000000-0000-4000-8000-000000000001',
      name: 'João Silva',
      email: 'joao@example.com',
      currentPoints: 50,
    },
  ],
  total: 1,
};

describe('CustomersController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('searchCustomers()', () => {
    it('calls GET /customers with search and limit params', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(mockSearchResult) });
      const controller = new CustomersController(backendHttp);

      const result = await controller.searchCustomers({ search: 'joao1', limit: 20 });

      expect(backendHttp.get).toHaveBeenCalledWith('/customers?limit=20&search=joao1');
      expect(result).toBe(mockSearchResult);
    });

    it('calls GET /customers without search when omitted', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(mockSearchResult) });
      const controller = new CustomersController(backendHttp);

      await controller.searchCustomers({ limit: 10 });

      expect(backendHttp.get).toHaveBeenCalledWith('/customers?limit=10');
    });
  });

  describe('getProfile()', () => {
    it('calls GET /customers/me and returns the profile', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(mockProfile) });
      const controller = new CustomersController(backendHttp);

      const result = await controller.getProfile();

      expect(backendHttp.get).toHaveBeenCalledWith('/customers/me');
      expect(result).toBe(mockProfile);
    });

    it('propagates backend 404 error', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockRejectedValue(new HttpException({ status: 404 }, 404)),
      });
      const controller = new CustomersController(backendHttp);

      const err = await controller.getProfile().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });

  describe('updateProfile()', () => {
    it('calls PATCH /customers/me with body and returns updated profile', async () => {
      const updated = { ...mockProfile, name: 'Updated Name' };
      const backendHttp = makeBackendHttp({ patch: jest.fn().mockResolvedValue(updated) });
      const controller = new CustomersController(backendHttp);

      const result = await controller.updateProfile({ name: 'Updated Name' });

      expect(backendHttp.patch).toHaveBeenCalledWith('/customers/me', { name: 'Updated Name' });
      expect(result.name).toBe('Updated Name');
    });

    it('propagates backend 400 error (invalid phone)', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockRejectedValue(new HttpException({ status: 400 }, 400)),
      });
      const controller = new CustomersController(backendHttp);

      const err = await controller.updateProfile({ phone: '123' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
    });

    it('propagates backend 404 when customer not found', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockRejectedValue(new HttpException({ status: 404 }, 404)),
      });
      const controller = new CustomersController(backendHttp);

      const err = await controller.updateProfile({ name: 'X' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });
});
