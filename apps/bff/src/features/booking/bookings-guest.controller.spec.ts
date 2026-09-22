import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { BffErrorCode } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { BookingsGuestController } from './bookings-guest.controller';

const JWT_SECRET = 'test-secret-64-chars-for-bff-spec-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const makeConfigService = (secret = JWT_SECRET) =>
  ({ getOrThrow: () => secret }) as unknown as ConfigService;

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const SERVICE_ID = '30000000-0000-4000-8000-000000000001';
const BOOKING_ID = '40000000-0000-4000-8000-000000000001';

describe('BookingsGuestController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('submitInfoGuest()', () => {
    const JWT_SECRET = 'test-secret-64-chars-for-bff-spec-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const validSubmitBody = { response: 'Here are the vehicle photos as requested' };
    const mockSubmitGuestResponse = {
      bookingId: BOOKING_ID,
      status: 'PENDING',
      infoSubmittedAt: '2026-06-15T14:00:00.000Z',
    };

    it('returns 400 with BFF_GUEST_TOKEN_MISSING when token query param is missing', async () => {
      const backendHttp = makeBackendHttp();
      const controller = new BookingsGuestController(backendHttp, makeConfigService());

      const err = await controller
        .submitInfoGuest(BOOKING_ID, undefined, validSubmitBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: BffErrorCode.GUEST_TOKEN_MISSING,
      });
    });

    it('returns 401 with BFF_GUEST_TOKEN_INVALID when token is invalid', async () => {
      const backendHttp = makeBackendHttp();
      const controller = new BookingsGuestController(backendHttp, makeConfigService());

      const err = await controller
        .submitInfoGuest(BOOKING_ID, 'invalid.token.here', validSubmitBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(401);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: BffErrorCode.GUEST_TOKEN_INVALID,
      });
    });

    it('returns 400 with BFF_GUEST_TOKEN_BOOKING_MISMATCH when token bookingId does not match route param', async () => {
      const token = jwt.sign(
        { bookingId: 'other-booking-id', tenantId: TENANT_ID, contactEmail: 'guest@example.com' },
        JWT_SECRET,
        { expiresIn: 604800 },
      );
      const backendHttp = makeBackendHttp();
      const controller = new BookingsGuestController(backendHttp, makeConfigService());

      const err = await controller
        .submitInfoGuest(BOOKING_ID, token, validSubmitBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: BffErrorCode.GUEST_TOKEN_BOOKING_MISMATCH,
      });
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
      const controller = new BookingsGuestController(backendHttp, makeConfigService());

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
      const controller = new BookingsGuestController(backendHttp, makeConfigService());

      const err = await controller
        .submitInfoGuest(BOOKING_ID, token, validSubmitBody)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });
  });

  describe('getOneGuest()', () => {
    const JWT_SECRET = 'test-secret-64-chars-for-bff-spec-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const makeToken = (overrides: Record<string, unknown> = {}) =>
      jwt.sign(
        {
          bookingId: BOOKING_ID,
          tenantId: TENANT_ID,
          contactEmail: 'guest@example.com',
          ...overrides,
        },
        JWT_SECRET,
        { expiresIn: 604800 },
      );

    const mockInfoRequestedDetail = {
      id: BOOKING_ID,
      status: 'INFO_REQUESTED',
      type: 'GUEST',
      customerId: null,
      contactName: 'João da Silva',
      contactEmail: 'joao@example.com',
      contactPhone: '+5531999999999',
      contactAddress: null,
      notes: null,
      scheduledAt: '2026-06-18T13:00:00.000Z',
      totalDurationMins: 30,
      totalPrice: { amount: 100, currency: 'BRL' },
      totalActualPrice: null,
      discountPointsUsed: null,
      discountAmount: null,
      pickupAddress: null,
      lines: [
        {
          lineId: '50000000-0000-4000-8000-000000000001',
          serviceId: SERVICE_ID,
          serviceNameAtBooking: 'Lavagem Simples',
          priceAtBooking: { amount: 100, currency: 'BRL' },
          durationMinsAtBooking: 30,
          pointsValueAtBooking: 10,
          requiresPickupAddressAtBooking: false,
          actualPriceCharged: null,
        },
      ],
      beforeServicePhotoUrls: [],
      afterServicePhotoUrls: [],
      adminNotes: null,
      infoRequestMessage: 'Por favor, envie fotos do veículo antes da lavagem.',
      infoResponseMessage: null,
      approvedAt: null,
      approvedBy: null,
      completedAt: null,
      rejectionReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      cancellableUntil: null,
      pointsEarned: null,
    };

    it('returns 400 with BFF_GUEST_TOKEN_MISSING when token query param is missing', async () => {
      const backendHttp = makeBackendHttp();
      const controller = new BookingsGuestController(backendHttp, makeConfigService());

      const err = await controller.getOneGuest(BOOKING_ID, undefined).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: BffErrorCode.GUEST_TOKEN_MISSING,
      });
    });

    it('returns 401 with BFF_GUEST_TOKEN_INVALID when token is invalid', async () => {
      const backendHttp = makeBackendHttp();
      const controller = new BookingsGuestController(backendHttp, makeConfigService());

      const err = await controller
        .getOneGuest(BOOKING_ID, 'invalid.token.here')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(401);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: BffErrorCode.GUEST_TOKEN_INVALID,
      });
    });

    it('returns 400 with BFF_GUEST_TOKEN_BOOKING_MISMATCH when token bookingId does not match route param', async () => {
      const token = makeToken({ bookingId: 'other-booking-id' });
      const backendHttp = makeBackendHttp();
      const controller = new BookingsGuestController(backendHttp, makeConfigService());

      const err = await controller.getOneGuest(BOOKING_ID, token).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(400);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: BffErrorCode.GUEST_TOKEN_BOOKING_MISMATCH,
      });
    });

    it('returns 404 when backend booking lookup fails (cross-tenant or not found)', async () => {
      const token = makeToken();
      const backendHttp = makeBackendHttp({
        getForPublic: jest.fn().mockRejectedValue(new HttpException({ status: 404 }, 404)),
      });
      const controller = new BookingsGuestController(backendHttp, makeConfigService());

      const err = await controller.getOneGuest(BOOKING_ID, token).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });

    it('returns 409 with BFF_GUEST_BOOKING_NOT_AWAITING_INFO when booking status is not INFO_REQUESTED', async () => {
      const token = makeToken();
      const backendHttp = makeBackendHttp({
        getForPublic: jest
          .fn()
          .mockResolvedValue({ ...mockInfoRequestedDetail, status: 'APPROVED' }),
      });
      const controller = new BookingsGuestController(backendHttp, makeConfigService());

      const err = await controller.getOneGuest(BOOKING_ID, token).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: BffErrorCode.GUEST_BOOKING_NOT_AWAITING_INFO,
      });
    });

    it('calls getForPublic with tenantId from token and returns GuestBookingReadResponse', async () => {
      const token = makeToken();
      const backendHttp = makeBackendHttp({
        getForPublic: jest.fn().mockResolvedValue(mockInfoRequestedDetail),
      });
      const controller = new BookingsGuestController(backendHttp, makeConfigService());

      const result = await controller.getOneGuest(BOOKING_ID, token);

      expect(backendHttp.getForPublic).toHaveBeenCalledWith(`/bookings/${BOOKING_ID}`, TENANT_ID);
      expect(result).toEqual({
        bookingId: BOOKING_ID,
        status: 'INFO_REQUESTED',
        serviceSummary: 'Lavagem Simples',
        scheduledAt: '2026-06-18T13:00:00.000Z',
        infoRequestMessage: 'Por favor, envie fotos do veículo antes da lavagem.',
        contactName: 'João da Silva',
      });
    });
  });
});
