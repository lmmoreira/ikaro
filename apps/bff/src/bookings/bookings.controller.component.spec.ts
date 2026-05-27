import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';
import {
  MockHttpService,
  MockBackendHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  setupActiveGuardMock,
  request,
  TENANT_ID,
} from '../test/component-test.helpers';
import { BookingResponse } from './bookings.types';

const TENANT_SLUG = 'lavacar-bh';
const SERVICE_ID = '30000000-0000-4000-8000-000000000001';

const mockBookingResponse: BookingResponse = {
  bookingId: '40000000-0000-4000-8000-000000000001',
  status: 'PENDING',
  scheduledAt: '2026-06-15T10:00:00.000Z',
  totalPrice: { amount: 100, currency: 'BRL' },
  totalDurationMins: 30,
  pickupAddress: null,
  beforeServicePhotoUrls: [],
  lines: [
    {
      lineId: '50000000-0000-4000-8000-000000000001',
      serviceId: SERVICE_ID,
      priceAtBooking: { amount: 100, currency: 'BRL' },
      durationMinsAtBooking: 30,
      pointsValueAtBooking: 5,
      requiresPickupAddressAtBooking: false,
    },
  ],
};

const tenantInfo = { id: TENANT_ID, slug: TENANT_SLUG, name: 'Lavacar BH' };

const validGuestBody = {
  guestEmail: 'joao@example.com',
  guestName: 'João Silva',
  guestPhone: '31999999999',
  scheduledAt: '2026-06-15T10:00:00.000Z',
  serviceIds: [SERVICE_ID],
};

const validAuthBody = {
  scheduledAt: '2026-06-15T10:00:00.000Z',
  serviceIds: [SERVICE_ID],
};

