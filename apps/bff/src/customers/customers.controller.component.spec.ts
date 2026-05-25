import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MockHttpService,
  MockBackendHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  setupActiveGuardMock,
  request,
} from '../test/component-test.helpers';
import { CustomerProfileResponse } from './customers.types';

const mockProfile: CustomerProfileResponse = {
  customerId: '20000000-0000-4000-8000-000000000001',
  email: 'cliente@example.com',
  name: 'João Silva',
  phone: '31999999999',
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
    const validBody = { name: 'New Name', phone: '31988888888' };

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
      const updated = { ...mockProfile, name: 'New Name', phone: '31988888888' };
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
        .send({ phone: '31988888888' });

      expect(res.status).toBe(400);
    });
  });
});
