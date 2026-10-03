import { HttpException, INestApplication } from '@nestjs/common';
import { HotsiteServiceListResponse } from '@ikaro/types';
import { MockBackendHttpService, createTestApp, request } from '../../test/component-test.helpers';
import { HotsiteServiceBuilder } from '../../test/builders/hotsite-service.builder';

const mockServiceResponse = new HotsiteServiceBuilder().build();

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

  // ─── GET /v1/public/services ───────────────────────────────────────────────

  describe('GET /v1/public/services', () => {
    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const res = await request(app.getHttpServer()).get('/v1/public/services');
      expect(res.status).toBe(400);
      expect(res.body.status).toBe(400);
    });

    it('returns active services list without a JWT', async () => {
      const tenantInfo = { id: 'tenant-uuid', slug: 'lavacar-bh', name: 'Lavacar BH' };
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.getForPublic = jest.fn().mockResolvedValueOnce(mockListResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/public/services')
        .set('X-Tenant-Slug', 'lavacar-bh');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockListResponse);
    });

    it('propagates 404 from backend when slug is unknown', async () => {
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException({ title: 'Not Found', status: 404 }, 404),
      );

      const res = await request(app.getHttpServer())
        .get('/v1/public/services')
        .set('X-Tenant-Slug', 'unknown-slug');

      expect(res.status).toBe(404);
    });
  });

  // ─── GET /v1/public/services/:id/intake-schema (M23-S02, UC-068) ────────────

  const SERVICE_ID = '10000000-0000-4000-8000-000000000002';

  describe('GET /v1/public/services/:id/intake-schema', () => {
    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const res = await request(app.getHttpServer()).get(
        `/v1/public/services/${SERVICE_ID}/intake-schema`,
      );
      expect(res.status).toBe(400);
      expect(res.body.status).toBe(400);
    });

    it('returns the active schema only, without a JWT', async () => {
      const tenantInfo = { id: 'tenant-uuid', slug: 'lavacar-bh', name: 'Lavacar BH' };
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.getForPublic = jest.fn().mockResolvedValueOnce({
        active: {
          id: 'schema-uuid',
          version: 1,
          questions: [
            { fieldKey: 'vehiclePlate', label: 'Placa', type: 'FREE_TEXT', required: true },
          ],
          consentText: 'Aceito os termos',
          consentVersion: 1,
          requiresNamedAttendees: false,
          participantCountRequired: false,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/public/services/${SERVICE_ID}/intake-schema`)
        .set('X-Tenant-Slug', 'lavacar-bh');

      expect(res.status).toBe(200);
      expect(res.body.active.version).toBe(1);
      expect(res.body).not.toHaveProperty('history');
      expect(backendHttpService.getForPublic).toHaveBeenCalledWith(
        `/services/${SERVICE_ID}/intake-schema/public`,
        'tenant-uuid',
      );
    });

    it('propagates 404 from backend for a missing/cross-tenant service id', async () => {
      const tenantInfo = { id: 'tenant-uuid', slug: 'lavacar-bh', name: 'Lavacar BH' };
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.getForPublic = jest
        .fn()
        .mockRejectedValueOnce(new HttpException({ title: 'Not Found', status: 404 }, 404));

      const res = await request(app.getHttpServer())
        .get(`/v1/public/services/00000000-0000-4000-8000-000000009999/intake-schema`)
        .set('X-Tenant-Slug', 'lavacar-bh');

      expect(res.status).toBe(404);
    });
  });

  // ─── GET /v1/public/services/:id/resource-options and /quote (M23-S29) ──────

  describe('GET /v1/public/services/:id/resource-options', () => {
    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const res = await request(app.getHttpServer()).get(
        `/v1/public/services/${SERVICE_ID}/resource-options`,
      );
      expect(res.status).toBe(400);
    });

    it('resolves the slug and returns the options without a JWT', async () => {
      backendHttpService.get.mockResolvedValueOnce({ id: 'tenant-uuid', slug: 'lavacar-bh' });
      backendHttpService.getForPublic = jest.fn().mockResolvedValueOnce({
        requirements: [
          {
            serviceId: SERVICE_ID,
            legIndex: 0,
            resourceType: 'ROOM',
            selectionMode: 'CUSTOMER_CHOICE',
            requiredQuantity: 1,
            options: [{ resourceId: 'r-1', name: 'Sala 1' }],
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .get(`/v1/public/services/${SERVICE_ID}/resource-options`)
        .set('X-Tenant-Slug', 'lavacar-bh');

      expect(res.status).toBe(200);
      expect(res.body.requirements[0].options).toEqual([{ resourceId: 'r-1', name: 'Sala 1' }]);
      expect(backendHttpService.getForPublic).toHaveBeenCalledWith(
        `/services/${SERVICE_ID}/resource-options`,
        'tenant-uuid',
      );
    });

    it('propagates 404 from the backend for a missing/inactive/cross-tenant service', async () => {
      backendHttpService.get.mockResolvedValueOnce({ id: 'tenant-uuid', slug: 'lavacar-bh' });
      backendHttpService.getForPublic = jest
        .fn()
        .mockRejectedValueOnce(new HttpException({ title: 'Not Found', status: 404 }, 404));

      const res = await request(app.getHttpServer())
        .get(`/v1/public/services/${SERVICE_ID}/resource-options`)
        .set('X-Tenant-Slug', 'lavacar-bh');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /v1/public/services/:id/quote', () => {
    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const res = await request(app.getHttpServer()).get(
        `/v1/public/services/${SERVICE_ID}/quote?durationMinutes=60`,
      );
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-numeric duration before reaching the backend', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/public/services/${SERVICE_ID}/quote?durationMinutes=abc`)
        .set('X-Tenant-Slug', 'lavacar-bh');

      expect(res.status).toBe(400);
    });

    it('forwards the duration and returns the quote without a JWT', async () => {
      backendHttpService.get.mockResolvedValueOnce({ id: 'tenant-uuid', slug: 'lavacar-bh' });
      backendHttpService.getForPublic = jest
        .fn()
        .mockResolvedValueOnce({ durationMinutes: 90, price: { amount: 100, currency: 'BRL' } });

      const res = await request(app.getHttpServer())
        .get(`/v1/public/services/${SERVICE_ID}/quote?durationMinutes=90`)
        .set('X-Tenant-Slug', 'lavacar-bh');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ durationMinutes: 90, price: { amount: 100, currency: 'BRL' } });
      expect(backendHttpService.getForPublic).toHaveBeenCalledWith(
        `/services/${SERVICE_ID}/quote`,
        'tenant-uuid',
        { durationMinutes: 90 },
      );
    });

    it('propagates 422 from the backend for an out-of-range duration', async () => {
      backendHttpService.get.mockResolvedValueOnce({ id: 'tenant-uuid', slug: 'lavacar-bh' });
      backendHttpService.getForPublic = jest
        .fn()
        .mockRejectedValueOnce(new HttpException({ title: 'Unprocessable', status: 422 }, 422));

      const res = await request(app.getHttpServer())
        .get(`/v1/public/services/${SERVICE_ID}/quote?durationMinutes=999`)
        .set('X-Tenant-Slug', 'lavacar-bh');

      expect(res.status).toBe(422);
    });
  });
});
