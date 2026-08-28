import { HttpException, INestApplication } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import {
  CUSTOMER_ID,
  MockBackendHttpService,
  MockHttpService,
  createTestApp,
  request,
} from '../../test/component-test.helpers';
import {
  HotsiteBookingSettingsResponse,
  HotsiteBusinessInfoResponse,
  HotsiteChatbotMessageResponse,
  HotsiteChatbotStatusResponse,
  HotsiteLeadFormConfigResponse,
  HotsiteLeadFormSubmissionResponse,
  HotsiteLocalizationResponse,
  HotsiteResponse,
  HotsiteServiceListResponse,
  HotsiteServiceResponse,
  TenantSettings,
} from '@ikaro/types';
import { CHATBOT_MESSAGE_TIMEOUT_MS } from './platform.public.controller';
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
  let httpService: MockHttpService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, backendHttpService, httpService, restoreEnv } = await createTestApp());
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
      expect(res.headers['cache-control']).toBe('no-store');
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
      leadForm: { retentionMonths: 6, maxSubmissionsPerDay: 100, maxSubmissionsPerIpPerDay: 3 },
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

    it('returns 400 when message exceeds the 5000-char BFF outer bound', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/chatbot/messages')
        .set('X-Tenant-Slug', 'lavacar-bh')
        .send({ message: 'a'.repeat(5001) });
      expect(res.status).toBe(400);
    });

    it('does not reject a message above the tenant default (1000) but under the BFF outer bound (5000) — the real tenant cap is backend-only', async () => {
      mockHappyPathBackend();

      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/chatbot/messages')
        .set('X-Tenant-Slug', 'lavacar-bh')
        .send({ message: 'a'.repeat(2000) });

      expect(res.status).toBe(200);
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
        CHATBOT_MESSAGE_TIMEOUT_MS,
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

  describe('GET /v1/public/platform/lead-form/:slug (public, M20-S05)', () => {
    it('returns the question catalog without a JWT', async () => {
      const response: HotsiteLeadFormConfigResponse = {
        audienceMode: 'GUEST_AND_CUSTOMER',
        questions: [
          {
            id: '01234567-0000-7000-8000-000000000101',
            label: 'Qual serviço te interessa?',
            type: 'TEXT',
            required: false,
            order: 0,
          },
        ],
      };
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.getForPublic = jest.fn().mockResolvedValueOnce(response);

      const res = await request(app.getHttpServer())
        .get('/v1/public/platform/lead-form/lavacar-bh')
        .set('X-Tenant-Slug', 'lavacar-bh');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(response);
      expect(backendHttpService.getForPublic).toHaveBeenCalledWith(
        '/platform/lead-form/config',
        tenantInfo.id,
      );
    });

    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const res = await request(app.getHttpServer()).get(
        '/v1/public/platform/lead-form/lavacar-bh',
      );
      expect(res.status).toBe(400);
    });

    it('returns 404 when the module is not enabled', async () => {
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.getForPublic = jest
        .fn()
        .mockRejectedValueOnce(
          new HttpException(
            { title: 'Not Found', status: 404, code: 'PLATFORM_LEAD_FORM_NOT_ENABLED' },
            404,
          ),
        );

      const res = await request(app.getHttpServer())
        .get('/v1/public/platform/lead-form/lavacar-bh')
        .set('X-Tenant-Slug', 'lavacar-bh');

      expect(res.status).toBe(404);
    });

    it('returns 404 when the slug does not resolve to a tenant', async () => {
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException({ title: 'Not Found', status: 404 }, 404),
      );

      const res = await request(app.getHttpServer())
        .get('/v1/public/platform/lead-form/unknown-slug')
        .set('X-Tenant-Slug', 'unknown-slug');

      expect(res.status).toBe(404);
      expect(backendHttpService.getForPublic).not.toHaveBeenCalled();
    });
  });

  describe('POST /v1/public/platform/lead-form/:slug/submissions (public, M20-S05)', () => {
    const submitBody = {
      name: 'Maria Silva',
      email: 'maria.silva@example.com',
      phone: '+5511987654321',
      answers: [{ questionId: '01234567-0000-7000-8000-000000000101', value: 'Lavagem completa' }],
      turnstileToken: 'valid-token',
    };

    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/lead-form/lavacar-bh/submissions')
        .send(submitBody);
      expect(res.status).toBe(400);
    });

    it('submits as a guest (no Authorization header) — customerId: null and turnstileToken forwarded unverified (M20-S14: verification moved to the backend)', async () => {
      const response: HotsiteLeadFormSubmissionResponse = { submissionId: 'submission-uuid' };
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.postForPublic = jest.fn().mockResolvedValueOnce(response);

      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/lead-form/lavacar-bh/submissions')
        .set('X-Tenant-Slug', 'lavacar-bh')
        .send(submitBody);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(response);
      expect(backendHttpService.postForPublic).toHaveBeenCalledWith(
        '/platform/lead-form/submissions',
        expect.objectContaining({ customerId: null, turnstileToken: submitBody.turnstileToken }),
        tenantInfo.id,
        expect.any(Number),
      );
      // The BFF never calls Cloudflare's siteverify itself anymore (M20-S14).
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('propagates 400 when the backend rejects Turnstile verification (M20-S14: enforced backend-side)', async () => {
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.postForPublic = jest.fn().mockRejectedValueOnce(
        new HttpException(
          {
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            code: 'PLATFORM_LEAD_FORM_TURNSTILE_VERIFICATION_FAILED',
          },
          400,
        ),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/lead-form/lavacar-bh/submissions')
        .set('X-Tenant-Slug', 'lavacar-bh')
        .send(submitBody);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'PLATFORM_LEAD_FORM_TURNSTILE_VERIFICATION_FAILED' });
    });

    it('submits as an authenticated customer — customerId resolved from the Authorization header', async () => {
      const response: HotsiteLeadFormSubmissionResponse = { submissionId: 'submission-uuid' };
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.postForPublic = jest.fn().mockResolvedValueOnce(response);
      const jwtSecret = process.env.JWT_SECRET!;
      const token = jwt.sign(
        {
          sub: CUSTOMER_ID,
          tenantId: tenantInfo.id,
          tenantSlug: tenantInfo.slug,
          tenantName: tenantInfo.name,
          userName: null,
          role: 'CUSTOMER',
          locale: 'pt-BR',
        },
        jwtSecret,
      );

      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/lead-form/lavacar-bh/submissions')
        .set('X-Tenant-Slug', 'lavacar-bh')
        .set('Authorization', `Bearer ${token}`)
        .send(submitBody);

      expect(res.status).toBe(200);
      expect(backendHttpService.postForPublic).toHaveBeenCalledWith(
        '/platform/lead-form/submissions',
        expect.objectContaining({ customerId: CUSTOMER_ID }),
        tenantInfo.id,
        expect.any(Number),
      );
    });

    it('returns 404 when the slug does not resolve to a tenant', async () => {
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException({ title: 'Not Found', status: 404 }, 404),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/lead-form/lavacar-bh/submissions')
        .set('X-Tenant-Slug', 'lavacar-bh')
        .send(submitBody);

      expect(res.status).toBe(404);
    });

    it('propagates 429 when the backend rejects on the daily submission cap', async () => {
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.postForPublic = jest.fn().mockRejectedValueOnce(
        new HttpException(
          {
            title: 'Too Many Requests',
            status: 429,
            code: 'PLATFORM_LEAD_FORM_DAILY_CAP_REACHED',
          },
          429,
        ),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/lead-form/lavacar-bh/submissions')
        .set('X-Tenant-Slug', 'lavacar-bh')
        .send(submitBody);

      expect(res.status).toBe(429);
    });

    it('propagates 401 when the backend rejects a CUSTOMER_ONLY submission with no customer session', async () => {
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.postForPublic = jest
        .fn()
        .mockRejectedValueOnce(
          new HttpException({ title: 'Unauthorized', status: 401, code: 'AUTH_UNAUTHORIZED' }, 401),
        );

      const res = await request(app.getHttpServer())
        .post('/v1/public/platform/lead-form/lavacar-bh/submissions')
        .set('X-Tenant-Slug', 'lavacar-bh')
        .send(submitBody);

      expect(res.status).toBe(401);
    });
  });
});
