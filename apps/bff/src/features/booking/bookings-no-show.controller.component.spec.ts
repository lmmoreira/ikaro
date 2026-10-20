import { HttpException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MockHttpService,
  MockBackendHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeStaffJwt,
  setupActiveGuardMock,
  request,
} from '../../test/component-test.helpers';

const BOOKING_ID = '40000000-0000-4000-8000-000000000010';
const OTHER_TENANT_ID = '10000000-0000-4000-8000-000000000002';

const markPath = `/v1/bookings/${BOOKING_ID}/no-show`;
const correctPath = `/v1/bookings/${BOOKING_ID}/no-show/correct`;

const mockMarkResponse = { bookingId: BOOKING_ID, status: 'NO_SHOW' };
const mockCorrectResponse = { bookingId: BOOKING_ID, status: 'COMPLETED' };
const validCorrectBody = {
  correctedStatus: 'COMPLETED',
  reason: 'The customer did arrive, it was logged by mistake',
};

describe('BookingsNoShowController (component)', () => {
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

  describe('POST /v1/bookings/:id/no-show', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).post(markPath).send({});
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .post(markPath)
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({});
      expect(res.status).toBe(403);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });

    it('returns 400 when :id is not a UUID', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/bookings/not-a-uuid/no-show')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 when the reason is longer than 500 characters (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post(markPath)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ reason: 'x'.repeat(501) });
      expect(res.status).toBe(400);
    });

    it('MANAGER JWT → 200, calls POST /bookings/:id/no-show on the backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockMarkResponse);

      const res = await request(app.getHttpServer())
        .post(markPath)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ reason: 'Did not show up' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockMarkResponse);
      expect(backendHttpService.post).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}/no-show`, {
        reason: 'Did not show up',
      });
    });

    it('STAFF JWT → 200', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockMarkResponse);

      const res = await request(app.getHttpServer())
        .post(markPath)
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send({ reason: 'Did not show up' });

      expect(res.status).toBe(200);
    });

    it('accepts a request with no body and forwards an empty object', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockMarkResponse);

      const res = await request(app.getHttpServer())
        .post(markPath)
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(backendHttpService.post).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}/no-show`, {});
    });

    it('does not forward a tenantId sent in the body', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockMarkResponse);

      await request(app.getHttpServer())
        .post(markPath)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ reason: 'Did not show up', tenantId: OTHER_TENANT_ID });

      expect(backendHttpService.post).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}/no-show`, {
        reason: 'Did not show up',
      });
    });

    it('propagates a backend 404 (cross-tenant or missing booking)', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(new HttpException('Not Found', 404));

      const res = await request(app.getHttpServer())
        .post(markPath)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({});

      expect(res.status).toBe(404);
    });

    it('propagates a backend 5xx as 500', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(
        new HttpException('Internal Server Error', 500),
      );

      const res = await request(app.getHttpServer())
        .post(markPath)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({});

      expect(res.status).toBe(500);
    });
  });

  describe('POST /v1/bookings/:id/no-show/correct', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).post(correctPath).send(validCorrectBody);
      expect(res.status).toBe(401);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .post(correctPath)
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send(validCorrectBody);
      expect(res.status).toBe(403);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });

    it('returns 403 for STAFF role — only a MANAGER may correct a no-show', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post(correctPath)
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send(validCorrectBody);
      expect(res.status).toBe(403);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });

    it('returns 400 when :id is not a UUID', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/bookings/not-a-uuid/no-show/correct')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send(validCorrectBody);
      expect(res.status).toBe(400);
    });

    it.each([
      ['shorter than 10 characters', 'too short'],
      ['longer than 500 characters', 'x'.repeat(501)],
    ])('returns 400 when the reason is %s (Zod)', async (_label, reason) => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post(correctPath)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ correctedStatus: 'COMPLETED', reason });
      expect(res.status).toBe(400);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });

    it('returns 400 when the reason is missing (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post(correctPath)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ correctedStatus: 'COMPLETED' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when correctedStatus is anything other than COMPLETED (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post(correctPath)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ ...validCorrectBody, correctedStatus: 'CANCELLED' });
      expect(res.status).toBe(400);
    });

    it('MANAGER JWT → 200, calls POST /bookings/:id/no-show/correct on the backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockCorrectResponse);

      const res = await request(app.getHttpServer())
        .post(correctPath)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send(validCorrectBody);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockCorrectResponse);
      expect(backendHttpService.post).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID}/no-show/correct`,
        validCorrectBody,
      );
    });

    it('does not forward a tenantId sent in the body', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockCorrectResponse);

      await request(app.getHttpServer())
        .post(correctPath)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ ...validCorrectBody, tenantId: OTHER_TENANT_ID });

      expect(backendHttpService.post).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID}/no-show/correct`,
        validCorrectBody,
      );
    });

    it('propagates a backend 422 (booking is not NO_SHOW)', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(
        new HttpException({ status: 422, detail: 'invalid transition' }, 422),
      );

      const res = await request(app.getHttpServer())
        .post(correctPath)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send(validCorrectBody);

      expect(res.status).toBe(422);
    });
  });
});
