import { makeBackendHttp } from '../test/backend-http.mock';
import { PlatformPublicController } from './platform.public.controller';
import {
  HotsiteBusinessInfoResponse,
  HotsiteLocalizationResponse,
  HotsiteResponse,
  HotsiteSitemapEntryListResponse,
} from '@ikaro/types';

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

const localization: HotsiteLocalizationResponse = {
  language: 'pt-BR',
  currency: 'BRL',
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
    lookupService: 'viacep',
  },
};

const hotsiteResponse: HotsiteResponse & {
  business: HotsiteBusinessInfoResponse;
  localization: HotsiteLocalizationResponse;
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
  seo: { title: 'Lavacar BH — Agendamento Online', description: 'Agende já.' },
  isPublished: true,
  business: businessInfo,
  localization,
};

const unpublishedHotsiteResponse: HotsiteResponse & {
  business: HotsiteBusinessInfoResponse;
  localization: HotsiteLocalizationResponse;
} = {
  branding: hotsiteResponse.branding,
  layout: [],
  seo: { title: null, description: null },
  isPublished: false,
  business: { phone: null, email: null, address: null, socialLinks: null },
  localization,
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
});
