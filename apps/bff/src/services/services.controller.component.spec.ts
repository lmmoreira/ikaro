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
} from '../test/component-test.helpers';
import { ServiceResponse } from './services.types';

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

const validBody = {
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Group A — Authentication gate
  // ─────────────────────────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('POST /v1/services → 401 without a token', async () => {
      const res = await request(app.getHttpServer()).post('/v1/services').send(validBody);
      expect(res.status).toBe(401);
    });

    it('POST /v1/services → 401 with a malformed token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', 'Bearer not.a.jwt')
        .send(validBody);
      expect(res.status).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group B — Role gate
  // ─────────────────────────────────────────────────────────────────────────────

  describe('role enforcement', () => {
    it('POST /v1/services → 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send(validBody);
      expect(res.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group C — Input validation (ZodValidationPipe)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('input validation', () => {
    it('POST /v1/services → 400 when priceAmount is negative', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ ...validBody, priceAmount: -50 });
      expect(res.status).toBe(400);
    });

    it('POST /v1/services → 400 when priceAmount is zero', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ ...validBody, priceAmount: 0 });
      expect(res.status).toBe(400);
    });

    it('POST /v1/services → 400 when durationMinutes is zero', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ ...validBody, durationMinutes: 0 });
      expect(res.status).toBe(400);
    });

    it('POST /v1/services → 400 when loyaltyPointsValue is negative', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ ...validBody, loyaltyPointsValue: -1 });
      expect(res.status).toBe(400);
    });

    it('POST /v1/services → 400 when name is missing', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ priceAmount: 150, durationMinutes: 60, loyaltyPointsValue: 10 });
      expect(res.status).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group D — Happy paths
  // ─────────────────────────────────────────────────────────────────────────────

  describe('happy paths', () => {
    it('POST /v1/services with MANAGER JWT → 201, calls POST /services on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockServiceResponse);

      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body).toEqual(mockServiceResponse);
      expect(backendHttpService.post).toHaveBeenCalledWith('/services', validBody);
    });

    it('POST /v1/services with STAFF JWT → 201', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockServiceResponse);

      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send(validBody);

      expect(res.status).toBe(201);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Group E — Backend error propagation
  // ─────────────────────────────────────────────────────────────────────────────

  describe('backend error propagation', () => {
    it('propagates 400 from backend as-is', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(
        new HttpException({ title: 'Bad Request', status: 400 }, 400),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/services')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send(validBody);

      expect(res.status).toBe(400);
    });
  });
});
