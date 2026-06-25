import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CustomerProfileResponse } from '@ikaro/types';
import {
  CUSTOMER_ID,
  TENANT_ID,
  TENANT_ID_2,
  MockHttpService,
  MockBackendHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeStaffJwt,
  setupActiveGuardMock,
  request,
} from '../test/component-test.helpers';

const mockProfile: CustomerProfileResponse = {
  customerId: '20000000-0000-4000-8000-000000000001',
  email: 'cliente@example.com',
  name: 'João Silva',
  phone: '+5531999999999',
  defaultAddress: null,
};

describe('CustomersController (component)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let httpService: MockHttpService;
  let backendHttpService: MockBackendHttpService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, jwtService, httpService, backendHttpService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /v1/customers/me', () => {
    it('returns 401 when no JWT is provided', async () => {
      const res = await request(app.getHttpServer()).get('/v1/customers/me');
      expect(res.status).toBe(401);
    });

    it('returns 403 when JWT role is MANAGER (not CUSTOMER)', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/customers/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('returns 200 with the customer profile for a valid CUSTOMER JWT', async () => {
      const token = makeCustomerJwt(jwtService);
      backendHttpService.get.mockResolvedValue(mockProfile);

      const res = await request(app.getHttpServer())
        .get('/v1/customers/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockProfile);
      expect(backendHttpService.get).toHaveBeenCalledWith('/customers/me');
    });

    it('propagates backend 404 error', async () => {
      const token = makeCustomerJwt(jwtService);
      const { HttpException: HE } = await import('@nestjs/common');
      backendHttpService.get.mockRejectedValue(new HE({ status: 404 }, 404));

      const res = await request(app.getHttpServer())
        .get('/v1/customers/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /v1/customers/me', () => {
    const validBody = { name: 'New Name', phone: '+5531988888888' };

    it('returns 401 when no JWT is provided', async () => {
      const res = await request(app.getHttpServer()).patch('/v1/customers/me').send(validBody);
      expect(res.status).toBe(401);
    });

    it('returns 403 when JWT role is STAFF (not CUSTOMER)', async () => {
      const token = makeManagerJwt(jwtService, { role: 'STAFF' });
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .patch('/v1/customers/me')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody);
      expect(res.status).toBe(403);
    });

    it('returns 400 when Zod validation fails (empty name)', async () => {
      const token = makeCustomerJwt(jwtService);
      const res = await request(app.getHttpServer())
        .patch('/v1/customers/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when phone has invalid format', async () => {
      const token = makeCustomerJwt(jwtService);
      const res = await request(app.getHttpServer())
        .patch('/v1/customers/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '123' });
      expect(res.status).toBe(400);
    });

    it('returns 200 with the updated profile on success', async () => {
      const token = makeCustomerJwt(jwtService);
      const updated = { ...mockProfile, name: 'New Name', phone: '+5531988888888' };
      backendHttpService.patch.mockResolvedValue(updated);

      const res = await request(app.getHttpServer())
        .patch('/v1/customers/me')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Name');
      expect(backendHttpService.patch).toHaveBeenCalledWith('/customers/me', validBody);
    });

    it('propagates backend 400 error (invalid phone from domain)', async () => {
      const token = makeCustomerJwt(jwtService);
      const { HttpException: HE } = await import('@nestjs/common');
      backendHttpService.patch.mockRejectedValue(new HE({ status: 400 }, 400));

      const res = await request(app.getHttpServer())
        .patch('/v1/customers/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ phone: '+5531988888888' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/customers', () => {
    const backendItems = {
      items: [
        {
          customerId: '20000000-0000-4000-8000-000000000001',
          name: 'João Silva',
          email: 'joao@example.com',
        },
      ],
      total: 1,
    };
    const mockBalance = { currentPoints: 50, nextExpiryDate: null, nextExpiryPoints: null };

    it('returns 200 with search results for STAFF JWT', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(backendItems).mockResolvedValueOnce(mockBalance);
      const token = makeStaffJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/customers?search=joao1&limit=20')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0].currentPoints).toBe(50);
    });

    it('returns 200 with all customers when search is omitted', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValue({ items: [], total: 0 });
      const token = makeManagerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/customers')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
    });

    it('returns 400 when search param is shorter than 5 chars', async () => {
      setupActiveGuardMock(httpService);
      const token = makeStaffJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/customers?search=jo')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(400);
    });

    it('returns 403 for CUSTOMER JWT', async () => {
      setupActiveGuardMock(httpService);
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/customers')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /v1/customers/tenants', () => {
    it('returns 401 when no JWT is provided', async () => {
      const res = await request(app.getHttpServer()).get('/v1/customers/tenants');
      expect(res.status).toBe(401);
    });

    it('returns 403 when JWT role is MANAGER (not CUSTOMER)', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/customers/tenants')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('includes the current tenant and returns enriched TenantOption[] for all of them', async () => {
      const token = makeCustomerJwt(jwtService);
      backendHttpService.get
        .mockResolvedValueOnce([
          { tenantId: TENANT_ID, customerId: CUSTOMER_ID },
          { tenantId: TENANT_ID_2, customerId: 'cid-other' },
        ])
        .mockResolvedValueOnce({ id: TENANT_ID, slug: 'lavacar-bh', name: 'Lavacar BH' })
        .mockResolvedValueOnce({ currentPoints: 120 })
        .mockResolvedValueOnce({ id: TENANT_ID_2, slug: 'superclean', name: 'SuperClean' })
        .mockResolvedValueOnce({ currentPoints: 8 });

      const res = await request(app.getHttpServer())
        .get('/v1/customers/tenants')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: TENANT_ID, name: 'Lavacar BH', slug: 'lavacar-bh', loyaltyPoints: 120 },
        { id: TENANT_ID_2, name: 'SuperClean', slug: 'superclean', loyaltyPoints: 8 },
      ]);
    });

    it('propagates backend error when tenant list fetch fails', async () => {
      const token = makeCustomerJwt(jwtService);
      const { HttpException: HE } = await import('@nestjs/common');
      backendHttpService.get.mockRejectedValue(new HE({ status: 503 }, 503));

      const res = await request(app.getHttpServer())
        .get('/v1/customers/tenants')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(503);
    });

    it('does not leak a different customer JWT tenant data (tenant isolation)', async () => {
      const tokenA = makeCustomerJwt(jwtService);
      backendHttpService.get
        .mockResolvedValueOnce([{ tenantId: TENANT_ID, customerId: CUSTOMER_ID }])
        .mockResolvedValueOnce({ id: TENANT_ID, slug: 'lavacar-bh', name: 'Lavacar BH' })
        .mockResolvedValueOnce({ currentPoints: 120 });

      const res = await request(app.getHttpServer())
        .get('/v1/customers/tenants')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: TENANT_ID, name: 'Lavacar BH', slug: 'lavacar-bh', loyaltyPoints: 120 },
      ]);
      expect(backendHttpService.get).toHaveBeenCalledWith('/customers/me/tenants');
    });
  });
});
