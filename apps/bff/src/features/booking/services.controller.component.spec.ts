import { HttpException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MockHttpService,
  MockBackendHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeStaffJwt,
  setupActiveGuardMock,
  request,
} from '../../test/component-test.helpers';
import { ServiceDetail } from './services.types';

const SERVICE_ID = '10000000-0000-4000-8000-000000000001';

const mockServiceDetail: ServiceDetail = {
  id: SERVICE_ID,
  name: 'Lavagem Completa',
  description: null,
  price: { amount: 150, currency: 'BRL' },
  durationMinutes: 60,
  loyaltyPointsValue: 10,
  requiresPickupAddress: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  bookingModel: 'APPOINTMENT',
  resourceRequirements: [],
  bufferAfterMinutes: 60,
  legs: null,
  classResourceSlots: null,
};

const mockStaffServiceResponse = {
  serviceId: SERVICE_ID,
  name: 'Lavagem Completa',
  description: null,
  price: { amount: 150, currency: 'BRL' },
  durationMinutes: 60,
  loyaltyPointsValue: 10,
  requiresPickupAddress: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  bookingModel: 'APPOINTMENT',
  resourceRequirements: [],
  bufferAfterMinutes: 60,
  legs: null,
  classResourceSlots: null,
};

const validCreateBody = {
  name: 'Lavagem Completa',
  priceAmount: 150,
  durationMinutes: 60,
  loyaltyPointsValue: 10,
};

