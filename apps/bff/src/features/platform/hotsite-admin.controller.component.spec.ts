import { HttpException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  FeatureBookingPhotoResponse,
  GenerateHotsiteImageReadSignedUrlResponse,
  GenerateHotsiteImageSignedUrlResponse,
  HotsiteAdminContentResponse,
  PublishHotsiteResponse,
  UnpublishHotsiteResponse,
} from '@ikaro/types';
import {
  MockBackendHttpService,
  MockHttpService,
  TENANT_ID,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeStaffJwt,
  request,
  setupActiveGuardMock,
} from '../../test/component-test.helpers';

const BOOKING_ID = '40000000-0000-4000-8000-000000000001';

const contentResponse: HotsiteAdminContentResponse = {
  branding: {
    primaryColor: '#2563EB',
    secondaryColor: '#EFF6FF',
    backgroundColor: '#FFFFFF',
    textColor: '#111827',
    headingFontFamily: 'Inter, sans-serif',
    bodyFontFamily: 'Inter, sans-serif',
    logoUrl: '',
    borderRadius: 'rounded',
    buttonStyle: 'filled',
    spacing: 'comfortable',
    shadowStyle: 'subtle',
  },
  layout: [],
  seo: { title: null, description: null, ogImageUrl: '' },
  isPublished: false,
  updatedAt: '2026-07-29T00:00:00.000Z',
};

