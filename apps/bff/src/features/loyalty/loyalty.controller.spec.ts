import { TenantSettingsResponse } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
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

const mockSettings: TenantSettingsResponse = {
  tenantId: 'test-tenant',
  name: 'Test',
  slug: 'test',
  settings: {
    loyalty: {
      pointsPerCurrencyUnit: 10,
      expiryDays: 180,
      enableNotifications: true,
      expiryWarningDays: 7,
      notificationMinPoints: 50,
    },
    booking: {
      cancellationWindowHours: 48,
      autoApproveEnabled: false,
      minBookingAdvanceHours: 0,
      maxBookingAdvanceDays: 90,
      serviceBufferMinutes: 60,
      slotGranularityMinutes: 30,
    },
    businessHours: {
      timezone: 'America/Sao_Paulo',
      monday: null,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    },
    localization: { countryCode: 'BR', currency: 'BRL', language: 'pt-BR', decimalPlaces: 2 },
  },
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
      pointsPerCurrencyUnit: 0,
      redeemedAt: '2026-05-10T10:00:00.000Z',
      notes: 'Free basic wash',
      bookingId: 'bbbbbbbb-0000-4000-8000-000000000001',
      bookingServices: [
        { serviceId: 'cccccccc-0000-4000-8000-000000000001', serviceName: 'Lavagem Completa' },
      ],
    },
  ],
  pagination: { page: 1, limit: 20, total: 1 },
};

describe('LoyaltyController (BFF)', () => {
  afterEach(() => jest.resetAllMocks());

  describe('getBalance()', () => {
    it('enriches balance with conversionRate from tenant settings', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockImplementation((path: string) => {
        if (path === '/loyalty/balance') return Promise.resolve(mockBalance);
        if (path === '/tenants/settings') return Promise.resolve(mockSettings);
        throw new Error(`Unexpected GET path: ${path}`);
      });
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.getBalance();

      expect(backendHttp.get).toHaveBeenCalledWith('/loyalty/balance');
      expect(backendHttp.get).toHaveBeenCalledWith('/tenants/settings');
      expect(result).toEqual({
        currentPoints: 75,
        nextExpiryDate: '2026-11-15T00:00:00.000Z',
        nextExpiryPoints: 30,
        conversionRate: 10,
      });
    });

    it('returns conversionRate 0 when pointsPerCurrencyUnit is 0', async () => {
      const backendHttp = makeBackendHttp();
      const settingsDisabled: TenantSettingsResponse = {
        ...mockSettings,
        settings: {
          ...mockSettings.settings,
          loyalty: { ...mockSettings.settings.loyalty, pointsPerCurrencyUnit: 0 },
        },
      };
      backendHttp.get.mockImplementation((path: string) => {
        if (path === '/loyalty/balance') return Promise.resolve(mockBalance);
        if (path === '/tenants/settings') return Promise.resolve(settingsDisabled);
        throw new Error(`Unexpected GET path: ${path}`);
      });
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.getBalance();

      expect(result.conversionRate).toBe(0);
    });
  });

  describe('getEntries()', () => {
    it('proxies to GET /loyalty/entries and maps to CustomerLoyaltyEntryResponse', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValue(mockEntries);
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.getEntries({ page: 1, limit: 20 });

      expect(backendHttp.get).toHaveBeenCalledWith('/loyalty/entries', { page: 1, limit: 20 });
      expect(result).toEqual({
        items: [
          {
            entryId: 'e1111111-0000-4000-8000-000000000001',
            serviceName: 'Lavagem Completa',
            pointsEarned: 10,
            earnedAt: '2026-05-28T14:00:00.000Z',
            expiresAt: '2026-11-24T14:00:00.000Z',
            expired: false,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('marks an entry as expired when isActive is false', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValue({
        ...mockEntries,
        entries: [{ ...mockEntries.entries[0], isActive: false }],
      });
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.getEntries({ page: 1, limit: 20 });

      expect(result.items[0].expired).toBe(true);
    });
  });

  describe('getRedemptions()', () => {
    it('proxies to GET /loyalty/redemptions and maps to CustomerLoyaltyRedemptionResponse', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValue(mockRedemptions);
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.getRedemptions({ page: 1, limit: 20 });

      expect(backendHttp.get).toHaveBeenCalledWith('/loyalty/redemptions', { page: 1, limit: 20 });
      expect(result).toEqual({
        items: [
          {
            redemptionId: 'r1111111-0000-4000-8000-000000000001',
            pointsUsed: 50,
            amountSaved: 'R$ 0,00',
            redeemedAt: '2026-05-10T10:00:00.000Z',
            bookingReference: 'Lavagem Completa',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('returns a null bookingReference when the redemption has no booking', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValue({
        ...mockRedemptions,
        redemptions: [{ ...mockRedemptions.redemptions[0], bookingServices: [] }],
      });
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.getRedemptions({ page: 1, limit: 20 });

      expect(result.items[0].bookingReference).toBeNull();
    });
  });

  describe('getBalanceAdmin()', () => {
    it('enriches admin balance with conversionRate from tenant settings', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockImplementation((path: string) => {
        if (path === `/customers/${CUSTOMER_ID}/loyalty/balance`)
          return Promise.resolve(mockBalance);
        if (path === '/tenants/settings') return Promise.resolve(mockSettings);
        throw new Error(`Unexpected GET path: ${path}`);
      });
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.getBalanceAdmin(CUSTOMER_ID);

      expect(backendHttp.get).toHaveBeenCalledWith(`/customers/${CUSTOMER_ID}/loyalty/balance`);
      expect(backendHttp.get).toHaveBeenCalledWith('/tenants/settings');
      expect(result.currentPoints).toBe(75);
      expect(result.conversionRate).toBe(10);
    });
  });

  describe('getEntriesAdmin()', () => {
    it('maps backend entries to staff LoyaltyEntryItem shape', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValue(mockEntries);
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.getEntriesAdmin(CUSTOMER_ID, { page: 2, limit: 10 });

      expect(backendHttp.get).toHaveBeenCalledWith(`/customers/${CUSTOMER_ID}/loyalty/entries`, {
        page: 2,
        limit: 10,
      });
      expect(result.items[0]).toEqual({
        id: 'e1111111-0000-4000-8000-000000000001',
        serviceName: 'Lavagem Completa',
        points: 10,
        earnedAt: '2026-05-28T14:00:00.000Z',
        expiresAt: '2026-11-24T14:00:00.000Z',
        isActive: true,
      });
    });
  });

  describe('getRedemptionsAdmin()', () => {
    it('maps backend redemptions to staff LoyaltyRedemptionItem shape with amountDeducted', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValue(mockRedemptions);
      const controller = new LoyaltyController(backendHttp);

      const result = await controller.getRedemptionsAdmin(CUSTOMER_ID, { page: 1, limit: 20 });

      expect(backendHttp.get).toHaveBeenCalledWith(
        `/customers/${CUSTOMER_ID}/loyalty/redemptions`,
        { page: 1, limit: 20 },
      );
      expect(result.items[0]).toMatchObject({
        id: 'r1111111-0000-4000-8000-000000000001',
        pointsRedeemed: 50,
        amountDeducted: 0,
        bookingId: 'bbbbbbbb-0000-4000-8000-000000000001',
      });
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
