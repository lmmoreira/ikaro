import { HttpException, INestApplication } from '@nestjs/common';
import { MockBackendHttpService, createTestApp, request } from '../../test/component-test.helpers';
import {
  HotsiteBookingSettingsResponse,
  HotsiteBusinessInfoResponse,
  HotsiteChatbotMessageResponse,
  HotsiteChatbotStatusResponse,
  HotsiteLocalizationResponse,
  HotsiteResponse,
  HotsiteServiceListResponse,
  HotsiteServiceResponse,
  TenantSettings,
} from '@ikaro/types';
import { BackendTenantByIdResponse } from './platform.types';

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

describe('PlatformPublicController (component)', () => {
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

  describe('GET /v1/public/platform/manifest/:slug (public)', () => {
    it('returns the composed manifest without a JWT', async () => {
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.getForPublic = jest.fn().mockResolvedValueOnce(hotsiteResponse);

      const res = await request(app.getHttpServer()).get('/v1/public/platform/manifest/lavacar-bh');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tenant: tenantInfo, ...hotsiteResponse });
      expect(res.headers['cache-control']).toBe('public, max-age=300');
      expect(backendHttpService.get).toHaveBeenCalledWith('/internal/tenants/by-slug/lavacar-bh');
      expect(backendHttpService.getForPublic).toHaveBeenCalledWith('/hotsite', tenantInfo.id);
    });

    it('returns 404 when the slug does not resolve to a tenant', async () => {
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException({ title: 'Not Found', status: 404 }, 404),
      );

      const res = await request(app.getHttpServer()).get(
        '/v1/public/platform/manifest/unknown-slug',
      );

      expect(res.status).toBe(404);
    });

    it('returns 200 with isPublished: false and an empty layout when the hotsite is not published', async () => {
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.getForPublic = jest.fn().mockResolvedValueOnce(unpublishedHotsiteResponse);

      const res = await request(app.getHttpServer()).get('/v1/public/platform/manifest/lavacar-bh');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tenant: tenantInfo, ...unpublishedHotsiteResponse });
    });
  });

  describe('GET /v1/public/platform/chatbot/status (public)', () => {
    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const res = await request(app.getHttpServer()).get('/v1/public/platform/chatbot/status');
      expect(res.status).toBe(400);
    });

    it('returns availability without a JWT', async () => {
      const response: HotsiteChatbotStatusResponse = { available: true };
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.getForPublic = jest.fn().mockResolvedValueOnce(response);

      const res = await request(app.getHttpServer())
        .get('/v1/public/platform/chatbot/status')
        .set('X-Tenant-Slug', 'lavacar-bh');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(response);
      expect(backendHttpService.getForPublic).toHaveBeenCalledWith(
        '/platform/chatbot/status',
        tenantInfo.id,
      );
    });

    it('returns 404 when the slug does not resolve to a tenant', async () => {
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException({ title: 'Not Found', status: 404 }, 404),
      );

      const res = await request(app.getHttpServer())
        .get('/v1/public/platform/chatbot/status')
        .set('X-Tenant-Slug', 'unknown-slug');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/public/platform/chatbot/messages (public)', () => {
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
      id: tenantInfo.id,
      slug: tenantInfo.slug,
      name: tenantInfo.name,
      locale: 'pt-BR',
      settings: mockSettings,
    };

    function mockHappyPathBackend(): void {
      backendHttpService.get.mockImplementation((path: string) => {
        if (path === '/internal/tenants/by-slug/lavacar-bh') return Promise.resolve(tenantInfo);
        return Promise.resolve(mockTenantById);
      });
      backendHttpService.getForPublic = jest
        .fn()
        .mockResolvedValue({ items: [mockService] } satisfies HotsiteServiceListResponse);
      backendHttpService.postForPublic = jest.fn().mockResolvedValue({
        sessionId: 'session-uuid',
        reply: 'Olá! Como posso ajudar?',
      } satisfies HotsiteChatbotMessageResponse);
    }

    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/chatbot/messages')
        .send({ message: 'Oi' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when message is empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/chatbot/messages')
        .set('X-Tenant-Slug', 'lavacar-bh')
        .send({ message: '' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when message exceeds the 1000-char defense-in-depth default', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/chatbot/messages')
        .set('X-Tenant-Slug', 'lavacar-bh')
        .send({ message: 'a'.repeat(1001) });
      expect(res.status).toBe(400);
    });

    it('sends a reply on the happy path, without a JWT', async () => {
      mockHappyPathBackend();

      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/chatbot/messages')
        .set('X-Tenant-Slug', 'lavacar-bh')
        .send({ message: 'Vocês abrem aos sábados?' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sessionId: 'session-uuid', reply: 'Olá! Como posso ajudar?' });
      expect(backendHttpService.postForPublic).toHaveBeenCalledWith(
        '/platform/chatbot/messages',
        expect.objectContaining({ message: 'Vocês abrem aos sábados?' }),
        tenantInfo.id,
      );
    });

    it('returns 404 when the slug does not resolve to a tenant', async () => {
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException({ title: 'Not Found', status: 404 }, 404),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/chatbot/messages')
        .set('X-Tenant-Slug', 'unknown-slug')
        .send({ message: 'Oi' });

      expect(res.status).toBe(404);
    });

    it('propagates 429 when the backend rejects on a volume cap', async () => {
      mockHappyPathBackend();
      backendHttpService.postForPublic = jest
        .fn()
        .mockRejectedValue(
          new HttpException(
            { title: 'Too Many Requests', status: 429, code: 'PLATFORM_CHATBOT_DAILY_CAP_REACHED' },
            429,
          ),
        );

      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/chatbot/messages')
        .set('X-Tenant-Slug', 'lavacar-bh')
        .send({ message: 'Oi' });

      expect(res.status).toBe(429);
    });

    it('propagates 503 when the LLM provider call fails', async () => {
      mockHappyPathBackend();
      backendHttpService.postForPublic = jest.fn().mockRejectedValue(
        new HttpException(
          {
            title: 'Service Unavailable',
            status: 503,
            code: 'PLATFORM_CHATBOT_PROVIDER_UNAVAILABLE',
          },
          503,
        ),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/chatbot/messages')
        .set('X-Tenant-Slug', 'lavacar-bh')
        .send({ message: 'Oi' });

      expect(res.status).toBe(503);
    });
  });
});
