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
  contactEmail: 'joao@example.com',
  contactName: 'João Silva',
  contactPhone: '+5531999999999',
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

    it('returns 400 when body fails Zod validation (missing contactEmail)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('X-Tenant-Slug', TENANT_SLUG)
        .send({ ...validGuestBody, contactEmail: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when contactPhone is invalid (too short)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/bookings')
        .set('X-Tenant-Slug', TENANT_SLUG)
        .send({ ...validGuestBody, contactPhone: 'abc' });
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
        expect.objectContaining({ contactEmail: validGuestBody.contactEmail }),
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

    describe('CUSTOMER role', () => {
      it('routes to cancel-customer and returns 200', async () => {
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

    describe('MANAGER role', () => {
      it('routes to cancel-admin and returns 200', async () => {
        const token = makeManagerJwt(jwtService);
        setupActiveGuardMock(httpService);
        backendHttpService.patch.mockResolvedValueOnce(mockCancelResponse);

        const res = await request(app.getHttpServer())
          .patch(`/v1/bookings/${BOOKING_ID_CANCEL}/cancel`)
          .set('Authorization', `Bearer ${token}`)
          .send({});

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('CANCELLED');
        expect(backendHttpService.patch).toHaveBeenCalledWith(
          `/bookings/${BOOKING_ID_CANCEL}/cancel-admin`,
          {},
        );
      });

      it('routes to cancel-admin with reason body', async () => {
        const token = makeManagerJwt(jwtService);
        setupActiveGuardMock(httpService);
        backendHttpService.patch.mockResolvedValueOnce(mockCancelResponse);

        const res = await request(app.getHttpServer())
          .patch(`/v1/bookings/${BOOKING_ID_CANCEL}/cancel`)
          .set('Authorization', `Bearer ${token}`)
          .send({ reason: 'Staff unavailable' });

        expect(res.status).toBe(200);
        expect(backendHttpService.patch).toHaveBeenCalledWith(
          `/bookings/${BOOKING_ID_CANCEL}/cancel-admin`,
          { reason: 'Staff unavailable' },
        );
      });

      it('propagates 422 from backend when booking is in terminal state', async () => {
        const { HttpException: HE } = await import('@nestjs/common');
        const token = makeManagerJwt(jwtService);
        setupActiveGuardMock(httpService);
        backendHttpService.patch.mockRejectedValueOnce(
          new HE({ status: 422, detail: 'invalid transition' }, 422),
        );

        const res = await request(app.getHttpServer())
          .patch(`/v1/bookings/${BOOKING_ID_CANCEL}/cancel`)
          .set('Authorization', `Bearer ${token}`)
          .send({});

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
          .patch(`/v1/bookings/${BOOKING_ID_CANCEL}/cancel`)
          .set('Authorization', `Bearer ${token}`)
          .send({});

        expect(res.status).toBe(404);
      });
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
      contactName: 'João',
      contactEmail: 'joao@example.com',
      contactPhone: '+5531999999999',
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

  describe('PATCH /v1/bookings/:id/reschedule', () => {
    const BOOKING_ID_RESCHEDULE = '40000000-0000-4000-8000-000000000020';
    const mockRescheduleResponse = {
      bookingId: BOOKING_ID_RESCHEDULE,
      status: 'APPROVED',
      scheduledAt: '2026-07-20T14:00:00.000Z',
    };
    const validRescheduleBody = { scheduledAt: '2026-07-20T14:00:00.000Z' };

    it('returns 401 when no JWT is provided', async () => {
      const res = await request(app.getHttpServer()).patch(
        `/v1/bookings/${BOOKING_ID_RESCHEDULE}/reschedule`,
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 when JWT role is CUSTOMER', async () => {
      const token = makeCustomerJwt(jwtService);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_RESCHEDULE}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send(validRescheduleBody);
      expect(res.status).toBe(403);
    });

    it('returns 400 when scheduledAt is missing', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_RESCHEDULE}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('reschedules booking with MANAGER JWT and returns 200', async () => {
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(mockRescheduleResponse);

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_RESCHEDULE}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send(validRescheduleBody);

      expect(res.status).toBe(200);
      expect(res.body.bookingId).toBe(BOOKING_ID_RESCHEDULE);
      expect(res.body.status).toBe('APPROVED');
      expect(backendHttpService.patch).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID_RESCHEDULE}/reschedule`,
        validRescheduleBody,
      );
    });

    it('propagates 409 from backend when slot is unavailable', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HE({ status: 409, detail: 'slot unavailable' }, 409),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_RESCHEDULE}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send(validRescheduleBody);

      expect(res.status).toBe(409);
    });

    it('propagates 422 from backend when booking is not APPROVED', async () => {
      const { HttpException: HE } = await import('@nestjs/common');
      const token = makeManagerJwt(jwtService);
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HE({ status: 422, detail: 'invalid transition' }, 422),
      );

      const res = await request(app.getHttpServer())
        .patch(`/v1/bookings/${BOOKING_ID_RESCHEDULE}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send(validRescheduleBody);

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
        .patch(`/v1/bookings/${BOOKING_ID_RESCHEDULE}/reschedule`)
        .set('Authorization', `Bearer ${token}`)
        .send(validRescheduleBody);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/bookings/attachments/signed-url', () => {
    const BOOKING_ID_ATTACH = '40000000-0000-4000-8000-000000000099';
    const mockSignedUrlResponse = {
      signedUrl: 'http://localhost:4443/bucket/path?X-Goog-Signature=abc',
      filePath: `tenants/${TENANT_ID}/uploads/uuid/car.jpg`,
      expiresAt: '2026-06-15T10:15:00.000Z',
    };

    it('scenario 1 — valid CUSTOMER JWT, no bookingId: calls postForPublic with tenantId and returns 201', async () => {
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
        expect.objectContaining({ fileName: 'car.jpg', contentType: 'image/jpeg' }),
        TENANT_ID,
      );
    });

    it('scenario 4 — valid MANAGER JWT + bookingId: calls postForPublic with tenantId and bookingId', async () => {
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
        expect.objectContaining({ bookingId: BOOKING_ID_ATTACH }),
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
          bookingId: BOOKING_ID_ATTACH,
        });

      expect(res.status).toBe(201);
      expect(backendHttpService.postForPublic).toHaveBeenCalledWith(
        '/bookings/attachments/signed-url',
        expect.objectContaining({ bookingId: BOOKING_ID_ATTACH }),
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

    it('returns 400 when fileName contains path separator', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/bookings/attachments/signed-url')
        .send({ fileName: '../etc/passwd', contentType: 'image/jpeg', tenantSlug: TENANT_SLUG });

      expect(res.status).toBe(400);
    });
  });
});
