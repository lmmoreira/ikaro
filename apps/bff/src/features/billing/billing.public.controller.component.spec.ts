import { HttpException, INestApplication } from '@nestjs/common';
import { MockBackendHttpService, createTestApp, request } from '../../test/component-test.helpers';

const URL = '/v1/public/billing/prices';

const BACKEND_OFFERED = {
  offered: true,
  countryCode: 'BR',
  currency: 'BRL',
  taxBehavior: 'INCLUSIVE',
  prices: [
    {
      featureKey: 'HOTSITE',
      tier: 'STANDARD',
      cycle: 'MONTHLY',
      currency: 'BRL',
      amountMinor: 4900,
      effectiveFrom: '2026-01-01',
    },
    {
      featureKey: 'CHATBOT',
      tier: 'PLUS',
      cycle: 'MONTHLY',
      currency: 'BRL',
      amountMinor: 7900,
      effectiveFrom: '2026-01-01',
      upcoming: { amountMinor: 8900, effectiveFrom: '2026-12-10' },
    },
  ],
};

describe('BillingPublicController (component)', () => {
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

  describe('GET /v1/public/billing/prices (public)', () => {
    it('returns the price list for a country without a JWT, in the public shape', async () => {
      backendHttpService.get.mockResolvedValueOnce(BACKEND_OFFERED);

      const res = await request(app.getHttpServer()).get(`${URL}?country=BR`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        countryCode: 'BR',
        currency: 'BRL',
        taxBehavior: 'INCLUSIVE',
        items: [
          { featureKey: 'HOTSITE', tier: 'STANDARD', amountMinor: 4900 },
          {
            featureKey: 'CHATBOT',
            tier: 'PLUS',
            amountMinor: 7900,
            upcoming: { amountMinor: 8900, effectiveFrom: '2026-12-10' },
          },
        ],
      });
      expect(backendHttpService.get).toHaveBeenCalledWith('/internal/billing/public-prices', {
        country: 'BR',
      });
    });

    it('is cacheable for five minutes', async () => {
      backendHttpService.get.mockResolvedValueOnce(BACKEND_OFFERED);

      const res = await request(app.getHttpServer()).get(`${URL}?country=BR`);

      expect(res.headers['cache-control']).toBe('public, max-age=300');
    });

    it('answers a country that is not offered with exactly an empty list', async () => {
      backendHttpService.get.mockResolvedValueOnce({ offered: false });

      const res = await request(app.getHttpServer()).get(`${URL}?country=US`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });
    });

    it('carries no field the visitor was not meant to see: no cycle, no per-item currency, no tenant', async () => {
      backendHttpService.get.mockResolvedValueOnce({
        ...BACKEND_OFFERED,
        prices: [{ ...BACKEND_OFFERED.prices[0], tenantId: 't-1', internalNote: 'x' }],
      });

      const res = await request(app.getHttpServer()).get(`${URL}?country=BR`);

      const body = JSON.stringify(res.body);
      for (const forbidden of ['cycle', 'tenantId', 'internalNote', '2026-01-01']) {
        expect(body).not.toContain(forbidden);
      }
      expect(Object.keys(res.body.items[0]).sort()).toEqual(['amountMinor', 'featureKey', 'tier']);
    });

    it('rejects a missing country with 400 before the backend', async () => {
      const res = await request(app.getHttpServer()).get(URL);

      expect(res.status).toBe(400);
      expect(backendHttpService.get).not.toHaveBeenCalled();
    });

    it('passes the backend 400 for a malformed country through, and never marks it cacheable', async () => {
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException(
          { title: 'Bad Request', status: 400, code: 'COUNTRY_CODE_FORMAT_INVALID' },
          400,
        ),
      );

      const res = await request(app.getHttpServer()).get(`${URL}?country=B1`);

      expect(res.status).toBe(400);
      expect(res.headers['cache-control']).toBeUndefined();
    });

    it('passes a backend 503 through, and never marks it cacheable', async () => {
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException({ title: 'Service Unavailable', status: 503 }, 503),
      );

      const res = await request(app.getHttpServer()).get(`${URL}?country=BR`);

      expect(res.status).toBe(503);
      expect(res.headers['cache-control']).toBeUndefined();
    });
  });
});
