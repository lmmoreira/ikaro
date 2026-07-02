import { makeBackendHttp } from '../../test/backend-http.mock';
import { HotsiteAdminController, UpdateHotsiteContentBodySchema } from './hotsite-admin.controller';
import {
  FeatureBookingPhotoResponse,
  GenerateHotsiteImageSignedUrlResponse,
  HotsiteAdminContentResponse,
  PublishHotsiteResponse,
  UnpublishHotsiteResponse,
} from '@ikaro/types';

const hotsiteContentResponse: HotsiteAdminContentResponse = {
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
  seo: { title: null, description: null },
  isPublished: false,
  updatedAt: '2026-06-01T10:00:00.000Z',
};

const publishedResponse: PublishHotsiteResponse = { isPublished: true };
const unpublishedResponse: UnpublishHotsiteResponse = { isPublished: false };

const signedUrlResponse: GenerateHotsiteImageSignedUrlResponse = {
  signedUrl: 'https://storage.example.com/signed?token=abc',
  filePath: 'tenants/10000000-0000-4000-8000-000000000001/hotsite/branding/u1/logo.png',
  expiresAt: '2026-06-01T10:15:00.000Z',
};

const featureBookingPhotoResponse: FeatureBookingPhotoResponse = {
  filePath: 'tenants/10000000-0000-4000-8000-000000000001/hotsite/gallery/g1/after-1.jpg',
  url: 'https://public.storage.example.com/tenants/10000000-0000-4000-8000-000000000001/hotsite/gallery/g1/after-1.jpg',
  photoType: 'after',
};

