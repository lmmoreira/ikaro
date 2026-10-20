import { HttpException, INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import {
  MockBackendHttpService,
  createTestApp,
  request,
  TENANT_ID,
} from '../../test/component-test.helpers';

describe('BookingsGuestController (component)', () => {
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

  const BOOKING_ID_GUEST = '40000000-0000-4000-8000-000000000006';
  const GUEST_EMAIL = 'guest@example.com';

  function makeGuestToken(overrides?: Record<string, unknown>): string {
    const secret = app.get(ConfigService).getOrThrow<string>('JWT_SECRET');
    return jwt.sign(
      {
        bookingId: BOOKING_ID_GUEST,
        tenantId: TENANT_ID,
        contactEmail: GUEST_EMAIL,
        ...overrides,
      },
      secret,
      { expiresIn: 604800 },
    );
  }

  describe('PATCH /v1/bookings/:id/submit-info/guest (public — guest token)', () => {
    const mockGuestSubmitResponse = {
      bookingId: BOOKING_ID_GUEST,
      status: 'PENDING',
      infoSubmittedAt: '2026-06-15T14:00:00.000Z',
    };
    const validGuestSubmitBody = { response: 'Here are the vehicle photos as requested' };

    it('returns 400 when token query param is missing', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_GUEST}/submit-info/guest`)
        .send(validGuestSubmitBody);
      expect(res.status).toBe(400);
    });

    it('returns 401 when token is invalid', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_GUEST}/submit-info/guest?token=invalid.token.here`)
        .send(validGuestSubmitBody);
      expect(res.status).toBe(401);
    });

    it('returns 400 when token bookingId does not match route param', async () => {
      const token = makeGuestToken({ bookingId: 'other-booking-id' });

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_GUEST}/submit-info/guest?token=${token}`)
        .send(validGuestSubmitBody);
      expect(res.status).toBe(400);
    });

    it('returns 400 when response body is missing', async () => {
      const token = makeGuestToken();

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_GUEST}/submit-info/guest?token=${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('submits info without JWT using guest token and returns result', async () => {
      const token = makeGuestToken();
      backendHttpService.patchForPublic.mockResolvedValueOnce(mockGuestSubmitResponse);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_GUEST}/submit-info/guest?token=${token}`)
        .send(validGuestSubmitBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PENDING');
      expect(backendHttpService.patchForPublic).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID_GUEST}/submit-info/guest`,
        { contactEmail: GUEST_EMAIL, ...validGuestSubmitBody },
        TENANT_ID,
      );
    });

    it('takes the tenant and contact email from the token, never from the body', async () => {
      const token = makeGuestToken();
      backendHttpService.patchForPublic.mockResolvedValueOnce(mockGuestSubmitResponse);

      await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_GUEST}/submit-info/guest?token=${token}`)
        .send({
          ...validGuestSubmitBody,
          tenantId: '10000000-0000-4000-8000-000000000002',
          contactEmail: 'attacker@example.com',
        });

      expect(backendHttpService.patchForPublic).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID_GUEST}/submit-info/guest`,
        { contactEmail: GUEST_EMAIL, ...validGuestSubmitBody },
        TENANT_ID,
      );
    });

    it('propagates 422 from backend when booking is not INFO_REQUESTED', async () => {
      const token = makeGuestToken();
      backendHttpService.patchForPublic.mockRejectedValueOnce(
        new HttpException({ status: 422, detail: 'invalid transition' }, 422),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_GUEST}/submit-info/guest?token=${token}`)
        .send(validGuestSubmitBody);

      expect(res.status).toBe(422);
    });
  });

  describe('GET /v1/bookings/:id/guest (public — guest token)', () => {
    const mockInfoRequestedDetail = {
      id: BOOKING_ID_GUEST,
      status: 'INFO_REQUESTED',
      contactName: 'João',
      scheduledAt: '2026-06-15T10:00:00.000Z',
      infoRequestMessage: 'Please send a photo of the vehicle',
      lines: [{ serviceNameAtBooking: 'Lavagem completa' }, { serviceNameAtBooking: 'Cera' }],
    };

    it('returns 400 when the token query param is missing', async () => {
      const res = await request(app.getHttpServer()).get(`/v1/bookings/${BOOKING_ID_GUEST}/guest`);
      expect(res.status).toBe(400);
      expect(backendHttpService.getForPublic).not.toHaveBeenCalled();
    });

    it('returns 401 when the token is invalid', async () => {
      const res = await request(app.getHttpServer()).get(
        `/v1/bookings/${BOOKING_ID_GUEST}/guest?token=invalid.token.here`,
      );
      expect(res.status).toBe(401);
    });

    it('returns 400 when the token bookingId does not match the route', async () => {
      const token = makeGuestToken({ bookingId: '40000000-0000-4000-8000-0000000000ff' });

      const res = await request(app.getHttpServer()).get(
        `/v1/bookings/${BOOKING_ID_GUEST}/guest?token=${token}`,
      );
      expect(res.status).toBe(400);
      expect(backendHttpService.getForPublic).not.toHaveBeenCalled();
    });

    it('reads the booking without a JWT, scoped to the tenant in the guest token', async () => {
      const token = makeGuestToken();
      backendHttpService.getForPublic.mockResolvedValueOnce(mockInfoRequestedDetail);

      const res = await request(app.getHttpServer()).get(
        `/v1/bookings/${BOOKING_ID_GUEST}/guest?token=${token}`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        bookingId: BOOKING_ID_GUEST,
        status: 'INFO_REQUESTED',
        serviceSummary: 'Lavagem completa, Cera',
        scheduledAt: '2026-06-15T10:00:00.000Z',
        infoRequestMessage: 'Please send a photo of the vehicle',
        contactName: 'João',
      });
      expect(backendHttpService.getForPublic).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID_GUEST}`,
        TENANT_ID,
      );
    });

    it('takes the tenant from the token, never from a query or header value', async () => {
      const token = makeGuestToken();
      backendHttpService.getForPublic.mockResolvedValueOnce(mockInfoRequestedDetail);

      await request(app.getHttpServer())
        .get(
          `/v1/bookings/${BOOKING_ID_GUEST}/guest?token=${token}&tenantId=10000000-0000-4000-8000-000000000002`,
        )
        .set('X-Tenant-ID', '10000000-0000-4000-8000-000000000002');

      expect(backendHttpService.getForPublic).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID_GUEST}`,
        TENANT_ID,
      );
    });

    it('returns 409 GUEST_BOOKING_NOT_AWAITING_INFO when the booking is no longer INFO_REQUESTED', async () => {
      const token = makeGuestToken();
      backendHttpService.getForPublic.mockResolvedValueOnce({
        ...mockInfoRequestedDetail,
        status: 'PENDING',
      });

      const res = await request(app.getHttpServer()).get(
        `/v1/bookings/${BOOKING_ID_GUEST}/guest?token=${token}`,
      );

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BFF_GUEST_BOOKING_NOT_AWAITING_INFO');
    });

    it('propagates a backend 404 for a booking that does not exist', async () => {
      const token = makeGuestToken();
      backendHttpService.getForPublic.mockRejectedValueOnce(
        new HttpException({ status: 404, detail: 'not found' }, 404),
      );

      const res = await request(app.getHttpServer()).get(
        `/v1/bookings/${BOOKING_ID_GUEST}/guest?token=${token}`,
      );
      expect(res.status).toBe(404);
    });
  });
});