describe('BookingsController (component)', () => {
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

  describe('POST /v1/bookings (public — guest)', () => {
    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const res = await request(app.getHttpServer()).post('/v1/bookings').send(validGuestBody);
      expect(res.status).toBe(400);
      expect(res.body.status).toBe(400);
    });

    it('returns 400 when body fails Zod validation (missing guestEmail)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('X-Tenant-Slug', TENANT_SLUG)
        .send({ ...validGuestBody, guestEmail: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when guestPhone is invalid (too short)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('X-Tenant-Slug', TENANT_SLUG)
        .send({ ...validGuestBody, guestPhone: 'abc' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when serviceIds is empty', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('X-Tenant-Slug', TENANT_SLUG)
        .send({ ...validGuestBody, serviceIds: [] });
      expect(res.status).toBe(400);
    });

    it('creates a booking without a JWT (guest flow)', async () => {
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.postForPublic = jest.fn().mockResolvedValueOnce(mockBookingResponse);

      const res = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('X-Tenant-Slug', TENANT_SLUG)
        .send(validGuestBody);

      expect(res.status).toBe(201);
      expect(res.body.bookingId).toBe(mockBookingResponse.bookingId);
      expect(res.body.status).toBe('PENDING');
      expect(backendHttpService.postForPublic).toHaveBeenCalledWith(
        '/bookings',
        expect.objectContaining({ guestEmail: validGuestBody.guestEmail }),
        TENANT_ID,
      );
    });

    it('also accepts a request with a MANAGER JWT (non-guest flow uses same endpoint)', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.postForPublic = jest.fn().mockResolvedValueOnce(mockBookingResponse);

      const res = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('X-Tenant-Slug', TENANT_SLUG)
        .set('Authorization', `Bearer ${token}`)
        .send(validGuestBody);

      expect(res.status).toBe(201);
    });

    it('propagates 409 from backend when slot is unavailable', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      backendHttpService.get.mockResolvedValueOnce(tenantInfo);
      backendHttpService.postForPublic = jest
        .fn()
        .mockRejectedValueOnce(new HE({ status: 409, detail: 'slot unavailable' }, 409));

      const res = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('X-Tenant-Slug', TENANT_SLUG)
        .send(validGuestBody);

      expect(res.status).toBe(409);
    });

    it('propagates 404 when tenant slug is not found', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      backendHttpService.get.mockRejectedValueOnce(
        new HE({ status: 404, detail: 'tenant not found' }, 404),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('X-Tenant-Slug', 'unknown-slug')
        .send(validGuestBody);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /v1/bookings/:id/cancel', () => {
    const BOOKING_ID_CANCEL = '40000000-0000-4000-8000-000000000010';
    const mockCancelResponse = { bookingId: BOOKING_ID_CANCEL, status: 'CANCELLED' };

    it('returns 401 when no JWT is provided', async () => {
      const res = await request(app.getHttpServer()).patch(
        `/v1/bookings/${BOOKING_ID_CANCEL}/cancel`,
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 when JWT role is MANAGER', async () => {
      const token = makeManagerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_CANCEL}/cancel`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('cancels a booking with CUSTOMER JWT', async () => {
      const token = makeCustomerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(mockCancelResponse);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_CANCEL}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
      expect(backendHttpService.patch).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID_CANCEL}/cancel-customer`,
        {},
      );
    });

    it('propagates 422 from backend when cancellation window has expired', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeCustomerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HE({ status: 422, detail: 'Cancellation window has expired' }, 422),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_CANCEL}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(422);
    });

    it('propagates 403 from backend when caller is not the booking owner', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeCustomerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HE({ status: 403, detail: 'forbidden' }, 403),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_CANCEL}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it('propagates 404 from backend when booking is not found', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeCustomerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HE({ status: 404, detail: 'not found' }, 404),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_CANCEL}/cancel`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /v1/bookings/:id/approve', () => {
    const BOOKING_ID_APPROVE = '40000000-0000-4000-8000-000000000002';
    const mockApproveResponse = {
      bookingId: BOOKING_ID_APPROVE,
      status: 'APPROVED',
      approvedAt: '2026-06-15T13:00:00.000Z',
    };

    it('returns 401 when no JWT is provided', async () => {
      const res = await request(app.getHttpServer()).patch(
        `/v1/bookings/${BOOKING_ID_APPROVE}/approve`,
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 when JWT role is CUSTOMER', async () => {
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_APPROVE}/approve`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('approves a booking with MANAGER JWT', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(mockApproveResponse);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_APPROVE}/approve`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('APPROVED');
      expect(backendHttpService.patch).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID_APPROVE}/approve`,
        {},
      );
    });

    it('propagates 409 from backend when slot is taken', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HE({ status: 409, detail: 'slot unavailable' }, 409),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_APPROVE}/approve`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(409);
    });

    it('propagates 422 from backend when transition is invalid', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HE({ status: 422, detail: 'invalid transition' }, 422),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_APPROVE}/approve`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(422);
    });
  });

  describe('PATCH /v1/bookings/:id/reject', () => {
    const BOOKING_ID_REJECT = '40000000-0000-4000-8000-000000000003';
    const mockRejectResponse = {
      bookingId: BOOKING_ID_REJECT,
      status: 'REJECTED',
      rejectedAt: '2026-06-15T13:00:00.000Z',
    };
    const validRejectBody = { reason: 'Service unavailable for that date' };

    it('returns 401 when no JWT is provided', async () => {
      const res = await request(app.getHttpServer()).patch(
        `/v1/bookings/${BOOKING_ID_REJECT}/reject`,
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 when JWT role is CUSTOMER', async () => {
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_REJECT}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send(validRejectBody);
      expect(res.status).toBe(403);
    });

    it('returns 400 when reason is too short (under 10 chars)', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_REJECT}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'short' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when reason is missing', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_REJECT}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('rejects a PENDING booking with MANAGER JWT', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(mockRejectResponse);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_REJECT}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send(validRejectBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('REJECTED');
      expect(res.body.rejectedAt).toBeDefined();
      expect(backendHttpService.patch).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID_REJECT}/reject`,
        validRejectBody,
      );
    });

    it('propagates 422 from backend when transition is invalid', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HE({ status: 422, detail: 'invalid transition' }, 422),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_REJECT}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send(validRejectBody);

      expect(res.status).toBe(422);
    });

    it('propagates 404 from backend when booking is not found', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HE({ status: 404, detail: 'not found' }, 404),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_REJECT}/reject`)
        .set('Authorization', `Bearer ${token}`)
        .send(validRejectBody);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /v1/bookings/:id/request-info', () => {
    const BOOKING_ID_INFO = '40000000-0000-4000-8000-000000000004';
    const mockInfoResponse = {
      bookingId: BOOKING_ID_INFO,
      status: 'INFO_REQUESTED',
      infoRequestedAt: '2026-06-15T13:00:00.000Z',
    };
    const validInfoBody = { message: 'Please provide clearer photos of the vehicle' };

    it('returns 401 when no JWT is provided', async () => {
      const res = await request(app.getHttpServer()).patch(
        `/v1/bookings/${BOOKING_ID_INFO}/request-info`,
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 when JWT role is CUSTOMER', async () => {
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_INFO}/request-info`)
        .set('Authorization', `Bearer ${token}`)
        .send(validInfoBody);
      expect(res.status).toBe(403);
    });

    it('returns 400 when message is shorter than 20 chars', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_INFO}/request-info`)
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'Too short' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when message is missing', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_INFO}/request-info`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('requests more info on a PENDING booking with MANAGER JWT', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(mockInfoResponse);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_INFO}/request-info`)
        .set('Authorization', `Bearer ${token}`)
        .send(validInfoBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('INFO_REQUESTED');
      expect(res.body.infoRequestedAt).toBeDefined();
      expect(backendHttpService.patch).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID_INFO}/request-info`,
        validInfoBody,
      );
    });

    it('propagates 422 from backend when booking is not in PENDING state', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HE({ status: 422, detail: 'invalid transition' }, 422),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_INFO}/request-info`)
        .set('Authorization', `Bearer ${token}`)
        .send(validInfoBody);

      expect(res.status).toBe(422);
    });

    it('propagates 404 from backend when booking is not found', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HE({ status: 404, detail: 'not found' }, 404),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_INFO}/request-info`)
        .set('Authorization', `Bearer ${token}`)
        .send(validInfoBody);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/bookings/authenticated', () => {
    it('returns 401 when no JWT is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/bookings/authenticated')
        .send(validAuthBody);
      expect(res.status).toBe(401);
    });

    it('returns 403 when JWT role is not CUSTOMER (MANAGER)', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .post('/v1/bookings/authenticated')
        .set('Authorization', `Bearer ${token}`)
        .send(validAuthBody);
      expect(res.status).toBe(403);
    });

    it('returns 400 when body fails Zod validation (serviceIds empty)', async () => {
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .post('/v1/bookings/authenticated')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validAuthBody, serviceIds: [] });
      expect(res.status).toBe(400);
    });

    it('returns 400 when scheduledAt is missing', async () => {
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .post('/v1/bookings/authenticated')
        .set('Authorization', `Bearer ${token}`)
        .send({ serviceIds: [SERVICE_ID] });
      expect(res.status).toBe(400);
    });

    it('creates a booking with CUSTOMER JWT', async () => {
      const token = makeCustomerJwt(jwtService);
      backendHttpService.post.mockResolvedValueOnce(mockBookingResponse);

      const res = await request(app.getHttpServer())
        .post('/v1/bookings/authenticated')
        .set('Authorization', `Bearer ${token}`)
        .send(validAuthBody);

      expect(res.status).toBe(201);
      expect(res.body.bookingId).toBe(mockBookingResponse.bookingId);
      expect(backendHttpService.post).toHaveBeenCalledWith(
        '/bookings/authenticated',
        validAuthBody,
      );
    });

    it('propagates 422 from backend when customer phone is not set', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeCustomerJwt(jwtService);
      backendHttpService.post.mockRejectedValueOnce(
        new HE({ status: 422, detail: 'customer-phone-not-set' }, 422),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/bookings/authenticated')
        .set('Authorization', `Bearer ${token}`)
        .send(validAuthBody);

      expect(res.status).toBe(422);
    });

    it('propagates 409 from backend when slot is unavailable', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeCustomerJwt(jwtService);
      backendHttpService.post.mockRejectedValueOnce(
        new HE({ status: 409, detail: 'slot-unavailable' }, 409),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/bookings/authenticated')
        .set('Authorization', `Bearer ${token}`)
        .send(validAuthBody);

      expect(res.status).toBe(409);
    });
  });

  describe('PATCH /v1/bookings/:id/submit-info', () => {
    const BOOKING_ID_SUBMIT = '40000000-0000-4000-8000-000000000005';
    const mockSubmitResponse = {
      bookingId: BOOKING_ID_SUBMIT,
      status: 'PENDING',
      infoSubmittedAt: '2026-06-15T14:00:00.000Z',
    };
    const validSubmitBody = { response: 'Here are the photos you requested' };

    it('returns 401 when no JWT is provided', async () => {
      const res = await request(app.getHttpServer()).patch(
        `/v1/bookings/${BOOKING_ID_SUBMIT}/submit-info`,
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 when JWT role is MANAGER (not CUSTOMER)', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_SUBMIT}/submit-info`)
        .set('Authorization', `Bearer ${token}`)
        .send(validSubmitBody);
      expect(res.status).toBe(403);
    });

    it('returns 400 when response is missing', async () => {
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_SUBMIT}/submit-info`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('submits info with CUSTOMER JWT and returns PENDING status', async () => {
      const token = makeCustomerJwt(jwtService);
      backendHttpService.patch.mockResolvedValueOnce(mockSubmitResponse);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_SUBMIT}/submit-info`)
        .set('Authorization', `Bearer ${token}`)
        .send(validSubmitBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.infoSubmittedAt).toBeDefined();
      expect(backendHttpService.patch).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID_SUBMIT}/submit-info`,
        validSubmitBody,
      );
    });

    it('propagates 403 from backend when customer is not the booking owner', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeCustomerJwt(jwtService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HE({ status: 403, detail: 'forbidden' }, 403),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_SUBMIT}/submit-info`)
        .set('Authorization', `Bearer ${token}`)
        .send(validSubmitBody);

      expect(res.status).toBe(403);
    });

    it('propagates 422 from backend when booking is not INFO_REQUESTED', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeCustomerJwt(jwtService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HE({ status: 422, detail: 'invalid transition' }, 422),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_SUBMIT}/submit-info`)
        .set('Authorization', `Bearer ${token}`)
        .send(validSubmitBody);

      expect(res.status).toBe(422);
    });
  });

  describe('PATCH /v1/bookings/:id/submit-info/guest (public — guest token)', () => {
    const BOOKING_ID_GUEST = '40000000-0000-4000-8000-000000000006';
    const GUEST_EMAIL = 'guest@example.com';
    const mockGuestSubmitResponse = {
      bookingId: BOOKING_ID_GUEST,
      status: 'PENDING',
      infoSubmittedAt: '2026-06-15T14:00:00.000Z',
    };
    const validGuestSubmitBody = { response: 'Here are the vehicle photos as requested' };

    function makeGuestToken(overrides?: Record<string, unknown>): string {
      const secret = app.get(ConfigService).getOrThrow<string>('JWT_SECRET');
      return jwt.sign(
        { bookingId: BOOKING_ID_GUEST, tenantId: TENANT_ID, guestEmail: GUEST_EMAIL, ...overrides },
        secret,
        { expiresIn: 604800 },
      );
    }

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
        { guestEmail: GUEST_EMAIL, ...validGuestSubmitBody },
        TENANT_ID,
      );
    });

    it('propagates 422 from backend when booking is not INFO_REQUESTED', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeGuestToken();
      backendHttpService.patchForPublic.mockRejectedValueOnce(
        new HE({ status: 422, detail: 'invalid transition' }, 422),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_GUEST}/submit-info/guest?token=${token}`)
        .send(validGuestSubmitBody);

      expect(res.status).toBe(422);
    });
  });

  describe('GET /v1/bookings', () => {
    const mockListResponse = {
      items: [],
      pagination: { limit: 25, offset: 0, total: 0, hasMore: false },
    };

    it('returns 401 with no JWT', async () => {
      expect((await request(app.getHttpServer()).get('/v1/bookings')).status).toBe(401);
    });

    it('returns 200 for CUSTOMER with own bookings', async () => {
      const token = makeCustomerJwt(jwtService);
      backendHttpService.get.mockResolvedValueOnce(mockListResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/bookings')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(backendHttpService.get).toHaveBeenCalledWith('/bookings', expect.any(Object));
    });

    it('returns 200 for MANAGER', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(mockListResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/bookings')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('propagates backend error', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeCustomerJwt(jwtService);
      backendHttpService.get.mockRejectedValueOnce(new HE({ status: 500 }, 500));

      const res = await request(app.getHttpServer())
        .get('/v1/bookings')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(500);
    });
  });

  describe('GET /v1/bookings/:id', () => {
    const BOOKING_UUID = '40000000-0000-4000-8000-000000000099';
    const mockDetailResponse = {
      id: BOOKING_UUID,
      status: 'PENDING',
      type: 'CUSTOMER',
      customerId: null,
      guestName: 'João',
      guestEmail: 'joao@example.com',
      guestPhone: '31999999999',
      scheduledAt: '2026-06-15T10:00:00.000Z',
      totalDurationMins: 30,
      totalPrice: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
      totalActualPrice: null,
      pickupAddress: null,
      lines: [],
      beforeServicePhotoUrls: [],
      afterServicePhotoUrls: [],
      adminNotes: null,
      infoRequestMessage: null,
      infoResponseMessage: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    it('returns 401 with no JWT', async () => {
      expect((await request(app.getHttpServer()).get(`/v1/bookings/${BOOKING_UUID}`)).status).toBe(
        401,
      );
    });

    it('returns 200 for CUSTOMER', async () => {
      const token = makeCustomerJwt(jwtService);
      backendHttpService.get.mockResolvedValueOnce(mockDetailResponse);

      const res = await request(app.getHttpServer())
        .get(`/v1/bookings/${BOOKING_UUID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(backendHttpService.get).toHaveBeenCalledWith(`/bookings/${BOOKING_UUID}`);
    });

    it('returns 200 for MANAGER', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(mockDetailResponse);

      const res = await request(app.getHttpServer())
        .get(`/v1/bookings/${BOOKING_UUID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('propagates 404 from backend', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeCustomerJwt(jwtService);
      backendHttpService.get.mockRejectedValueOnce(new HE({ status: 404 }, 404));

      const res = await request(app.getHttpServer())
        .get(`/v1/bookings/${BOOKING_UUID}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
