import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { BffErrorCode } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { AttachmentSignedUrlBodySchema } from './bookings.schemas';
import { BookingAttachmentsController } from './bookings-attachments.controller';
import { AttachmentSignedUrlResponse } from './bookings.types';

const JWT_SECRET = 'test-secret-64-chars-for-bff-spec-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const makeConfigService = (secret = JWT_SECRET) =>
  ({ getOrThrow: () => secret }) as unknown as ConfigService;

const TENANT_SLUG = 'lavacar-bh';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const BOOKING_ID = '40000000-0000-4000-8000-000000000001';

describe('BookingAttachmentsController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('generateAttachmentSignedUrl()', () => {
    const mockSignedUrlResponse: AttachmentSignedUrlResponse = {
      signedUrl: 'http://localhost:4443/bucket/path?X-Goog-Signature=abc',
      filePath: `tenants/${TENANT_ID}/uploads/uuid/car.jpg`,
      expiresAt: '2026-06-15T10:15:00.000Z',
    };

    it('rejects an empty guestToken at the request-validation boundary', () => {
      expect(
        AttachmentSignedUrlBodySchema.safeParse({
          fileName: 'info.jpg',
          contentType: 'image/jpeg',
          guestToken: '',
        }).success,
      ).toBe(false);
    });

    it('scenario 1 — valid CUSTOMER JWT: calls postForPublic with tenantId', async () => {
      const backendHttp = makeBackendHttp({
        postForPublic: jest.fn().mockResolvedValue(mockSignedUrlResponse),
      });
      const token = jwt.sign(
        { sub: 'cust-id', tenantId: TENANT_ID, tenantSlug: TENANT_SLUG, role: 'CUSTOMER' },
        JWT_SECRET,
      );
      const controller = new BookingAttachmentsController(backendHttp, makeConfigService());

      const result = await controller.generateAttachmentSignedUrl(`Bearer ${token}`, {
        fileName: 'car.jpg',
        contentType: 'image/jpeg',
      });

      expect(backendHttp.postForPublic).toHaveBeenCalledWith(
        '/bookings/attachments/signed-url',
        { fileName: 'car.jpg', contentType: 'image/jpeg' },
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
      const controller = new BookingAttachmentsController(backendHttp, makeConfigService());

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
      const controller = new BookingAttachmentsController(backendHttp, makeConfigService());

      const result = await controller.generateAttachmentSignedUrl(undefined, {
        fileName: 'info.jpg',
        contentType: 'image/jpeg',
        guestToken,
      });

      expect(backendHttp.postForPublic).toHaveBeenCalledWith(
        '/bookings/attachments/signed-url',
        { fileName: 'info.jpg', contentType: 'image/jpeg' },
        TENANT_ID,
      );
      expect(result).toBe(mockSignedUrlResponse);
    });

    it('scenario 3 — invalid guestToken: returns 401 with BFF_GUEST_TOKEN_INVALID', async () => {
      const backendHttp = makeBackendHttp({});
      const controller = new BookingAttachmentsController(backendHttp, makeConfigService());

      const err = await controller
        .generateAttachmentSignedUrl(undefined, {
          fileName: 'info.jpg',
          contentType: 'image/jpeg',
          guestToken: 'not-a-valid-jwt',
        })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect((err as HttpException).getResponse()).toMatchObject({
        code: BffErrorCode.GUEST_TOKEN_INVALID,
      });
    });

    it('scenario 2 — no JWT, no tenantSlug, no guestToken: returns 400', async () => {
      const backendHttp = makeBackendHttp({});
      const controller = new BookingAttachmentsController(backendHttp, makeConfigService());

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
      const controller = new BookingAttachmentsController(backendHttp, makeConfigService());
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
      const controller = new BookingAttachmentsController(backendHttp, makeConfigService());

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
