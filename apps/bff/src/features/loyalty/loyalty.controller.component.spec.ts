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
} from '../../test/component-test.helpers';
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
    it('returns 200 with balance and conversionRate for CUSTOMER JWT', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockImplementation((path: string) => {
        if (path === '/loyalty/balance') return Promise.resolve(mockBalance);
        if (path === '/tenants/settings')
          return Promise.resolve({ settings: { loyalty: { pointsPerCurrencyUnit: 10 } } });
        throw new Error(`Unexpected GET: ${path}`);
      });
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/loyalty/balance')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        currentPoints: 75,
        nextExpiryDate: mockBalance.nextExpiryDate,
        nextExpiryPoints: mockBalance.nextExpiryPoints,
        conversionRate: 10,
      });
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
      expect(res.body.items).toEqual([]);
    });

    it('maps entries to CustomerLoyaltyEntryResponse shape', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValue({
        entries: [
          {
            entryId: 'e1111111-0000-4000-8000-000000000001',
            bookingId: 'bbbbbbbb-0000-4000-8000-000000000001',
            serviceId: 'cccccccc-0000-4000-8000-000000000001',
            serviceName: 'Lavagem Completa',
            points: 10,
            earnedAt: '2026-05-28T14:00:00.000Z',
            expiresAt: '2026-11-24T14:00:00.000Z',
            isActive: true,
          },
        ],
        pagination: { page: 1, limit: 20, total: 1 },
      });
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/loyalty/entries')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.items[0]).toEqual({
        entryId: 'e1111111-0000-4000-8000-000000000001',
        serviceName: 'Lavagem Completa',
        pointsEarned: 10,
        earnedAt: '2026-05-28T14:00:00.000Z',
        expiresAt: '2026-11-24T14:00:00.000Z',
        expired: false,
      });
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
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
      expect(res.body.items).toEqual([]);
    });

    it('maps redemptions to CustomerLoyaltyRedemptionResponse shape', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValue({
        redemptions: [
          {
            redemptionId: 'r1111111-0000-4000-8000-000000000001',
            pointsRedeemed: 50,
            pointsPerCurrencyUnit: 0,
            redeemedAt: '2026-05-10T10:00:00.000Z',
            notes: 'Free basic wash',
            bookingServices: [
              {
                serviceId: 'cccccccc-0000-4000-8000-000000000001',
                serviceName: 'Lavagem Completa',
              },
            ],
          },
        ],
        pagination: { page: 1, limit: 20, total: 1 },
      });
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get('/v1/loyalty/redemptions')
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.items[0]).toEqual({
        redemptionId: 'r1111111-0000-4000-8000-000000000001',
        pointsUsed: 50,
        amountSaved: 'R$ 0,00',
        redeemedAt: '2026-05-10T10:00:00.000Z',
        bookingReference: 'Lavagem Completa',
      });
    });
  });

  // ── Admin: GET /v1/customers/:customerId/loyalty/* ────────────────────────

  describe('GET /v1/customers/:customerId/loyalty', () => {
    it('returns the customer loyalty detail payload for MANAGER JWT', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockImplementation((path: string) => {
        if (path === `/customers/${OTHER_CUSTOMER_ID}`)
          return Promise.resolve({
            customerId: OTHER_CUSTOMER_ID,
            email: 'customer@example.com',
            name: 'Customer One',
            phone: '+5531999999999',
            defaultAddress: null,
          });
        if (path === `/customers/${OTHER_CUSTOMER_ID}/loyalty/balance`)
          return Promise.resolve(mockBalance);
        if (path === '/tenants/settings')
          return Promise.resolve({ settings: { loyalty: { pointsPerCurrencyUnit: 10 } } });
        if (path === `/customers/${OTHER_CUSTOMER_ID}/loyalty/entries`)
          return Promise.resolve(mockEntries);
        if (path === `/customers/${OTHER_CUSTOMER_ID}/loyalty/redemptions`)
          return Promise.resolve(mockRedemptions);
        throw new Error(`Unexpected GET: ${path}`);
      });
      const token = makeManagerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get(`/v1/customers/${OTHER_CUSTOMER_ID}/loyalty`)
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.customer.customerId).toBe(OTHER_CUSTOMER_ID);
      expect(res.body.balance.currentPoints).toBe(75);
      expect(res.body.entries.items).toHaveLength(0);
      expect(res.body.redemptions.items).toHaveLength(0);
    });
  });

  describe('GET /v1/customers/:customerId/loyalty/balance', () => {
    it('returns 200 with enriched balance for MANAGER JWT', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockImplementation((path: string) => {
        if (path === `/customers/${OTHER_CUSTOMER_ID}/loyalty/balance`)
          return Promise.resolve(mockBalance);
        if (path === '/tenants/settings')
          return Promise.resolve({ settings: { loyalty: { pointsPerCurrencyUnit: 10 } } });
        throw new Error(`Unexpected GET: ${path}`);
      });
      const token = makeManagerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .get(`/v1/customers/${OTHER_CUSTOMER_ID}/loyalty/balance`)
        .set('Cookie', `access_token=${token}`)
        .set('x-tenant-id', TENANT_ID);

      expect(res.status).toBe(200);
      expect(res.body.currentPoints).toBe(75);
      expect(res.body.conversionRate).toBe(10);
    });

    it('returns 200 for STAFF JWT', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockImplementation((path: string) => {
        if (path === `/customers/${OTHER_CUSTOMER_ID}/loyalty/balance`)
          return Promise.resolve(mockBalance);
        if (path === '/tenants/settings')
          return Promise.resolve({ settings: { loyalty: { pointsPerCurrencyUnit: 0 } } });
        throw new Error(`Unexpected GET: ${path}`);
      });
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
