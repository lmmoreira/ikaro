import { Address } from '../../../shared/value-objects/address';
import { Email } from '../../../shared/value-objects/email.vo';
import { Money } from '../../../shared/value-objects/money';
import { PhoneNumber } from '../../../shared/value-objects/phone-number.vo';
import { BookingLine, BookingLineInput } from './booking-line.entity';

// Split out of booking.aggregate.ts to keep it under the file-length cap — re-exported from
// there via `export * from './booking.types'` so existing imports of these symbols keep working
// unchanged. Pure type/interface/enum definitions, no aggregate behavior moved.

export enum BookingStatus {
  PENDING = 'PENDING',
  INFO_REQUESTED = 'INFO_REQUESTED',
  APPROVED = 'APPROVED',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export type BookingType = 'GUEST' | 'CUSTOMER';

export interface BookingProps {
  id: string;
  tenantId: string;
  status: BookingStatus;
  type: BookingType;
  customerId: string | null;
  contactEmail: Email;
  contactName: string;
  contactPhone: PhoneNumber;
  contactAddress: Address | null;
  pickupAddress: Address | null;
  notes: string | null;
  scheduledAt: Date;
  totalDurationMins: number;
  totalPrice: Money;
  totalActualPrice: Money | null;
  discountPointsUsed: number | null;
  discountAmount: Money | null;
  lines: BookingLine[];
  beforeServicePhotoUrls: string[];
  afterServicePhotoUrls: string[];
  adminNotes: string | null;
  infoRequestMessage: string | null;
  infoRequestedAt: Date | null;
  infoRequestedBy: string | null;
  infoResponseMessage: string | null;
  infoSubmittedAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  completedAt: Date | null;
  completedBy: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  version?: number;
}

export interface RequestBookingInput {
  /**
   * Pre-generated booking ID — pass this when the caller needs to know the ID before the
   * aggregate exists (e.g. to promote `tmp/`-staged photos to their permanent
   * `tenants/<id>/bookings/<bookingId>/...` path before construction; see
   * td/TD22-ORPHANED-UPLOAD-CLEANUP.md). Omit to keep the existing behavior of generating a
   * fresh `uuidv7()` inside the factory.
   */
  id?: string;
  tenantId: string;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  scheduledAt: Date;
  lineInputs: BookingLineInput[];
  type: BookingType;
  correlationId: string;
  customerId?: string;
  contactAddress?: Address;
  pickupAddress?: Address;
  notes?: string;
  beforeServicePhotoUrls?: string[];
}