describe('HotsiteAdminController (component)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let httpService: MockHttpService;
  let backendHttpService: MockBackendHttpService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, jwtService, httpService, backendHttpService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("authentication and role gates (class-level @Roles('MANAGER'), uniform across all endpoints)", () => {
    it('GET /v1/tenants/hotsite → 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/tenants/hotsite');
      expect(res.status).toBe(401);
    });

    it('GET /v1/tenants/hotsite → 403 for STAFF role (MANAGER-only controller)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/tenants/hotsite')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('PATCH /v1/tenants/hotsite → 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/tenants/hotsite')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({ seo: { title: 'Nova loja' } });
      expect(res.status).toBe(403);
    });
  });

  describe('getContent', () => {
    it('GET /v1/tenants/hotsite → 200, proxies to backend unchanged', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(contentResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/tenants/hotsite')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body.seo.ogImageUrl).toBe('');
      expect(backendHttpService.get).toHaveBeenCalledWith('/tenants/hotsite');
    });

    it('GET /v1/tenants/hotsite → forwards the backend error status', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException({ status: 404, detail: 'not found' }, 404),
      );

      const res = await request(app.getHttpServer())
        .get('/v1/tenants/hotsite')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(404);
    });
  });

  describe('updateContent', () => {
    it('PATCH /v1/tenants/hotsite → 200, forwards the parsed body and returns the backend response', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(contentResponse);

      const res = await request(app.getHttpServer())
        .patch('/v1/tenants/hotsite')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ seo: { title: 'Lavacar Estrela — Agendamento', ogImageUrl: '' } });

      expect(res.status).toBe(200);
      expect(backendHttpService.patch).toHaveBeenCalledWith('/tenants/hotsite', {
        seo: { title: 'Lavacar Estrela — Agendamento', ogImageUrl: '' },
      });
    });

    it('PATCH /v1/tenants/hotsite → 400 for an empty body (neither branding, layout, nor seo)', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .patch('/v1/tenants/hotsite')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({});

      expect(res.status).toBe(400);
      expect(backendHttpService.patch).not.toHaveBeenCalled();
    });

    it('PATCH /v1/tenants/hotsite → 400 for an invalid branding.primaryColor', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .patch('/v1/tenants/hotsite')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ branding: { primaryColor: 'not-a-color' } });

      expect(res.status).toBe(400);
      expect(backendHttpService.patch).not.toHaveBeenCalled();
    });

    it('PATCH /v1/tenants/hotsite → forwards the backend error status for a Zod-valid body the backend itself rejects', async () => {
      // Zod-valid at the BFF layer (60-char title limit is a shared @ikaro/validation rule
      // enforced here too) — this specifically exercises the backend's own rejection, not the
      // BFF's Zod pipe.
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HttpException({ status: 409, detail: 'concurrent modification' }, 409),
      );

      const res = await request(app.getHttpServer())
        .patch('/v1/tenants/hotsite')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ seo: { title: 'Novo título' } });

      expect(res.status).toBe(409);
    });
  });

  describe('publish', () => {
    it('POST /v1/tenants/hotsite/publish → 200', async () => {
      setupActiveGuardMock(httpService);
      const response: PublishHotsiteResponse = { isPublished: true };
      backendHttpService.post.mockResolvedValueOnce(response);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/publish')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isPublished: true });
      expect(backendHttpService.post).toHaveBeenCalledWith('/tenants/hotsite/publish', {});
    });

    it('POST /v1/tenants/hotsite/publish → forwards the backend error (e.g. 400 no enabled modules)', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(
        new HttpException({ status: 400, detail: 'no enabled modules' }, 400),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/publish')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(400);
    });
  });

  describe('unpublish', () => {
    it('POST /v1/tenants/hotsite/unpublish → 200', async () => {
      setupActiveGuardMock(httpService);
      const response: UnpublishHotsiteResponse = { isPublished: false };
      backendHttpService.post.mockResolvedValueOnce(response);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/unpublish')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isPublished: false });
      expect(backendHttpService.post).toHaveBeenCalledWith('/tenants/hotsite/unpublish', {});
    });
  });

  describe('generateImageSignedUrl', () => {
    it("POST /v1/tenants/hotsite/images/signed-url → 201 for purpose 'seo-og-image' (M18-S03)", async () => {
      setupActiveGuardMock(httpService);
      const response: GenerateHotsiteImageSignedUrlResponse = {
        signedUrl: 'https://storage.example.com/upload?sig=abc',
        filePath: `tmp/${TENANT_ID}/seo-og-image/u1/share.png`,
        expiresAt: '2026-07-29T01:00:00.000Z',
      };
      backendHttpService.post.mockResolvedValueOnce(response);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/images/signed-url')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ fileName: 'share.png', contentType: 'image/png', purpose: 'seo-og-image' });

      expect(res.status).toBe(201);
      expect(backendHttpService.post).toHaveBeenCalledWith('/tenants/hotsite/images/signed-url', {
        fileName: 'share.png',
        contentType: 'image/png',
        purpose: 'seo-og-image',
      });
    });

    it('POST /v1/tenants/hotsite/images/signed-url → 400 for an unknown purpose', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/images/signed-url')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ fileName: 'share.png', contentType: 'image/png', purpose: 'not-a-real-purpose' });

      expect(res.status).toBe(400);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });

    it('POST /v1/tenants/hotsite/images/signed-url → 400 for a fileName containing a path separator', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/images/signed-url')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ fileName: '../etc/passwd', contentType: 'image/png', purpose: 'branding' });

      expect(res.status).toBe(400);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('generateImageReadSignedUrl', () => {
    it('POST /v1/tenants/hotsite/images/read-signed-url → 201 for a well-formed tmp/ path', async () => {
      setupActiveGuardMock(httpService);
      const response: GenerateHotsiteImageReadSignedUrlResponse = {
        signedUrl: 'https://storage.example.com/signed-read?sig=abc',
        expiresAt: '2026-07-29T01:00:00.000Z',
      };
      backendHttpService.post.mockResolvedValueOnce(response);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/images/read-signed-url')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ filePath: `tmp/${TENANT_ID}/branding/u1/logo.png` });

      expect(res.status).toBe(201);
      expect(backendHttpService.post).toHaveBeenCalledWith(
        '/tenants/hotsite/images/read-signed-url',
        { filePath: `tmp/${TENANT_ID}/branding/u1/logo.png` },
      );
    });

    it('POST /v1/tenants/hotsite/images/read-signed-url → 400 for a non-tmp/ path', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/images/read-signed-url')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ filePath: `tenants/${TENANT_ID}/hotsite/branding/u1/logo.png` });

      expect(res.status).toBe(400);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('featureBookingPhoto', () => {
    it('POST /v1/tenants/hotsite/gallery/feature-booking-photo → 201', async () => {
      setupActiveGuardMock(httpService);
      const response: FeatureBookingPhotoResponse = {
        filePath: `tenants/${TENANT_ID}/hotsite/gallery/u1/photo.jpg`,
        url: 'https://cdn.example.com/photo.jpg',
        photoType: 'after',
      };
      backendHttpService.post.mockResolvedValueOnce(response);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/gallery/feature-booking-photo')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({
          bookingId: BOOKING_ID,
          filePath: `tenants/${TENANT_ID}/bookings/${BOOKING_ID}/photo.jpg`,
          photoType: 'after',
        });

      expect(res.status).toBe(201);
      expect(backendHttpService.post).toHaveBeenCalledWith(
        '/tenants/hotsite/gallery/feature-booking-photo',
        {
          bookingId: BOOKING_ID,
          filePath: `tenants/${TENANT_ID}/bookings/${BOOKING_ID}/photo.jpg`,
          photoType: 'after',
        },
      );
    });

    it('POST /v1/tenants/hotsite/gallery/feature-booking-photo → 400 when filePath does not belong to bookingId', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/gallery/feature-booking-photo')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({
          bookingId: BOOKING_ID,
          filePath: `tenants/${TENANT_ID}/bookings/other-booking-id/photo.jpg`,
          photoType: 'after',
        });

      expect(res.status).toBe(400);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('deleteImage', () => {
    it('POST /v1/tenants/hotsite/images/delete → 204 for a permanent hotsite path', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(undefined);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/images/delete')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ filePath: `tenants/${TENANT_ID}/hotsite/branding/u1/logo.png` });

      expect(res.status).toBe(204);
      expect(backendHttpService.post).toHaveBeenCalledWith('/tenants/hotsite/images/delete', {
        filePath: `tenants/${TENANT_ID}/hotsite/branding/u1/logo.png`,
      });
    });

    it('POST /v1/tenants/hotsite/images/delete → 400 for a path matching neither shape', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/images/delete')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ filePath: 'not-a-valid-storage-path' });

      expect(res.status).toBe(400);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });
  });
});
