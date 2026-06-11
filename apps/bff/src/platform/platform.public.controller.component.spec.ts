import { HttpException, INestApplication } from '@nestjs/common';
import { MockBackendHttpService, createTestApp, request } from '../test/component-test.helpers';
import { HotsiteBusinessInfoResponse, HotsiteResponse } from '@beloauto/types';

const tenantInfo = { id: 'tenant-uuid', slug: 'lavacar-bh', name: 'Lavacar BH' };

const businessInfo: HotsiteBusinessInfoResponse = {
  phone: '11987654321',
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

const hotsiteResponse: HotsiteResponse & { business: HotsiteBusinessInfoResponse } = {
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
        ctaTarget: 'booking',
      },
    },
  ],
  isPublished: true,
  business: businessInfo,
};

const unpublishedHotsiteResponse: HotsiteResponse & { business: HotsiteBusinessInfoResponse } = {
  branding: hotsiteResponse.branding,
  layout: [],
  isPublished: false,
  business: { phone: null, email: null, address: null, socialLinks: null },
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

  describe('GET /v1/platform/manifest/:slug (public)', () => {
    it('returns the composed manifest without a JWT', async () => {
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.getForPublic = jest.fn().mockResolvedValueOnce(hotsiteResponse);

      const res = await request(app.getHttpServer()).get('/v1/platform/manifest/lavacar-bh');

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

      const res = await request(app.getHttpServer()).get('/v1/platform/manifest/unknown-slug');

      expect(res.status).toBe(404);
    });

    it('returns 200 with isPublished: false and an empty layout when the hotsite is not published', async () => {
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.getForPublic = jest.fn().mockResolvedValueOnce(unpublishedHotsiteResponse);

      const res = await request(app.getHttpServer()).get('/v1/platform/manifest/lavacar-bh');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tenant: tenantInfo, ...unpublishedHotsiteResponse });
    });
  });
});
