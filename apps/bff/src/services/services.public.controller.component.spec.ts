import { HttpException, INestApplication } from '@nestjs/common';
import { HotsiteServiceListResponse, HotsiteServiceResponse } from '@ikaro/types';
import { MockBackendHttpService, createTestApp, request } from '../test/component-test.helpers';

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

const mockListResponse: HotsiteServiceListResponse = { items: [mockServiceResponse] };

describe('ServicesPublicController (component)', () => {
  let app: INestApplication;
  let backendHttpService: MockBackendHttpService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, backendHttpService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ─── GET /v1/services (public) ───────────────────────────────────────────────

  describe('GET /v1/services (public)', () => {
    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const res = await request(app.getHttpServer()).get('/v1/services');
      expect(res.status).toBe(400);
      expect(res.body.status).toBe(400);
    });

    it('returns active services list without a JWT', async () => {
      const tenantInfo = { id: 'tenant-uuid', slug: 'lavacar-bh', name: 'Lavacar BH' };
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.getForPublic = jest.fn().mockResolvedValueOnce(mockListResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/services')
        .set('X-Tenant-Slug', 'lavacar-bh');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockListResponse);
    });

    it('propagates 404 from backend when slug is unknown', async () => {
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException({ title: 'Not Found', status: 404 }, 404),
      );

      const res = await request(app.getHttpServer())
        .get('/v1/services')
        .set('X-Tenant-Slug', 'unknown-slug');

      expect(res.status).toBe(404);
    });
  });
});
