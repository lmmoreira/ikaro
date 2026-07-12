import { HttpException } from '@nestjs/common';
import { BffErrorCode, CustomerProfileResponse } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { LoyaltyBalanceResponse } from '../loyalty/loyalty.types';
import { CustomersController } from './customers.controller';

const mockProfile: CustomerProfileResponse = {
  customerId: '20000000-0000-4000-8000-000000000001',
  email: 'cliente@example.com',
  name: 'João Silva',
  phone: '+5531999999999',
  defaultAddress: null,
};

const mockBackendSearch: {
  items: { customerId: string; name: string; email: string }[];
  total: number;
} = {
  items: [
    {
      customerId: '20000000-0000-4000-8000-000000000001',
      name: 'João Silva',
      email: 'joao@example.com',
    },
  ],
  total: 1,
};
const mockBalance: LoyaltyBalanceResponse = {
  currentPoints: 50,
  nextExpiryDate: null,
  nextExpiryPoints: null,
  conversionRate: 0,
};

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const TENANT_ID_B = '10000000-0000-4000-8000-000000000002';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000001';
const CUSTOMER_ID_B = '20000000-0000-4000-8000-000000000002';

describe('CustomersController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('searchCustomers()', () => {
    it('calls GET /customers then enriches each result with currentPoints from loyalty/balance', async () => {
      const getMock = jest
        .fn()
        .mockResolvedValueOnce(mockBackendSearch)
        .mockResolvedValueOnce(mockBalance);
      const backendHttp = makeBackendHttp({ get: getMock });
      const controller = new CustomersController(backendHttp);

      const result = await controller.searchCustomers({ search: 'joao1', limit: 20 });

      expect(getMock).toHaveBeenCalledWith('/customers?limit=20&search=joao1');
      expect(getMock).toHaveBeenCalledWith(
        '/customers/20000000-0000-4000-8000-000000000001/loyalty/balance',
      );
      expect(result.items[0]?.currentPoints).toBe(50);
      expect(result.total).toBe(1);
    });

    it('calls GET /customers without search when omitted', async () => {
      const getMock = jest.fn().mockResolvedValueOnce({ items: [], total: 0 });
      const backendHttp = makeBackendHttp({ get: getMock });
      const controller = new CustomersController(backendHttp);

      await controller.searchCustomers({ limit: 10 });

      expect(getMock).toHaveBeenCalledWith('/customers?limit=10');
    });
  });

  describe('getCustomer()', () => {
    it('calls GET /customers/:id and returns the customer profile', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(mockProfile) });
      const controller = new CustomersController(backendHttp);

      const result = await controller.getCustomer(CUSTOMER_ID);

      expect(backendHttp.get).toHaveBeenCalledWith(`/customers/${CUSTOMER_ID}`);
      expect(result).toBe(mockProfile);
    });

    it('propagates backend 404 error', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockRejectedValue(new HttpException({ status: 404 }, 404)),
      });
      const controller = new CustomersController(backendHttp);

      const err = await controller.getCustomer(CUSTOMER_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
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

  describe('getTenants()', () => {
    it('includes the current tenant alongside the others, each enriched', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([
            { tenantId: TENANT_ID, customerId: CUSTOMER_ID },
            { tenantId: TENANT_ID_B, customerId: CUSTOMER_ID_B },
          ])
          .mockResolvedValueOnce([
            { id: TENANT_ID, slug: 'lavacar-bh', name: 'Lavacar BH' },
            { id: TENANT_ID_B, slug: 'superclean', name: 'SuperClean' },
          ])
          .mockResolvedValueOnce({ currentPoints: 120 })
          .mockResolvedValueOnce({ currentPoints: 8 }),
      });
      const controller = new CustomersController(backendHttp);

      const result = await controller.getTenants();

      expect(result).toEqual([
        { id: TENANT_ID, name: 'Lavacar BH', slug: 'lavacar-bh', loyaltyPoints: 120 },
        { id: TENANT_ID_B, name: 'SuperClean', slug: 'superclean', loyaltyPoints: 8 },
      ]);
      expect(backendHttp.get).toHaveBeenCalledWith('/customers/me/tenants');
    });

    it('returns a single-item array when the customer belongs to only the current tenant', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([{ tenantId: TENANT_ID, customerId: CUSTOMER_ID }])
          .mockResolvedValueOnce([{ id: TENANT_ID, slug: 'lavacar-bh', name: 'Lavacar BH' }])
          .mockResolvedValueOnce({ currentPoints: 120 }),
      });
      const controller = new CustomersController(backendHttp);

      const result = await controller.getTenants();

      expect(result).toEqual([
        { id: TENANT_ID, name: 'Lavacar BH', slug: 'lavacar-bh', loyaltyPoints: 120 },
      ]);
    });

    it('throws 500 with BFF_TENANT_LOOKUP_INCONSISTENT when a tenant batch response misses a referenced tenant', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockResolvedValueOnce([{ tenantId: TENANT_ID, customerId: CUSTOMER_ID }])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce({ currentPoints: 120 }),
      });
      const controller = new CustomersController(backendHttp);

      const err = await controller.getTenants().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(500);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: BffErrorCode.TENANT_LOOKUP_INCONSISTENT,
        detail: `Tenant ${TENANT_ID} missing from batch response`,
      });
    });
  });
});
