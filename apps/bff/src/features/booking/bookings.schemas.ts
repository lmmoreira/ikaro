import { z } from 'zod';
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  ApproveBookingRequest,
  GenericErrorCode,
  PhoneErrorCode,
} from '@ikaro/types';
import { AddressShapeSchema, DATE_ONLY_PATTERN, isValidPhoneNumber } from '@ikaro/validation';

// Split out of bookings.controller.ts (TD37-S05, file-length) — request/query Zod schemas and
// their inferred body types, re-exported from bookings.controller.ts so existing imports of
// these symbols (e.g. bookings.controller.spec.ts, address-schema-code-reuse.spec.ts) don't
// need to change.

// Required-field checks are deliberately NOT duplicated here (TD23-S13) — the backend's
// Uploads always target tmp/ staging (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md) — promotion to
// tenants/<id>/bookings/<bookingId>/... happens server-side once the booking is saved.
const TMP_PHOTO_PATH_REGEX = /^tmp\/[^/]+\/[^/]+\/.+$/;

export const RequestBookingBodySchema = z.object({
  contactEmail: z.email(),
  contactName: z.string().min(1),
  contactPhone: z.string().refine((v) => isValidPhoneNumber(v), {
    error: 'contactPhone must be in E.164 format',
    params: { code: PhoneErrorCode.FORMAT_INVALID },
  }),
  contactAddress: AddressShapeSchema.optional(),
  pickupAddress: AddressShapeSchema.optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1),
  beforeServicePhotoUrls: z.array(z.string().regex(TMP_PHOTO_PATH_REGEX)).optional(),
});

export const AuthenticatedBookingBodySchema = z.object({
  scheduledAt: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).min(1),
  pickupAddress: AddressShapeSchema.optional(),
  notes: z.string().trim().min(1).max(1000).optional(),
  beforeServicePhotoUrls: z.array(z.string().regex(TMP_PHOTO_PATH_REGEX)).optional(),
});

export const RejectBookingBodySchema = z.object({
  reason: z.string().trim().min(10),
});

export const CancelAsAdminBodySchema = z
  .object({
    reason: z.string().min(1).optional(),
  })
  .default({});

export const RescheduleBookingBodySchema = z.object({
  scheduledAt: z.iso.datetime(),
  adminNotes: z.string().trim().min(1).max(500).optional(),
});

export const ApproveBookingBodySchema = z
  .object({
    scheduledAt: z.iso.datetime().optional(),
  })
  .default({});

export const CompleteBookingBodySchema = z.object({
  lines: z
    .array(
      z.object({
        lineId: z.uuid(),
        actualPriceCharged: z.number().nonnegative(),
      }),
    )
    .min(1),
  afterServicePhotoUrls: z.array(z.string().regex(TMP_PHOTO_PATH_REGEX)).optional().default([]),
  adminNotes: z.string().trim().min(1).max(500).optional(),
  discountByPoints: z
    .object({
      pointsUsed: z.number().int().positive(),
      amountDeducted: z.number().positive(),
    })
    .optional(),
});

export type CancelAsAdminBody = z.infer<typeof CancelAsAdminBodySchema>;
export type RescheduleBookingBody = z.infer<typeof RescheduleBookingBodySchema>;
export type ApproveBookingBody = ApproveBookingRequest;
export type CompleteBookingBody = z.infer<typeof CompleteBookingBodySchema>;

export const RequestMoreInfoBodySchema = z.object({
  message: z.string().trim().min(20),
});

export const SubmitBookingInfoBodySchema = z.object({
  response: z.string().trim().min(1),
  photoUrls: z.array(z.string().regex(TMP_PHOTO_PATH_REGEX)).optional(),
});

export const SubmitGuestBookingInfoBodySchema = z.object({
  response: z.string().trim().min(1),
  photoUrls: z.array(z.string().regex(TMP_PHOTO_PATH_REGEX)).optional(),
});

// Matches one or more comma-separated BookingStatus values, e.g. "PENDING" or "PENDING,INFO_REQUESTED"
const BOOKING_STATUS_RE =
  /^(PENDING|INFO_REQUESTED|APPROVED|COMPLETED|REJECTED|CANCELLED)(,(PENDING|INFO_REQUESTED|APPROVED|COMPLETED|REJECTED|CANCELLED))*$/;

export const StaffListBookingsQuerySchema = z
  .object({
    status: z.string().regex(BOOKING_STATUS_RE).optional().default('PENDING,INFO_REQUESTED'),
    date: z.string().regex(DATE_ONLY_PATTERN).optional(),
    from: z.string().regex(DATE_ONLY_PATTERN).optional(),
    to: z.string().regex(DATE_ONLY_PATTERN).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((q) => q.to === undefined || q.from !== undefined, {
    path: ['to'],
    error: '`to` requires `from`',
    params: { code: GenericErrorCode.VALUE_INVALID },
  });

export type StaffListBookingsQuery = z.infer<typeof StaffListBookingsQuerySchema>;

export const AttachmentSignedUrlBodySchema = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine((v) => !v.includes('/') && !v.includes('..'), {
      error: 'fileName must not contain path separators or ".."',
      params: { code: GenericErrorCode.FORMAT_INVALID },
    }),
  contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES),
  tenantSlug: z.string().optional(),
  guestToken: z.string().min(1).optional(),
});

export type AttachmentSignedUrlBody = z.infer<typeof AttachmentSignedUrlBodySchema>;

export type RequestBookingBody = z.infer<typeof RequestBookingBodySchema>;
export type AuthenticatedBookingBody = z.infer<typeof AuthenticatedBookingBodySchema>;
export type RejectBookingBody = z.infer<typeof RejectBookingBodySchema>;
export type RequestMoreInfoBody = z.infer<typeof RequestMoreInfoBodySchema>;
export type SubmitBookingInfoBody = z.infer<typeof SubmitBookingInfoBodySchema>;
export type SubmitGuestBookingInfoBody = z.infer<typeof SubmitGuestBookingInfoBodySchema>;
