import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { makeBackendHttp } from '../test/backend-http.mock';
import { BookingsController } from './bookings.controller';
import { AttachmentSignedUrlResponse, BookingResponse } from './bookings.types';

const JWT_SECRET = 'test-secret-32-chars-for-bff-spec';
const makeConfigService = (secret = JWT_SECRET) =>
  ({ getOrThrow: () => secret }) as unknown as ConfigService;

const TENANT_SLUG = 'lavacar-bh';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const SERVICE_ID = '30000000-0000-4000-8000-000000000001';
const BOOKING_ID = '40000000-0000-4000-8000-000000000001';

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

const validBody = {
  contactEmail: 'joao@example.com',
  contactName: 'João Silva',
  contactPhone: '+5531999999999',
  scheduledAt: '2026-06-15T10:00:00.000Z',
  serviceIds: [SERVICE_ID],
};

const mockApproveResponse = {
  bookingId: BOOKING_ID,
  status: 'APPROVED',
  approvedAt: '2026-06-15T13:00:00.000Z',
};

const mockRejectResponse = {
  bookingId: BOOKING_ID,
  status: 'REJECTED',
  rejectedAt: '2026-06-15T13:00:00.000Z',
};

const mockRequestInfoResponse = {
  bookingId: BOOKING_ID,
  status: 'INFO_REQUESTED',
  infoRequestedAt: '2026-06-15T13:00:00.000Z',
};

const mockSubmitInfoResponse = {
  bookingId: BOOKING_ID,
  status: 'PENDING',
  infoSubmittedAt: '2026-06-15T14:00:00.000Z',
};

const validRequestInfoBody = { message: 'Please provide clearer photos of the vehicle' };

const validRejectBody = { reason: 'Service unavailable for that date' };

