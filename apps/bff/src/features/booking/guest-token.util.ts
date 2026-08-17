import * as jwt from 'jsonwebtoken';
import { z } from 'zod';
import { HttpStatus } from '@nestjs/common';
import { BffErrorCode } from '@ikaro/types';
import { throwProblemDetail } from '../../shared/http/problem-detail';

export const GuestTokenPayloadSchema = z.object({
  bookingId: z.string(),
  tenantId: z.string(),
  tenantSlug: z.string().optional(),
  contactEmail: z.email(),
});

export type GuestTokenPayload = z.infer<typeof GuestTokenPayloadSchema>;

/**
 * Verifies a guest JWT and returns its typed payload, or false on any failure
 * (invalid signature, expired, missing required fields).
 */
export function verifyGuestToken(token: string, secret: string): GuestTokenPayload | false {
  let raw: unknown;
  try {
    raw = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    return false;
  }
  const parsed = GuestTokenPayloadSchema.safeParse(raw);
  return parsed.success ? parsed.data : false;
}

// Split out of bookings.controller.ts (TD37-S05, file-length) — shared by getOneGuest/
// submitInfoGuest, colocated with verifyGuestToken since it's this function's own caller-facing
// wrapper.
export function verifyGuestTokenOrThrow(
  id: string,
  token: string | undefined,
  secret: string,
): GuestTokenPayload {
  if (!token) {
    throw throwProblemDetail(
      HttpStatus.BAD_REQUEST,
      BffErrorCode.GUEST_TOKEN_MISSING,
      'token query parameter is required',
    );
  }

  const payload = verifyGuestToken(token, secret);
  if (!payload) {
    throw throwProblemDetail(
      HttpStatus.UNAUTHORIZED,
      BffErrorCode.GUEST_TOKEN_INVALID,
      'Invalid or expired guest token',
    );
  }

  if (payload.bookingId !== id) {
    throw throwProblemDetail(
      HttpStatus.BAD_REQUEST,
      BffErrorCode.GUEST_TOKEN_BOOKING_MISMATCH,
      'Token bookingId does not match route',
    );
  }

  return payload;
}