describe('ServicesController (component)', () => {
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

  // ─── GET /v1/services ────────────────────────────────────────────────────────

  describe('GET /v1/services', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/services');
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/services')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 200, returns StaffServiceListResponse including inactive', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce({ items: [mockServiceDetail] });

      const res = await request(app.getHttpServer())
        .get('/v1/services')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [mockStaffServiceResponse], total: 1 });
      expect(backendHttpService.get).toHaveBeenCalledWith('/services');
    });

    it('STAFF JWT → 200', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce({ items: [mockServiceDetail] });

      const res = await request(app.getHttpServer())
        .get('/v1/services')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(200);
    });
  });

  // ─── GET /v1/services/:id ─────────────────────────────────────────────────────

  describe('GET /v1/services/:id', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get(`/v1/services/${SERVICE_ID}`);
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/services/${SERVICE_ID}`)
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 200, returns StaffServiceResponse', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(mockServiceDetail);

      const res = await request(app.getHttpServer())
        .get(`/v1/services/${SERVICE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockStaffServiceResponse);
      expect(backendHttpService.get).toHaveBeenCalledWith(`/services/${SERVICE_ID}`);
    });

    it('STAFF JWT → 200', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(mockServiceDetail);

      const res = await request(app.getHttpServer())
        .get(`/v1/services/${SERVICE_ID}`)
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(200);
    });

    it('propagates 404 from backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException({ title: 'Not Found', status: 404 }, 404),
      );

      const res = await request(app.getHttpServer())
        .get(`/v1/services/${SERVICE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── POST /v1/services ───────────────────────────────────────────────────────

  describe('POST /v1/services', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).post('/v1/services').send(validCreateBody);
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send(validCreateBody);
      expect(res.status).toBe(403);
    });

    it('returns 400 when priceAmount is negative (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ ...validCreateBody, priceAmount: -50 });
      expect(res.status).toBe(400);
    });

    it('MANAGER JWT → 201, calls POST /services on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockServiceDetail);

      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send(validCreateBody);

      expect(res.status).toBe(201);
      expect(res.body).toEqual(mockStaffServiceResponse);
      expect(backendHttpService.post).toHaveBeenCalledWith('/services', validCreateBody);
    });

    it('STAFF JWT → 201', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockServiceDetail);

      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send(validCreateBody);

      expect(res.status).toBe(201);
    });
  });

  // ─── PATCH /v1/services/:id ──────────────────────────────────────────────────

  describe('PATCH /v1/services/:id', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/services/${SERVICE_ID}`)
        .send({ name: 'X' });
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/services/${SERVICE_ID}`)
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({ name: 'X' });
      expect(res.status).toBe(403);
    });

    it('returns 400 when id is not a UUID', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .patch('/v1/services/not-a-uuid')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ name: 'X' });
      expect(res.status).toBe(400);
    });

    it('MANAGER JWT → 200, calls PATCH /services/:id', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(mockServiceDetail);

      const res = await request(app.getHttpServer())
        .patch(`/v1/services/${SERVICE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ name: 'Novo Nome' });

      expect(res.status).toBe(200);
      expect(backendHttpService.patch).toHaveBeenCalledWith(`/services/${SERVICE_ID}`, {
        name: 'Novo Nome',
      });
    });

    it('propagates 409 from backend when service is deactivated', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HttpException({ title: 'Conflict', status: 409 }, 409),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/services/${SERVICE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ name: 'X' });

      expect(res.status).toBe(409);
    });
  });

  // ─── PATCH /v1/services/:id/resource-requirements ──────────────────────────

  describe('PATCH /v1/services/:id/resource-requirements', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/services/${SERVICE_ID}/resource-requirements`)
        .send({ resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }] });
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/services/${SERVICE_ID}/resource-requirements`)
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({ resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }] });
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 200, calls PATCH /services/:id/resource-requirements', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce({ id: SERVICE_ID, resourceRequirements: [] });

      const res = await request(app.getHttpServer())
        .patch(`/v1/services/${SERVICE_ID}/resource-requirements`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }] });

      expect(res.status).toBe(200);
      expect(backendHttpService.patch).toHaveBeenCalledWith(
        `/services/${SERVICE_ID}/resource-requirements`,
        { resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }] },
      );
    });

    it('propagates 422 from backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HttpException({ title: 'Unprocessable Entity', status: 422 }, 422),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/services/${SERVICE_ID}/resource-requirements`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ resourceRequirements: [{ type: 'EQUIPMENT', selectionMode: 'AUTO_ANY' }] });

      expect(res.status).toBe(422);
    });
  });

  // ─── PUT /v1/services/:id/legs ──────────────────────────────────────────────

  describe('PUT /v1/services/:id/legs', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer())
        .put(`/v1/services/${SERVICE_ID}/legs`)
        .send({ legs: [] });
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .put(`/v1/services/${SERVICE_ID}/legs`)
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({ legs: [] });
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 200, calls PUT /services/:id/legs', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.put.mockResolvedValueOnce({
        id: SERVICE_ID,
        legs: [],
        totalSpanMinutes: 0,
      });
      const legs = [
        {
          legIndex: 0,
          name: 'Sauna',
          durationMinutes: 20,
          resourceRequirements: [{ type: 'ROOM', selectionMode: 'AUTO_ANY' }],
        },
        {
          legIndex: 1,
          name: 'Massagem',
          durationMinutes: 50,
          resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }],
        },
      ];

      const res = await request(app.getHttpServer())
        .put(`/v1/services/${SERVICE_ID}/legs`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ legs });

      expect(res.status).toBe(200);
      expect(backendHttpService.put).toHaveBeenCalledWith(`/services/${SERVICE_ID}/legs`, { legs });
    });

    it('propagates 422 from backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.put.mockRejectedValueOnce(
        new HttpException({ title: 'Unprocessable Entity', status: 422 }, 422),
      );

      const res = await request(app.getHttpServer())
        .put(`/v1/services/${SERVICE_ID}/legs`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ legs: [] });

      expect(res.status).toBe(422);
    });
  });

  // ─── PATCH /v1/services/:id/activate ────────────────────────────────────────

  describe('PATCH /v1/services/:id/activate', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).patch(`/v1/services/${SERVICE_ID}/activate`);
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/services/${SERVICE_ID}/activate`)
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 200, calls PATCH /services/:id/activate', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce({ id: SERVICE_ID, isActive: true });

      const res = await request(app.getHttpServer())
        .patch(`/v1/services/${SERVICE_ID}/activate`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(backendHttpService.patch).toHaveBeenCalledWith(`/services/${SERVICE_ID}/activate`, {});
    });

    it('propagates 404 from backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HttpException({ title: 'Not Found', status: 404 }, 404),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/services/${SERVICE_ID}/activate`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE /v1/services/:id ─────────────────────────────────────────────────

  describe('DELETE /v1/services/:id', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).delete(`/v1/services/${SERVICE_ID}`);
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/v1/services/${SERVICE_ID}`)
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 204, calls DELETE /services/:id', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.delete.mockResolvedValueOnce({ id: SERVICE_ID, isActive: false });

      const res = await request(app.getHttpServer())
        .delete(`/v1/services/${SERVICE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
      expect(backendHttpService.delete).toHaveBeenCalledWith(`/services/${SERVICE_ID}`);
    });

    it('propagates 404 from backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.delete.mockRejectedValueOnce(
        new HttpException({ title: 'Not Found', status: 404 }, 404),
      );

      const res = await request(app.getHttpServer())
        .delete(`/v1/services/${SERVICE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(404);
    });
  });
});