describe('BookingsController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('create()', () => {
    it('returns 400 when X-Tenant-Slug header is missing', async () => {
      const backendHttp = makeBackendHttp();
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller.create(undefined, validBody).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
    });

    it('resolves slug to tenantId then calls postForPublic /bookings', async () => {
      const tenantInfo = { id: TENANT_ID, slug: TENANT_SLUG, name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        postForPublic: jest.fn().mockResolvedValue(mockBookingResponse),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.create(TENANT_SLUG, validBody);

      expect(backendHttp.get).toHaveBeenCalledWith(`/internal/tenants/by-slug/${TENANT_SLUG}`);
      expect(backendHttp.postForPublic).toHaveBeenCalledWith('/bookings', validBody, TENANT_ID);
      expect(result).toBe(mockBookingResponse);
    });

    it('propagates backend errors', async () => {
      const tenantInfo = { id: TENANT_ID, slug: TENANT_SLUG, name: 'Lavacar BH' };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        postForPublic: jest.fn().mockRejectedValue(new Error('409')),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      await expect(controller.create(TENANT_SLUG, validBody)).rejects.toThrow('409');
    });

    it('propagates 404 from backend when slug is not found', async () => {
      const backendHttp = makeBackendHttp({
        get: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 404, detail: 'not found' }, 404)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller.create('unknown-slug', validBody).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });

  describe('cancel()', () => {
    const mockCancelResponse = { bookingId: BOOKING_ID, status: 'CANCELLED' };
    const customerUser = {
      sub: '20000000-0000-4000-8000-000000000001',
      tenantId: TENANT_ID,
      tenantSlug: 'lavacar-bh',
      role: 'CUSTOMER',
    };
    const managerUser = {
      sub: '20000000-0000-4000-8000-000000000002',
      tenantId: TENANT_ID,
      tenantSlug: 'lavacar-bh',
      role: 'MANAGER',
    };

    describe('CUSTOMER role', () => {
      it('routes to /cancel-customer and returns result', async () => {
        const backendHttp = makeBackendHttp({
          patch: jest.fn().mockResolvedValue(mockCancelResponse),
        });
        const controller = new BookingsController(backendHttp, makeConfigService());

        const result = await controller.cancel(BOOKING_ID, {}, customerUser);

        expect(backendHttp.patch).toHaveBeenCalledWith(
          `/bookings/${BOOKING_ID}/cancel-customer`,
          {},
        );
        expect(result).toBe(mockCancelResponse);
      });

      it('propagates 403 from backend when caller is not the booking owner', async () => {
        const backendHttp = makeBackendHttp({
          patch: jest
            .fn()
            .mockRejectedValue(new HttpException({ status: 403, detail: 'forbidden' }, 403)),
        });
        const controller = new BookingsController(backendHttp, makeConfigService());

        const err = await controller.cancel(BOOKING_ID, {}, customerUser).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(403);
      });

      it('propagates 422 from backend when cancellation window has expired', async () => {
        const backendHttp = makeBackendHttp({
          patch: jest
            .fn()
            .mockRejectedValue(
              new HttpException({ status: 422, detail: 'Cancellation window has expired' }, 422),
            ),
        });
        const controller = new BookingsController(backendHttp, makeConfigService());

        const err = await controller.cancel(BOOKING_ID, {}, customerUser).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(422);
      });

      it('propagates 422 from backend when booking state is terminal', async () => {
        const backendHttp = makeBackendHttp({
          patch: jest
            .fn()
            .mockRejectedValue(
              new HttpException({ status: 422, detail: 'invalid transition' }, 422),
            ),
        });
        const controller = new BookingsController(backendHttp, makeConfigService());

        const err = await controller
          .cancel('unknown-id', {}, customerUser)
          .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(422);
      });

      it('propagates 404 from backend when booking is not found', async () => {
        const backendHttp = makeBackendHttp({
          patch: jest
            .fn()
            .mockRejectedValue(new HttpException({ status: 404, detail: 'not found' }, 404)),
        });
        const controller = new BookingsController(backendHttp, makeConfigService());

        const err = await controller
          .cancel('unknown-id', {}, customerUser)
          .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(404);
      });
    });

    describe('MANAGER/STAFF role', () => {
      it('routes to /cancel-admin with empty body and returns result', async () => {
        const backendHttp = makeBackendHttp({
          patch: jest.fn().mockResolvedValue(mockCancelResponse),
        });
        const controller = new BookingsController(backendHttp, makeConfigService());

        const result = await controller.cancel(BOOKING_ID, {}, managerUser);

        expect(backendHttp.patch).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}/cancel-admin`, {});
        expect(result).toBe(mockCancelResponse);
      });

      it('routes to /cancel-admin with reason body', async () => {
        const backendHttp = makeBackendHttp({
          patch: jest.fn().mockResolvedValue(mockCancelResponse),
        });
        const controller = new BookingsController(backendHttp, makeConfigService());

        await controller.cancel(BOOKING_ID, { reason: 'Staff unavailable' }, managerUser);

        expect(backendHttp.patch).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}/cancel-admin`, {
          reason: 'Staff unavailable',
        });
      });

      it('propagates 422 from backend when booking is in terminal state', async () => {
        const backendHttp = makeBackendHttp({
          patch: jest
            .fn()
            .mockRejectedValue(
              new HttpException({ status: 422, detail: 'invalid transition' }, 422),
            ),
        });
        const controller = new BookingsController(backendHttp, makeConfigService());

        const err = await controller.cancel(BOOKING_ID, {}, managerUser).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(422);
      });

      it('propagates 404 from backend when booking is not found', async () => {
        const backendHttp = makeBackendHttp({
          patch: jest
            .fn()
            .mockRejectedValue(new HttpException({ status: 404, detail: 'not found' }, 404)),
        });
        const controller = new BookingsController(backendHttp, makeConfigService());

        const err = await controller.cancel('unknown-id', {}, managerUser).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(404);
      });
    });
  });

  describe('approve()', () => {
    it('calls patch /bookings/:id/approve and returns the result', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockResolvedValue(mockApproveResponse),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.approve(BOOKING_ID);

      expect(backendHttp.patch).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}/approve`, {});
      expect(result).toBe(mockApproveResponse);
    });

    it('propagates 409 from backend when slot is unavailable', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 409, detail: 'slot unavailable' }, 409)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller.approve(BOOKING_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
    });

    it('propagates 422 from backend when transition is invalid', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 422, detail: 'invalid transition' }, 422)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller.approve(BOOKING_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });

    it('propagates 404 from backend when booking is not found', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 404, detail: 'not found' }, 404)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller.approve('unknown-id').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });

  describe('reject()', () => {
    it('calls patch /bookings/:id/reject with body and returns the result', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockResolvedValue(mockRejectResponse),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.reject(BOOKING_ID, validRejectBody);

      expect(backendHttp.patch).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID}/reject`,
        validRejectBody,
      );
      expect(result).toBe(mockRejectResponse);
    });

    it('propagates 422 from backend when transition is invalid', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 422, detail: 'invalid transition' }, 422)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller.reject(BOOKING_ID, validRejectBody).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });

    it('propagates 404 from backend when booking is not found', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 404, detail: 'not found' }, 404)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller.reject('unknown-id', validRejectBody).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });

  describe('requestInfo()', () => {
    it('calls patch /bookings/:id/request-info with body and returns the result', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockResolvedValue(mockRequestInfoResponse),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.requestInfo(BOOKING_ID, validRequestInfoBody);

      expect(backendHttp.patch).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID}/request-info`,
        validRequestInfoBody,
      );
      expect(result).toBe(mockRequestInfoResponse);
    });

    it('propagates 422 from backend when booking is not in PENDING state', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 422, detail: 'invalid transition' }, 422)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .requestInfo(BOOKING_ID, validRequestInfoBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });

    it('propagates 404 from backend when booking is not found', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 404, detail: 'not found' }, 404)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .requestInfo('unknown-id', validRequestInfoBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });

  describe('submitInfo()', () => {
    const validSubmitBody = { response: 'Here are the photos you requested' };

    it('calls patch /bookings/:id/submit-info with body and returns the result', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockResolvedValue(mockSubmitInfoResponse),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.submitInfo(BOOKING_ID, validSubmitBody);

      expect(backendHttp.patch).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID}/submit-info`,
        validSubmitBody,
      );
      expect(result).toBe(mockSubmitInfoResponse);
    });

    it('propagates 403 from backend when caller is not the booking owner', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 403, detail: 'forbidden' }, 403)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller.submitInfo(BOOKING_ID, validSubmitBody).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(403);
    });

    it('propagates 422 from backend when booking is not INFO_REQUESTED', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 422, detail: 'invalid transition' }, 422)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller.submitInfo(BOOKING_ID, validSubmitBody).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });

    it('propagates 404 from backend when booking is not found', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 404, detail: 'not found' }, 404)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .submitInfo('unknown-id', validSubmitBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });

  describe('submitInfoGuest()', () => {
    const JWT_SECRET = 'test-secret-32-chars-for-bff-spec';
    const validSubmitBody = { response: 'Here are the vehicle photos as requested' };
    const mockSubmitGuestResponse = {
      bookingId: BOOKING_ID,
      status: 'PENDING',
      infoSubmittedAt: '2026-06-15T14:00:00.000Z',
    };

    it('returns 400 when token query param is missing', async () => {
      const backendHttp = makeBackendHttp();
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .submitInfoGuest(BOOKING_ID, undefined, validSubmitBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
    });

    it('returns 401 when token is invalid', async () => {
      const backendHttp = makeBackendHttp();
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .submitInfoGuest(BOOKING_ID, 'invalid.token.here', validSubmitBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(401);
    });

    it('returns 400 when token bookingId does not match route param', async () => {
      const token = jwt.sign(
        { bookingId: 'other-booking-id', tenantId: TENANT_ID, contactEmail: 'guest@example.com' },
        JWT_SECRET,
        { expiresIn: 604800 },
      );
      const backendHttp = makeBackendHttp();
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .submitInfoGuest(BOOKING_ID, token, validSubmitBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
    });

    it('calls patchForPublic with contactEmail from token and returns result', async () => {
      const contactEmail = 'guest@example.com';
      const token = jwt.sign(
        { bookingId: BOOKING_ID, tenantId: TENANT_ID, contactEmail },
        JWT_SECRET,
        { expiresIn: 604800 },
      );
      const backendHttp = makeBackendHttp({
        patchForPublic: jest.fn().mockResolvedValue(mockSubmitGuestResponse),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.submitInfoGuest(BOOKING_ID, token, validSubmitBody);

      expect(backendHttp.patchForPublic).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID}/submit-info/guest`,
        { contactEmail, ...validSubmitBody },
        TENANT_ID,
      );
      expect(result).toBe(mockSubmitGuestResponse);
    });

    it('propagates 422 from backend when booking is not INFO_REQUESTED', async () => {
      const token = jwt.sign(
        { bookingId: BOOKING_ID, tenantId: TENANT_ID, contactEmail: 'guest@example.com' },
        JWT_SECRET,
        { expiresIn: 604800 },
      );
      const backendHttp = makeBackendHttp({
        patchForPublic: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 422, detail: 'invalid transition' }, 422)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .submitInfoGuest(BOOKING_ID, token, validSubmitBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });
  });

  describe('list()', () => {
    const backendItem = {
      id: BOOKING_ID,
      status: 'PENDING',
      type: 'CUSTOMER',
      customerId: '20000000-0000-4000-8000-000000000001',
      contactName: 'João',
      contactEmail: 'joao@example.com',
      scheduledAt: '2026-06-15T10:00:00.000Z',
      totalDurationMins: 30,
      totalPrice: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
      lineSummary: [
        {
          serviceId: SERVICE_ID,
          serviceNameAtBooking: 'Lavagem Simples',
          priceAtBooking: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const backendListResponse = {
      items: [backendItem],
      pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
    };

    it('passes status and default pagination to backend and maps to StaffBookingListResponse', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(backendListResponse),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.list({
        status: 'PENDING,INFO_REQUESTED',
        page: 1,
        limit: 20,
      });

      expect(backendHttp.get).toHaveBeenCalledWith('/bookings', {
        status: 'PENDING,INFO_REQUESTED',
        limit: 20,
        offset: 0,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].bookingId).toBe(BOOKING_ID);
      expect(result.items[0].serviceNames).toEqual(['Lavagem Simples']);
      expect(result.items[0].isCustomer).toBe(true);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('converts date to from/to datetime boundaries', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({
          items: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false },
        }),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      await controller.list({ status: 'APPROVED', date: '2026-06-16', page: 1, limit: 20 });

      expect(backendHttp.get).toHaveBeenCalledWith('/bookings', {
        status: 'APPROVED',
        limit: 20,
        offset: 0,
        from: '2026-06-16T00:00:00.000Z',
        to: '2026-06-16T23:59:59.999Z',
      });
    });

    it('converts from date to from datetime and omits to', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({
          items: [],
          pagination: { limit: 20, offset: 0, total: 0, hasMore: false },
        }),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      await controller.list({ status: 'APPROVED', from: '2026-06-17', page: 1, limit: 20 });

      expect(backendHttp.get).toHaveBeenCalledWith('/bookings', {
        status: 'APPROVED',
        limit: 20,
        offset: 0,
        from: '2026-06-17T00:00:00.000Z',
      });
    });

    it('calculates offset from page 2', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({
          items: [],
          pagination: { limit: 20, offset: 20, total: 0, hasMore: false },
        }),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      await controller.list({ status: 'PENDING', page: 2, limit: 20 });

      expect(backendHttp.get).toHaveBeenCalledWith(
        '/bookings',
        expect.objectContaining({ offset: 20 }),
      );
    });

    it('maps guest booking with isCustomer = false', async () => {
      const guestItem = { ...backendItem, customerId: null };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({
          items: [guestItem],
          pagination: { limit: 20, offset: 0, total: 1, hasMore: false },
        }),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.list({ status: 'PENDING', page: 1, limit: 20 });

      expect(result.items[0].isCustomer).toBe(false);
    });

    it('propagates backend errors', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockRejectedValue(new HttpException({ status: 500 }, 500)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .list({ status: 'PENDING', page: 1, limit: 20 })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
    });
  });

  describe('getOne()', () => {
    const mockDetailResponse = {
      id: BOOKING_ID,
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

    it('calls GET /bookings/:id and returns result', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(mockDetailResponse) });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.getOne(BOOKING_ID);

      expect(backendHttp.get).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`);
      expect(result).toBe(mockDetailResponse);
    });

    it('propagates 404 from backend', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockRejectedValue(new HttpException({ status: 404 }, 404)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller.getOne(BOOKING_ID).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });

  describe('reschedule()', () => {
    const mockRescheduleResponse = {
      bookingId: BOOKING_ID,
      status: 'APPROVED',
      scheduledAt: '2026-07-20T14:00:00.000Z',
    };
    const validRescheduleBody = { scheduledAt: '2026-07-20T14:00:00.000Z' };

    it('calls patch /bookings/:id/reschedule with body and returns result', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockResolvedValue(mockRescheduleResponse),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.reschedule(BOOKING_ID, validRescheduleBody);

      expect(backendHttp.patch).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID}/reschedule`,
        validRescheduleBody,
      );
      expect(result).toBe(mockRescheduleResponse);
    });

    it('forwards optional adminNotes to backend', async () => {
      const bodyWithNotes = {
        scheduledAt: '2026-07-20T14:00:00.000Z',
        adminNotes: 'Customer request',
      };
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockResolvedValue(mockRescheduleResponse),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      await controller.reschedule(BOOKING_ID, bodyWithNotes);

      expect(backendHttp.patch).toHaveBeenCalledWith(
        `/bookings/${BOOKING_ID}/reschedule`,
        bodyWithNotes,
      );
    });

    it('propagates 422 from backend when booking is not APPROVED', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 422, detail: 'invalid transition' }, 422)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .reschedule(BOOKING_ID, validRescheduleBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });

    it('propagates 422 from backend when new slot is in the past', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(
            new HttpException({ status: 422, detail: 'must be in the future' }, 422),
          ),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .reschedule(BOOKING_ID, validRescheduleBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });

    it('propagates 409 from backend when slot is unavailable', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 409, detail: 'slot unavailable' }, 409)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .reschedule(BOOKING_ID, validRescheduleBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
    });

    it('propagates 404 from backend when booking is not found', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 404, detail: 'not found' }, 404)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .reschedule('unknown-id', validRescheduleBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });

  describe('createAuthenticated()', () => {
    const authBody = {
      scheduledAt: '2026-06-15T10:00:00.000Z',
      serviceIds: [SERVICE_ID],
    };

    it('calls post /bookings/authenticated and returns the booking', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockResolvedValue(mockBookingResponse),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.createAuthenticated(authBody);

      expect(backendHttp.post).toHaveBeenCalledWith('/bookings/authenticated', authBody);
      expect(result).toBe(mockBookingResponse);
    });

    it('propagates backend errors (422 phone-not-set)', async () => {
      const backendHttp = makeBackendHttp({
        post: jest
          .fn()
          .mockRejectedValue(new HttpException({ status: 422, detail: 'phone not set' }, 422)),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller.createAuthenticated(authBody).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });
  });

  describe('generateAttachmentSignedUrl()', () => {
    const mockSignedUrlResponse: AttachmentSignedUrlResponse = {
      signedUrl: 'http://localhost:4443/bucket/path?X-Goog-Signature=abc',
      filePath: `tenants/${TENANT_ID}/uploads/uuid/car.jpg`,
      expiresAt: '2026-06-15T10:15:00.000Z',
    };

    it('scenario 1 — valid CUSTOMER JWT, no bookingId: calls postForPublic with tenantId', async () => {
      const backendHttp = makeBackendHttp({
        postForPublic: jest.fn().mockResolvedValue(mockSignedUrlResponse),
      });
      const token = jwt.sign(
        { sub: 'cust-id', tenantId: TENANT_ID, tenantSlug: TENANT_SLUG, role: 'CUSTOMER' },
        JWT_SECRET,
      );
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.generateAttachmentSignedUrl(`Bearer ${token}`, {
        fileName: 'car.jpg',
        contentType: 'image/jpeg',
      });

      expect(backendHttp.postForPublic).toHaveBeenCalledWith(
        '/bookings/attachments/signed-url',
        { fileName: 'car.jpg', contentType: 'image/jpeg', bookingId: undefined },
        TENANT_ID,
      );
      expect(result).toBe(mockSignedUrlResponse);
    });

    it('scenario 2 — no JWT, tenantSlug in body: resolves tenant then calls postForPublic', async () => {
      const tenantInfo = { id: TENANT_ID, slug: TENANT_SLUG };
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue(tenantInfo),
        postForPublic: jest.fn().mockResolvedValue(mockSignedUrlResponse),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.generateAttachmentSignedUrl(undefined, {
        fileName: 'car.jpg',
        contentType: 'image/jpeg',
        tenantSlug: TENANT_SLUG,
      });

      expect(backendHttp.get).toHaveBeenCalledWith(`/internal/tenants/by-slug/${TENANT_SLUG}`);
      expect(backendHttp.postForPublic).toHaveBeenCalledWith(
        '/bookings/attachments/signed-url',
        { fileName: 'car.jpg', contentType: 'image/jpeg' },
        TENANT_ID,
      );
      expect(result).toBe(mockSignedUrlResponse);
    });

    it('scenario 3 — valid guestToken: verifies token then calls postForPublic', async () => {
      const guestToken = jwt.sign(
        { bookingId: BOOKING_ID, tenantId: TENANT_ID, contactEmail: 'g@test.com' },
        JWT_SECRET,
      );
      const backendHttp = makeBackendHttp({
        postForPublic: jest.fn().mockResolvedValue(mockSignedUrlResponse),
      });
      const controller = new BookingsController(backendHttp, makeConfigService());

      const result = await controller.generateAttachmentSignedUrl(undefined, {
        fileName: 'info.jpg',
        contentType: 'image/jpeg',
        guestToken,
        bookingId: BOOKING_ID,
      });

      expect(backendHttp.postForPublic).toHaveBeenCalledWith(
        '/bookings/attachments/signed-url',
        { fileName: 'info.jpg', contentType: 'image/jpeg', bookingId: BOOKING_ID },
        TENANT_ID,
      );
      expect(result).toBe(mockSignedUrlResponse);
    });

    it('scenario 3 — invalid guestToken: returns 401', async () => {
      const backendHttp = makeBackendHttp({});
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .generateAttachmentSignedUrl(undefined, {
          fileName: 'info.jpg',
          contentType: 'image/jpeg',
          guestToken: 'not-a-valid-jwt',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('scenario 2 — no JWT, no tenantSlug, no guestToken: returns 400', async () => {
      const backendHttp = makeBackendHttp({});
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .generateAttachmentSignedUrl(undefined, {
          fileName: 'car.jpg',
          contentType: 'image/jpeg',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('Bearer with valid signature but wrong schema is treated as no-JWT (falls through to slug/guest branch)', async () => {
      const backendHttp = makeBackendHttp({});
      const controller = new BookingsController(backendHttp, makeConfigService());
      // Guest token has correct signature but lacks sub/tenantSlug/role — parsed.success is false
      const guestShapedToken = jwt.sign(
        { bookingId: BOOKING_ID, tenantId: TENANT_ID, contactEmail: 'g@test.com' },
        JWT_SECRET,
      );

      const err = await controller
        .generateAttachmentSignedUrl(`Bearer ${guestShapedToken}`, {
          fileName: 'car.jpg',
          contentType: 'image/jpeg',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('invalid Bearer token is treated as no-JWT (falls through to slug/guest branch)', async () => {
      const backendHttp = makeBackendHttp({});
      const controller = new BookingsController(backendHttp, makeConfigService());

      const err = await controller
        .generateAttachmentSignedUrl('Bearer not-a-jwt', {
          fileName: 'car.jpg',
          contentType: 'image/jpeg',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });
  });
});
