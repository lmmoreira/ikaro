import { makeBackendHttp } from '../test/backend-http.mock';
import { LoyaltyController } from './loyalty.controller';
import {
  LoyaltyBalanceResponse,
  LoyaltyEntriesResponse,
  LoyaltyRedemptionsResponse,
  RedeemPointsResponse,
} from './loyalty.types';

const CUSTOMER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

const mockBalance: LoyaltyBalanceResponse = {
  currentPoints: 75,
  nextExpiryDate: '2026-11-15T00:00:00.000Z',
  nextExpiryPoints: 30,
};

const mockEntries: LoyaltyEntriesResponse = {
  entries: [
    {
      entryId: 'e1111111-0000-4000-8000-000000000001',
      serviceId: 'cccccccc-0000-4000-8000-000000000001',
      serviceName: 'Lavagem Completa',
      points: 10,
      earnedAt: '2026-05-28T14:00:00.000Z',
      expiresAt: '2026-11-24T14:00:00.000Z',
      isActive: true,
    },
  ],
  pagination: { page: 1, limit: 20, total: 1 },
};

const mockRedemptions: LoyaltyRedemptionsResponse = {
  redemptions: [
    {
      redemptionId: 'r1111111-0000-4000-8000-000000000001',
      pointsRedeemed: 50,
      redeemedAt: '2026-05-10T10:00:00.000Z',
      notes: 'Free basic wash',
    },
  ],
  pagination: { page: 1, limit: 20, total: 1 },
};

describe('LoyaltyController (BFF)', () => {
  afterEach(() => jest.resetAllMocks());

  describe('getBalance()', () => {
    it('proxies to GET /loyalty/balance', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValue(mockBalance);
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.getBalance();

      expect(backendHttp.get).toHaveBeenCalledWith('/loyalty/balance');
      expect(result.currentPoints).toBe(75);
    });
  });

  describe('getEntries()', () => {
    it('proxies to GET /loyalty/entries with pagination params', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValue(mockEntries);
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.getEntries({ page: 1, limit: 20 });

      expect(backendHttp.get).toHaveBeenCalledWith('/loyalty/entries', { page: 1, limit: 20 });
      expect(result.entries[0].serviceName).toBe('Lavagem Completa');
    });
  });

  describe('getRedemptions()', () => {
    it('proxies to GET /loyalty/redemptions with pagination params', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValue(mockRedemptions);
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.getRedemptions({ page: 1, limit: 20 });

      expect(backendHttp.get).toHaveBeenCalledWith('/loyalty/redemptions', { page: 1, limit: 20 });
      expect(result.redemptions[0].pointsRedeemed).toBe(50);
    });
  });

  describe('getBalanceAdmin()', () => {
    it('proxies to GET /customers/:customerId/loyalty/balance', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValue(mockBalance);
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.getBalanceAdmin(CUSTOMER_ID);

      expect(backendHttp.get).toHaveBeenCalledWith(`/customers/${CUSTOMER_ID}/loyalty/balance`);
      expect(result.currentPoints).toBe(75);
    });
  });

  describe('getEntriesAdmin()', () => {
    it('proxies to GET /customers/:customerId/loyalty/entries', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValue(mockEntries);
      const controller = new LoyaltyController(backendHttp);

      await controller.getEntriesAdmin(CUSTOMER_ID, { page: 2, limit: 10 });

      expect(backendHttp.get).toHaveBeenCalledWith(`/customers/${CUSTOMER_ID}/loyalty/entries`, {
        page: 2,
        limit: 10,
      });
    });
  });

  describe('getRedemptionsAdmin()', () => {
    it('proxies to GET /customers/:customerId/loyalty/redemptions', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValue(mockRedemptions);
      const controller = new LoyaltyController(backendHttp);

      await controller.getRedemptionsAdmin(CUSTOMER_ID, { page: 1, limit: 20 });

      expect(backendHttp.get).toHaveBeenCalledWith(
        `/customers/${CUSTOMER_ID}/loyalty/redemptions`,
        { page: 1, limit: 20 },
      );
    });
  });

  describe('redeemPoints()', () => {
    it('proxies to POST /loyalty/redeem and returns redemption result', async () => {
      const mockResponse: RedeemPointsResponse = {
        redemptionId: 'r2222222-0000-4000-8000-000000000001',
        customerId: CUSTOMER_ID,
        pointsRedeemed: 50,
        newBalance: 25,
        redeemedAt: '2026-05-29T14:00:00.000Z',
      };
      const backendHttp = makeBackendHttp();
      backendHttp.post.mockResolvedValue(mockResponse);
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.redeemPoints({
        customerId: CUSTOMER_ID,
        pointsToRedeem: 50,
        notes: 'Free wash',
        bookingId: null,
      });

      expect(backendHttp.post).toHaveBeenCalledWith('/loyalty/redeem', {
        customerId: CUSTOMER_ID,
        pointsToRedeem: 50,
        notes: 'Free wash',
        bookingId: null,
      });
      expect(result.newBalance).toBe(25);
      expect(result.redemptionId).toBe('r2222222-0000-4000-8000-000000000001');
    });
  });
});
