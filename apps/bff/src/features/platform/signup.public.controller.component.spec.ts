import { HttpException, INestApplication } from '@nestjs/common';
import { SignupPublicController } from './signup.public.controller';
import { MockBackendHttpService, createTestApp, request } from '../../test/component-test.helpers';

const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_TTL = 'THROTTLER:TTL';

describe('SignupPublicController (component)', () => {
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

  describe('GET /v1/public/signup/slug-availability (public)', () => {
    it.each([
      [{ status: 'available' }],
      [{ status: 'taken' }],
      [{ status: 'reserved' }],
      [{ status: 'invalid', reason: 'TOO_SHORT' }],
    ])('forwards the backend verdict %j without a JWT', async (verdict) => {
      backendHttpService.get.mockResolvedValueOnce(verdict);

      const res = await request(app.getHttpServer()).get(
        '/v1/public/signup/slug-availability?slug=lavacar-top',
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual(verdict);
      expect(backendHttpService.get).toHaveBeenCalledWith('/internal/signup/slug-availability', {
        slug: 'lavacar-top',
      });
    });

    it('is never cached, so a stale "available" cannot be served', async () => {
      backendHttpService.get.mockResolvedValueOnce({ status: 'available' });

      const res = await request(app.getHttpServer()).get(
        '/v1/public/signup/slug-availability?slug=lavacar-top',
      );

      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('returns only a status (and a reason), never a tenant field', async () => {
      backendHttpService.get.mockResolvedValueOnce({ status: 'taken' });

      const res = await request(app.getHttpServer()).get(
        '/v1/public/signup/slug-availability?slug=lavacar-top',
      );

      expect(Object.keys(res.body)).toEqual(['status']);
    });

    it('rejects a request without the slug parameter with 400, before the backend', async () => {
      const res = await request(app.getHttpServer()).get('/v1/public/signup/slug-availability');

      expect(res.status).toBe(400);
      expect(backendHttpService.get).not.toHaveBeenCalled();
    });

    it('leaves length and character rules to the backend: a one-letter slug is forwarded', async () => {
      backendHttpService.get.mockResolvedValueOnce({ status: 'invalid', reason: 'TOO_SHORT' });

      const res = await request(app.getHttpServer()).get(
        '/v1/public/signup/slug-availability?slug=a',
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'invalid', reason: 'TOO_SHORT' });
    });

    it('passes a backend failure through instead of answering a wrong verdict', async () => {
      backendHttpService.get.mockRejectedValueOnce(
        new HttpException({ title: 'Service Unavailable', status: 503 }, 503),
      );

      const res = await request(app.getHttpServer()).get(
        '/v1/public/signup/slug-availability?slug=lavacar-top',
      );

      expect(res.status).toBe(503);
    });

    // AppThrottlerGuard skips every environment but staging and production (APP_ENV defaults to
    // local), so a request loop cannot reach a 429 here; the declaration is what is pinned.
    it('declares the 30 requests per minute per IP throttle', () => {
      const handler = SignupPublicController.prototype.getSlugAvailability;

      expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toBe(30);
      expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, handler)).toBe(60_000);
    });
  });
});
