import { makeBackendHttp } from '../../test/backend-http.mock';
import { ClientIpRequest } from '../../shared/http/client-ip';
import { PlatformPublicController } from './platform.public.controller';
import { BackendTenantByIdResponse } from './platform.types';
import {
  HotsiteBookingSettingsResponse,
  HotsiteBusinessInfoResponse,
  HotsiteChatbotMessageResponse,
  HotsiteChatbotStatusResponse,
  HotsiteLocalizationResponse,
  HotsiteResponse,
  HotsiteServiceListResponse,
  HotsiteServiceResponse,
  HotsiteSitemapEntryListResponse,
  TenantSettings,
} from '@ikaro/types';

const tenantInfo = { id: 'tenant-uuid', slug: 'lavacar-bh', name: 'Lavacar BH' };

const businessInfo: HotsiteBusinessInfoResponse = {
  phone: '+5511987654321',
  email: 'contato@beloauto.com.br',
  address: {
    street: 'Av. Paulista',
    number: '1000',
    neighborhood: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    zipCode: '01310100',
  },
  socialLinks: null,
};

const localization: HotsiteLocalizationResponse = {
  language: 'pt-BR',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  phonePrefix: '+55',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  numberFormat: '1.234,56',
  firstDayOfWeek: 0,
  address: {
    postalLabel: 'CEP',
    postalPlaceholder: '00000-000',
    stateLabel: 'UF',
    requireNeighborhood: true,
    neighborhoodLabel: 'Bairro',
    streetLabel: 'Rua',
    numberLabel: 'Número',
    complementLabel: 'Complemento',
    cityLabel: 'Cidade',
    lookupService: 'viacep',
  },
};

const booking: HotsiteBookingSettingsResponse = {
  maxBookingAdvanceDays: 90,
};

const hotsiteResponse: HotsiteResponse & {
  business: HotsiteBusinessInfoResponse;
  localization: HotsiteLocalizationResponse;
  booking: HotsiteBookingSettingsResponse;
} = {
  branding: {
    primaryColor: '#2563eb',
    secondaryColor: '#eff6ff',
    backgroundColor: '#ffffff',
    textColor: '#111827',
    headingFontFamily: 'Inter, sans-serif',
    bodyFontFamily: 'Inter, sans-serif',
    logoUrl: '',
    borderRadius: 'rounded',
    buttonStyle: 'filled',
    spacing: 'comfortable',
    shadowStyle: 'subtle',
  },
  layout: [
    {
      type: 'HERO',
      enabled: true,
      data: {
        variant: 'centered',
        title: 'Bem-vindo',
        ctaLabel: 'Agendar agora',
        ctaTarget: 'booking-form',
      },
    },
  ],
  seo: { title: 'Lavacar BH — Agendamento Online', description: 'Agende já.', ogImageUrl: '' },
  isPublished: true,
  business: businessInfo,
  localization,
  booking,
};

const unpublishedHotsiteResponse: HotsiteResponse & {
  business: HotsiteBusinessInfoResponse;
  localization: HotsiteLocalizationResponse;
  booking: HotsiteBookingSettingsResponse;
} = {
  branding: hotsiteResponse.branding,
  layout: [],
  seo: { title: null, description: null, ogImageUrl: '' },
  isPublished: false,
  business: { phone: null, email: null, address: null, socialLinks: null },
  localization,
  booking,
};