describe('HotsiteAdminController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('getContent()', () => {
    it('calls GET /tenants/hotsite and returns the content', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(hotsiteContentResponse),
      });
      const controller = new HotsiteAdminController(backendHttp);

      const result = await controller.getContent();

      expect(backendHttp.get).toHaveBeenCalledWith('/tenants/hotsite');
      expect(result).toEqual(hotsiteContentResponse);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockRejectedValue(new Error('404')) });
      const controller = new HotsiteAdminController(backendHttp);

      await expect(controller.getContent()).rejects.toThrow('404');
    });
  });

  describe('updateContent()', () => {
    it('calls PATCH /tenants/hotsite with the parsed body and returns the updated content', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockResolvedValue(hotsiteContentResponse),
      });
      const controller = new HotsiteAdminController(backendHttp);
      const body = { branding: { primaryColor: '#FF5733' } };

      const result = await controller.updateContent(body);

      expect(backendHttp.patch).toHaveBeenCalledWith('/tenants/hotsite', body);
      expect(result).toEqual(hotsiteContentResponse);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ patch: jest.fn().mockRejectedValue(new Error('400')) });
      const controller = new HotsiteAdminController(backendHttp);

      await expect(
        controller.updateContent({ branding: { primaryColor: '#FF5733' } }),
      ).rejects.toThrow('400');
    });
  });

  describe('UpdateHotsiteContentBodySchema', () => {
    it('retains buttonBackgroundColor and buttonTextColor (not stripped)', () => {
      const result = UpdateHotsiteContentBodySchema.parse({
        branding: { buttonBackgroundColor: '#fbbf24', buttonTextColor: '#0f172a' },
      });

      expect(result.branding).toEqual({
        buttonBackgroundColor: '#fbbf24',
        buttonTextColor: '#0f172a',
      });
    });

    it('rejects an invalid buttonBackgroundColor hex value', () => {
      const result = UpdateHotsiteContentBodySchema.safeParse({
        branding: { buttonBackgroundColor: 'notacolor' },
      });

      expect(result.success).toBe(false);
    });

    it('rejects an invalid buttonTextColor hex value', () => {
      const result = UpdateHotsiteContentBodySchema.safeParse({
        branding: { buttonTextColor: 'notacolor' },
      });

      expect(result.success).toBe(false);
    });

    it('accepts seo title and description', () => {
      const result = UpdateHotsiteContentBodySchema.parse({
        seo: { title: 'Lavacar Estrela — Agendamento Online', description: 'Agende já.' },
      });

      expect(result.seo).toEqual({
        title: 'Lavacar Estrela — Agendamento Online',
        description: 'Agende já.',
      });
    });

    it('rejects seo.title exceeding 70 characters', () => {
      const result = UpdateHotsiteContentBodySchema.safeParse({
        seo: { title: 'a'.repeat(71) },
      });

      expect(result.success).toBe(false);
    });

    it('rejects an empty body (neither branding, layout, nor seo provided)', () => {
      const result = UpdateHotsiteContentBodySchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('publish()', () => {
    it('calls POST /tenants/hotsite/publish and returns isPublished true', async () => {
      const backendHttp = makeBackendHttp({ post: jest.fn().mockResolvedValue(publishedResponse) });
      const controller = new HotsiteAdminController(backendHttp);

      const result = await controller.publish();

      expect(backendHttp.post).toHaveBeenCalledWith('/tenants/hotsite/publish', {});
      expect(result).toEqual(publishedResponse);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ post: jest.fn().mockRejectedValue(new Error('400')) });
      const controller = new HotsiteAdminController(backendHttp);

      await expect(controller.publish()).rejects.toThrow('400');
    });
  });

  describe('unpublish()', () => {
    it('calls POST /tenants/hotsite/unpublish and returns isPublished false', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockResolvedValue(unpublishedResponse),
      });
      const controller = new HotsiteAdminController(backendHttp);

      const result = await controller.unpublish();

      expect(backendHttp.post).toHaveBeenCalledWith('/tenants/hotsite/unpublish', {});
      expect(result).toEqual(unpublishedResponse);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ post: jest.fn().mockRejectedValue(new Error('404')) });
      const controller = new HotsiteAdminController(backendHttp);

      await expect(controller.unpublish()).rejects.toThrow('404');
    });
  });

  describe('generateImageSignedUrl()', () => {
    it('calls POST /tenants/hotsite/images/signed-url with the parsed body and returns the signed URL', async () => {
      const backendHttp = makeBackendHttp({ post: jest.fn().mockResolvedValue(signedUrlResponse) });
      const controller = new HotsiteAdminController(backendHttp);
      const body = {
        fileName: 'logo.png',
        contentType: 'image/png' as const,
        purpose: 'branding' as const,
      };

      const result = await controller.generateImageSignedUrl(body);

      expect(backendHttp.post).toHaveBeenCalledWith('/tenants/hotsite/images/signed-url', body);
      expect(result).toEqual(signedUrlResponse);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ post: jest.fn().mockRejectedValue(new Error('400')) });
      const controller = new HotsiteAdminController(backendHttp);

      await expect(
        controller.generateImageSignedUrl({
          fileName: 'logo.png',
          contentType: 'image/png',
          purpose: 'branding',
        }),
      ).rejects.toThrow('400');
    });
  });

  describe('featureBookingPhoto()', () => {
    const body = {
      bookingId: '20000000-0000-4000-8000-000000000001',
      photoUrl:
        'tenants/10000000-0000-4000-8000-000000000001/bookings/20000000-0000-4000-8000-000000000001/after-1.jpg',
    };

    it('calls POST /tenants/hotsite/gallery/feature-booking-photo with the parsed body and returns the featured photo', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockResolvedValue(featureBookingPhotoResponse),
      });
      const controller = new HotsiteAdminController(backendHttp);

      const result = await controller.featureBookingPhoto(body);

      expect(backendHttp.post).toHaveBeenCalledWith(
        '/tenants/hotsite/gallery/feature-booking-photo',
        body,
      );
      expect(result).toEqual(featureBookingPhotoResponse);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ post: jest.fn().mockRejectedValue(new Error('404')) });
      const controller = new HotsiteAdminController(backendHttp);

      await expect(controller.featureBookingPhoto(body)).rejects.toThrow('404');
    });
  });
});
