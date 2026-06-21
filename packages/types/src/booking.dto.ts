import type { Address } from './address';
import type { MoneyAmount } from './money';
import type { BookingStatus } from './enums';

export interface CreateBookingRequest {
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  contactAddress?: Address;
  pickupAddress?: Address;
  scheduledAt: string; // ISO-8601 datetime
  serviceIds: string[];
  beforeServicePhotoUrls?: string[];
}

export interface BookingLineResponse {
  lineId: string;
  serviceId: string;
  priceAtBooking: MoneyAmount;
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
}

export interface BookingResponse {
  bookingId: string;
  status: string;
  scheduledAt: string;
  totalPrice: MoneyAmount;
  totalDurationMins: number;
  pickupAddress: Address | null;
  beforeServicePhotoUrls: string[];
  lines: BookingLineResponse[];
}

export interface AttachmentSignedUrlRequest {
  fileName: string;
  contentType: 'image/jpeg' | 'image/png';
  tenantSlug: string;
}

export interface AttachmentSignedUrlResponse {
  signedUrl: string;
  filePath: string;
  expiresAt: string;
}

export interface StaffBookingCardResponse {
  bookingId: string;
  status: BookingStatus;
  scheduledAt: string; // ISO-8601
  contactName: string;
  serviceNames: string[];
  totalPrice: MoneyAmount;
  totalDurationMins: number;
  isCustomer: boolean; // true = authenticated customer booking; false = guest
}

export interface StaffBookingListResponse {
  items: StaffBookingCardResponse[];
  total: number;
  page: number;
  limit: number;
}