describe('PlatformPublicController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('getManifest()', () => {
    it('resolves slug to tenant then composes the hotsite manifest', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        getForPublic: jest.fn().mockResolvedValue(hotsiteResponse),
      });
      const controller = new PlatformPublicController(backendHttp);

      const result = await controller.getManifest('lavacar-bh');

      expect(backendHttp.get).toHaveBeenCalledWith('/internal/tenants/by-slug/lavacar-bh');
      expect(backendHttp.getForPublic).toHaveBeenCalledWith('/hotsite', 'tenant-uuid');
      expect(result).toEqual({ tenant: tenantInfo, ...hotsiteResponse });
    });

    it('propagates 404 when the slug does not resolve to a tenant', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockRejectedValue(new Error('404')) });
      const controller = new PlatformPublicController(backendHttp);

      await expect(controller.getManifest('unknown-slug')).rejects.toThrow('404');
    });

    it('returns the minimal payload (isPublished: false, empty layout) when the hotsite is not published', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        getForPublic: jest.fn().mockResolvedValue(unpublishedHotsiteResponse),
      });
      const controller = new PlatformPublicController(backendHttp);

      const result = await controller.getManifest('lavacar-bh');

      expect(result).toEqual({ tenant: tenantInfo, ...unpublishedHotsiteResponse });
    });
  });

  describe('getPublishedHotsites()', () => {
    it('returns the list of published hotsites from the backend', async () => {
      const response: HotsiteSitemapEntryListResponse = {
        items: [{ slug: 'lavacar-bh', updatedAt: '2026-06-10T12:00:00.000Z' }],
      };
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(response) });
      const controller = new PlatformPublicController(backendHttp);

      const result = await controller.getPublishedHotsites();

      expect(backendHttp.get).toHaveBeenCalledWith('/internal/tenants/published-hotsites');
      expect(result).toEqual(response);
    });
  });

  describe('getChatbotStatus()', () => {
    it('resolves slug to tenantId then calls GET /platform/chatbot/status', async () => {
      const response: HotsiteChatbotStatusResponse = { available: true };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        getForPublic: jest.fn().mockResolvedValue(response),
      });
      const controller = new PlatformPublicController(backendHttp);

      const result = await controller.getChatbotStatus('lavacar-bh');

      expect(backendHttp.get).toHaveBeenCalledWith('/internal/tenants/by-slug/lavacar-bh');
      expect(backendHttp.getForPublic).toHaveBeenCalledWith(
        '/platform/chatbot/status',
        'tenant-uuid',
      );
      expect(result).toEqual(response);
    });

    it('propagates the 400 X-Tenant-Slug-required error when the header is missing', async () => {
      const backendHttp = makeBackendHttp();
      const controller = new PlatformPublicController(backendHttp);

      await expect(controller.getChatbotStatus(undefined)).rejects.toThrow();
      expect(backendHttp.getForPublic).not.toHaveBeenCalled();
    });

    it('never calls an actor-header-forwarding method (post/patch/delete)', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        getForPublic: jest.fn().mockResolvedValue({ available: true }),
      });
      const controller = new PlatformPublicController(backendHttp);

      await controller.getChatbotStatus('lavacar-bh');

      expect(backendHttp.post).not.toHaveBeenCalled();
      expect(backendHttp.patch).not.toHaveBeenCalled();
      expect(backendHttp.delete).not.toHaveBeenCalled();
    });
  });

  describe('sendChatbotMessage()', () => {
    const mockReq: ClientIpRequest = { headers: { 'x-real-client-ip': '203.0.113.10' } };

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
      localization: { countryCode: 'BR', currency: 'BRL', language: 'pt-BR', decimalPlaces: 2 },
      businessInfo: {
        phone: '+5511987654321',
        email: 'contato@beloauto.com.br',
        address: null,
        socialLinks: null,
      },
      chatbot: { knowledgeText: 'Aceitamos cartão e Pix.' },
    };

    const mockTenantById: BackendTenantByIdResponse = {
      id: 'tenant-uuid',
      slug: 'lavacar-bh',
      name: 'Lavacar BH',
      locale: 'pt-BR',
      settings: mockSettings,
    };

    function makeSendMessageBackendHttp() {
      return makeBackendHttp({
        get: jest.fn().mockImplementation((path: string) => {
          if (path === '/internal/tenants/by-slug/lavacar-bh') return Promise.resolve(tenantInfo);
          return Promise.resolve(mockTenantById);
        }),
        getForPublic: jest
          .fn()
          .mockResolvedValue({ items: [mockService] } satisfies HotsiteServiceListResponse),
        postForPublic: jest.fn().mockResolvedValue({
          sessionId: 'session-uuid',
          reply: 'Olá!',
        } satisfies HotsiteChatbotMessageResponse),
      });
    }

    it('resolves tenant, assembles the system prompt, and forwards it with clientIp to the backend', async () => {
      const backendHttp = makeSendMessageBackendHttp();
      const controller = new PlatformPublicController(backendHttp);

      const result = await controller.sendChatbotMessage(
        'lavacar-bh',
        { message: 'Qual o horário de funcionamento?' },
        mockReq,
      );

      expect(backendHttp.getForPublic).toHaveBeenCalledWith('/services', 'tenant-uuid');
      expect(backendHttp.get).toHaveBeenCalledWith('/internal/tenants/tenant-uuid');
      // Exactly twice total: once for by-slug tenant resolution, once for the merged business
      // context fetch — never twice for business info + knowledge text separately (PR #373 review).
      expect(backendHttp.get).toHaveBeenCalledTimes(2);
      expect(backendHttp.postForPublic).toHaveBeenCalledWith(
        '/platform/chatbot/messages',
        expect.objectContaining({
          message: 'Qual o horário de funcionamento?',
          clientIp: '203.0.113.10',
          systemPrompt: expect.stringContaining('## Informações do negócio'),
        }),
        'tenant-uuid',
      );
      expect(result).toEqual({ sessionId: 'session-uuid', reply: 'Olá!' });
    });

    it('forwards an existing sessionId when provided', async () => {
      const backendHttp = makeSendMessageBackendHttp();
      const controller = new PlatformPublicController(backendHttp);

      await controller.sendChatbotMessage(
        'lavacar-bh',
        { sessionId: 'existing-session-uuid', message: 'E aí, tudo aberto hoje?' },
        mockReq,
      );

      expect(backendHttp.postForPublic).toHaveBeenCalledWith(
        '/platform/chatbot/messages',
        expect.objectContaining({ sessionId: 'existing-session-uuid' }),
        'tenant-uuid',
      );
    });

    it('propagates the 400 X-Tenant-Slug-required error when the header is missing', async () => {
      const backendHttp = makeBackendHttp();
      const controller = new PlatformPublicController(backendHttp);

      await expect(
        controller.sendChatbotMessage(undefined, { message: 'Oi' }, mockReq),
      ).rejects.toThrow();
      expect(backendHttp.postForPublic).not.toHaveBeenCalled();
    });

    it('never calls an actor-header-forwarding method (post/patch/delete)', async () => {
      const backendHttp = makeSendMessageBackendHttp();
      const controller = new PlatformPublicController(backendHttp);

      await controller.sendChatbotMessage('lavacar-bh', { message: 'Oi' }, mockReq);

      expect(backendHttp.post).not.toHaveBeenCalled();
      expect(backendHttp.patch).not.toHaveBeenCalled();
      expect(backendHttp.delete).not.toHaveBeenCalled();
    });

    it('propagates a 429/503 error thrown by the backend send-message call unchanged', async () => {
      const backendHttp = makeSendMessageBackendHttp();
      (backendHttp.postForPublic as jest.Mock).mockRejectedValue(new Error('429'));
      const controller = new PlatformPublicController(backendHttp);

      await expect(
        controller.sendChatbotMessage('lavacar-bh', { message: 'Oi' }, mockReq),
      ).rejects.toThrow('429');
    });
  });
});
