import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MockHttpService,
  MockBackendHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  setupActiveGuardMock,
  request,
  TENANT_ID,
} from '../../test/component-test.helpers';

const TENANT_SLUG = 'lavacar-bh';
const tenantInfo = { id: TENANT_ID, slug: TENANT_SLUG, name: 'Lavacar BH' };

describe('BookingsAttachmentsController (component)', () => {
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

  describe('POST /v1/bookings/attachments/signed-url', () => {
    const BOOKING_ID_ATTACH = '40000000-0000-4000-8000-000000000099';
    const mockSignedUrlResponse = {
      signedUrl: 'http://localhost:4443/bucket/path?X-Goog-Signature=abc',
      filePath: `tenants/${TENANT_ID}/uploads/uuid/car.jpg`,
      expiresAt: '2026-06-15T10:15:00.000Z',
    };

    it('scenario 1 — valid CUSTOMER JWT: calls postForPublic with tenantId and returns 201', async () => {
      const token = makeCustomerJwt(jwtService);
      backendHttpService.postForPublic.mockResolvedValueOnce(mockSignedUrlResponse);

      const res = await request(app.getHttpServer())
        .post('/v1/bookings/attachments/signed-url')
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'car.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(201);
      expect(res.body.signedUrl).toBeDefined();
      expect(res.body.filePath).toBeDefined();
      expect(backendHttpService.postForPublic).toHaveBeenCalledWith(
        '/bookings/attachments/signed-url',
        { fileName: 'car.jpg', contentType: 'image/jpeg' },
        TENANT_ID,
      );
    });

    it('scenario 4 — valid MANAGER JWT: calls postForPublic with tenantId; a stray bookingId is stripped by Zod', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.postForPublic.mockResolvedValueOnce(mockSignedUrlResponse);

      const res = await request(app.getHttpServer())
        .post('/v1/bookings/attachments/signed-url')
        .set('Authorization', `Bearer ${token}`)
        .send({ fileName: 'after.jpg', contentType: 'image/jpeg', bookingId: BOOKING_ID_ATTACH });

      expect(res.status).toBe(201);
      expect(backendHttpService.postForPublic).toHaveBeenCalledWith(
        '/bookings/attachments/signed-url',
        { fileName: 'after.jpg', contentType: 'image/jpeg' },
        TENANT_ID,
      );
    });

    it('scenario 2 — no JWT, tenantSlug in body: resolves tenant then returns 201', async () => {
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.postForPublic = jest.fn().mockResolvedValueOnce(mockSignedUrlResponse);

      const res = await request(app.getHttpServer())
        .post('/v1/bookings/attachments/signed-url')
        .send({ fileName: 'car.jpg', contentType: 'image/jpeg', tenantSlug: TENANT_SLUG });

      expect(res.status).toBe(201);
      expect(backendHttpService.get).toHaveBeenCalledWith(
        `/internal/tenants/by-slug/${TENANT_SLUG}`,
      );
      expect(backendHttpService.postForPublic).toHaveBeenCalledWith(
        '/bookings/attachments/signed-url',
        expect.objectContaining({ fileName: 'car.jpg' }),
        TENANT_ID,
      );
    });

    it('scenario 3 — valid guestToken in body: resolves to 201', async () => {
      // Must use jwtService.sign so the token is signed with the same secret
      // that ConfigService returns (from .env, not TEST_JWT_SECRET)
      const guestToken = jwtService.sign({
        bookingId: BOOKING_ID_ATTACH,
        tenantId: TENANT_ID,
        contactEmail: 'guest@example.com',
      });
      backendHttpService.postForPublic = jest.fn().mockResolvedValueOnce(mockSignedUrlResponse);

      const res = await request(app.getHttpServer())
        .post('/v1/bookings/attachments/signed-url')
        .send({
          fileName: 'info.jpg',
          contentType: 'image/jpeg',
          guestToken,
        });

      expect(res.status).toBe(201);
      expect(backendHttpService.postForPublic).toHaveBeenCalledWith(
        '/bookings/attachments/signed-url',
        { fileName: 'info.jpg', contentType: 'image/jpeg' },
        TENANT_ID,
      );
    });

    it('returns 401 when guestToken is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/bookings/attachments/signed-url')
        .send({ fileName: 'info.jpg', contentType: 'image/jpeg', guestToken: 'bad-token' });

      expect(res.status).toBe(401);
    });

    it('returns 400 when no auth and no tenantSlug', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/bookings/attachments/signed-url')
        .send({ fileName: 'car.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when body fails Zod validation (invalid contentType)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/bookings/attachments/signed-url')
        .send({ fileName: 'car.jpg', contentType: 'text/html', tenantSlug: TENANT_SLUG });

      expect(res.status).toBe(400);
    });

    it('accepts contentType image/webp (client-side compressed upload)', async () => {
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.postForPublic = jest.fn().mockResolvedValueOnce(mockSignedUrlResponse);

      const res = await request(app.getHttpServer())
        .post('/v1/bookings/attachments/signed-url')
        .send({ fileName: 'car.webp', contentType: 'image/webp', tenantSlug: TENANT_SLUG });

      expect(res.status).toBe(201);
      expect(backendHttpService.postForPublic).toHaveBeenCalledWith(
        '/bookings/attachments/signed-url',
        expect.objectContaining({ fileName: 'car.webp', contentType: 'image/webp' }),
        TENANT_ID,
      );
    });

    it('returns 400 when fileName contains path separator', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/bookings/attachments/signed-url')
        .send({ fileName: '../etc/passwd', contentType: 'image/jpeg', tenantSlug: TENANT_SLUG });

      expect(res.status).toBe(400);
    });
  });
});
