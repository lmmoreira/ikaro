import { HotsiteServiceListResponse, HotsiteServiceResponse, TenantSettings } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { getBusinessContext, getServicesContext } from './chatbot-context';
import { BackendTenantByIdResponse } from './platform.types';

const mockService: HotsiteServiceResponse = {
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

const mockSettings: TenantSettings = {
  loyalty: {
    expiryDays: 365,
    enableNotifications: true,
    expiryWarningDays: 7,
    notificationMinPoints: 0,
    pointsPerCurrencyUnit: 1,
  },
  booking: {
    cancellationWindowHours: 24,
    autoApproveEnabled: false,
    minBookingAdvanceHours: 1,
    maxBookingAdvanceDays: 60,
    serviceBufferMinutes: 0,
    slotGranularityMinutes: 30,
  },
  businessHours: {
    timezone: 'America/Sao_Paulo',
    monday: { open: '08:00', close: '18:00' },
    tuesday: { open: '08:00', close: '18:00' },
    wednesday: { open: '08:00', close: '18:00' },
    thursday: { open: '08:00', close: '18:00' },
    friday: { open: '08:00', close: '18:00' },
    saturday: null,
    sunday: null,
  },
  localization: {
    countryCode: 'BR',
    currency: 'BRL',
    language: 'pt-BR',
    decimalPlaces: 2,
  },
  businessInfo: {
    phone: '+5511987654321',
    email: 'contato@beloauto.com.br',
    address: null,
    socialLinks: null,
  },
  chatbot: { knowledgeText: 'Aceitamos cartão e Pix.' },
  leadForm: { retentionMonths: 6, maxSubmissionsPerDay: 100, maxSubmissionsPerIpPerDay: 3 },
};

const mockTenantById: BackendTenantByIdResponse = {
  id: 'tenant-uuid',
  slug: 'lavacar-bh',
  name: 'Lavacar BH',
  locale: 'pt-BR',
  settings: mockSettings,
};

describe('getServicesContext', () => {
  afterEach(() => jest.resetAllMocks());

  it('calls the same GET /services BackendHttpService.getForPublic call SERVICE_LIST already makes', async () => {
    const mockList: HotsiteServiceListResponse = { items: [mockService] };
    const backendHttp = makeBackendHttp({ getForPublic: jest.fn().mockResolvedValue(mockList) });

    const result = await getServicesContext(backendHttp, 'tenant-uuid');

    expect(backendHttp.getForPublic).toHaveBeenCalledWith('/services', 'tenant-uuid');
    expect(result).toEqual([mockService]);
  });
});

describe('getBusinessContext', () => {
  afterEach(() => jest.resetAllMocks());

  it('reads businessInfo, businessHours, locale, and knowledgeText via a single call to the unguarded internal tenant-by-id route', async () => {
    const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(mockTenantById) });

    const result = await getBusinessContext(backendHttp, 'tenant-uuid');

    expect(backendHttp.get).toHaveBeenCalledWith('/internal/tenants/tenant-uuid');
    expect(backendHttp.get).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      businessInfo: mockSettings.businessInfo,
      businessHours: mockSettings.businessHours,
      locale: 'pt-BR',
      knowledgeText: 'Aceitamos cartão e Pix.',
    });
  });

  it('never calls the role-gated GET /tenants/settings route', async () => {
    const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(mockTenantById) });

    await getBusinessContext(backendHttp, 'tenant-uuid');

    const calledPaths = (backendHttp.get as jest.Mock).mock.calls.map((call) => call[0]);
    expect(calledPaths).not.toContain('/tenants/settings');
  });

  it('returns an empty knowledgeText string as-is when the tenant has none configured', async () => {
    const backendHttp = makeBackendHttp({
      get: jest.fn().mockResolvedValue({
        ...mockTenantById,
        settings: { ...mockSettings, chatbot: { knowledgeText: '' } },
      }),
    });

    const result = await getBusinessContext(backendHttp, 'tenant-uuid');

    expect(result.knowledgeText).toBe('');
  });
});
