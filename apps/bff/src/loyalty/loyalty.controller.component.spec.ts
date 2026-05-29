import { INestApplication } from '@nestjs/common';
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
  TENANT_ID,
} from '../test/component-test.helpers';
import {
  LoyaltyBalanceResponse,
  LoyaltyEntriesResponse,
  LoyaltyRedemptionsResponse,
  RedeemPointsResponse,
} from './loyalty.types';

const OTHER_CUSTOMER_ID = 'cccccccc-0000-4000-8000-000000000099';

const mockBalance: LoyaltyBalanceResponse = {
  currentPoints: 75,
  nextExpiryDate: '2026-11-15T00:00:00.000Z',
  nextExpiryPoints: 30,
};

const mockEntries: LoyaltyEntriesResponse = {
  entries: [],
  pagination: { page: 1, limit: 20, total: 0 },
};

const mockRedemptions: LoyaltyRedemptionsResponse = {
  redemptions: [],
  pagination: { page: 1, limit: 20, total: 0 },
};

describe('LoyaltyController (component)', () => {
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

  // ── Customer: GET /v1/loyalty/balance ─────────────────────────────────────

  describe('GET /v1/loyalty/balance', () => {
    it('returns 200 with balance for CUSTOMER JWT', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValue(mockBalance);
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/loyalty/balance')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.currentPoints).toBe(75);
    });

    it('returns 403 for MANAGER JWT', async () => {
      setupActiveGuardMock(httpService);
      const token = makeManagerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/loyalty/balance')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(403);
    });

    it('returns 403 for STAFF JWT', async () => {
      setupActiveGuardMock(httpService);
      const token = makeStaffJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/loyalty/balance')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(403);
    });

    it('returns 401 without JWT', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/loyalty/balance')
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(401);
    });
  });

  // ── Customer: GET /v1/loyalty/entries ─────────────────────────────────────

  describe('GET /v1/loyalty/entries', () => {
    it('returns 200 for CUSTOMER JWT', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValue(mockEntries);
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/loyalty/entries')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.entries).toEqual([]);
    });

    it('returns 403 for MANAGER JWT', async () => {
      setupActiveGuardMock(httpService);
      const token = makeManagerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/loyalty/entries')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(403);
    });
  });

  // ── Customer: GET /v1/loyalty/redemptions ─────────────────────────────────

  describe('GET /v1/loyalty/redemptions', () => {
    it('returns 200 for CUSTOMER JWT', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValue(mockRedemptions);
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/loyalty/redemptions')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.redemptions).toEqual([]);
    });
  });

  // ── Admin: GET /v1/customers/:customerId/loyalty/* ────────────────────────

  describe('GET /v1/customers/:customerId/loyalty/balance', () => {
    it('returns 200 for MANAGER JWT', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValue(mockBalance);
      const token = makeManagerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get(`/v1/customers/${OTHER_CUSTOMER_ID}/loyalty/balance`)
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.currentPoints).toBe(75);
    });

    it('returns 200 for STAFF JWT', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValue(mockBalance);
      const token = makeStaffJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get(`/v1/customers/${OTHER_CUSTOMER_ID}/loyalty/balance`)
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
    });

    it('returns 403 for CUSTOMER JWT', async () => {
      setupActiveGuardMock(httpService);
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get(`/v1/customers/${OTHER_CUSTOMER_ID}/loyalty/balance`)
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(403);
    });

    it('returns 400 for invalid UUID in path', async () => {
      setupActiveGuardMock(httpService);
      const token = makeManagerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/customers/not-a-uuid/loyalty/balance')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /v1/customers/:customerId/loyalty/entries', () => {
    it('returns 200 for MANAGER JWT and proxies pagination', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValue(mockEntries);
      const token = makeManagerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get(`/v1/customers/${OTHER_CUSTOMER_ID}/loyalty/entries?page=2&limit=10`)
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
      expect(backendHttpService.get).toHaveBeenCalledWith(
        `/customers/${OTHER_CUSTOMER_ID}/loyalty/entries`,
        expect.objectContaining({ page: 2, limit: 10 }),
      );
    });
  });

  describe('GET /v1/customers/:customerId/loyalty/redemptions', () => {
    it('returns 200 for STAFF JWT', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValue(mockRedemptions);
      const token = makeStaffJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get(`/v1/customers/${OTHER_CUSTOMER_ID}/loyalty/redemptions`)
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
    });
  });

  // ── Admin: POST /v1/loyalty/redeem ────────────────────────────────────────

  describe('POST /v1/loyalty/redeem', () => {
    const mockRedeemResponse: RedeemPointsResponse = {
      redemptionId: 'r3333333-0000-4000-8000-000000000001',
      customerId: OTHER_CUSTOMER_ID,
      pointsRedeemed: 50,
      newBalance: 25,
      redeemedAt: '2026-05-29T14:00:00.000Z',
    };

    it('returns 201 for MANAGER JWT', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValue(mockRedeemResponse);
      const token = makeManagerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .post('/v1/loyalty/redeem')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID)
        .send({ customerId: OTHER_CUSTOMER_ID, pointsToRedeem: 50 });

      expect(res.status).toBe(201);
      expect(res.body.newBalance).toBe(25);
      expect(backendHttpService.post).toHaveBeenCalledWith(
        '/loyalty/redeem',
        expect.objectContaining({
          customerId: OTHER_CUSTOMER_ID,
          pointsToRedeem: 50,
        }),
      );
    });

    it('returns 201 for STAFF JWT', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValue(mockRedeemResponse);
      const token = makeStaffJwt(jwtService);

      const res = await request(app.getHttpServer())
        .post('/v1/loyalty/redeem')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID)
        .send({ customerId: OTHER_CUSTOMER_ID, pointsToRedeem: 50 });

      expect(res.status).toBe(201);
    });

    it('returns 403 for CUSTOMER JWT', async () => {
      setupActiveGuardMock(httpService);
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .post('/v1/loyalty/redeem')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID)
        .send({ customerId: OTHER_CUSTOMER_ID, pointsToRedeem: 50 });

      expect(res.status).toBe(403);
    });

    it('returns 401 without JWT', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/loyalty/redeem')
        .set('x-tenant-id', TENANT_ID)
        .send({ customerId: OTHER_CUSTOMER_ID, pointsToRedeem: 50 });

      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid body (missing customerId)', async () => {
      setupActiveGuardMock(httpService);
      const token = makeManagerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .post('/v1/loyalty/redeem')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID)
        .send({ pointsToRedeem: 50 });

      expect(res.status).toBe(400);
    });
  });
});
