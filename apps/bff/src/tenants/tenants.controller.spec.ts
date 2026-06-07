import { makeBackendHttp } from '../test/backend-http.mock';
import { TenantsController } from './tenants.controller';
import { HotsiteResponse } from './tenants.types';

const tenantInfo = { id: 'tenant-uuid', slug: 'lavacar-bh', name: 'Lavacar BH' };

const hotsiteResponse: HotsiteResponse = {
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
};

describe('TenantsController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('getManifest()', () => {
    it('resolves slug to tenant then composes the hotsite manifest', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        getForPublic: jest.fn().mockResolvedValue(hotsiteResponse),
      });
      const controller = new TenantsController(backendHttp);

      const result = await controller.getManifest('lavacar-bh');

      expect(backendHttp.get).toHaveBeenCalledWith('/internal/tenants/by-slug/lavacar-bh');
      expect(backendHttp.getForPublic).toHaveBeenCalledWith('/hotsite', 'tenant-uuid');
      expect(result).toEqual({ tenant: tenantInfo, ...hotsiteResponse });
    });

    it('propagates 404 when the slug does not resolve to a tenant', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockRejectedValue(new Error('404')) });
      const controller = new TenantsController(backendHttp);

      await expect(controller.getManifest('unknown-slug')).rejects.toThrow('404');
    });

    it('propagates 404 when the hotsite is not published', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        getForPublic: jest.fn().mockRejectedValue(new Error('404')),
      });
      const controller = new TenantsController(backendHttp);

      await expect(controller.getManifest('lavacar-bh')).rejects.toThrow('404');
    });
  });
});
