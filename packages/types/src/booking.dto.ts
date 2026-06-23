import type { Address } from './address';
import type { MoneyAmount } from './money';
import type { BookingStatus } from './enums';

export interface CreateBookingRequest {
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  contactAddress?: Address;
  pickupAddress?: Address;
  notes?: string;
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

export interface StaffBookingLineResponse {
  lineId: string;
  serviceName: string;
  priceAtBooking: MoneyAmount;
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
}

export interface CustomerBookingLineItem {
  lineId: string;
  serviceName: string;
  durationMinsAtBooking: number;
  priceAtBooking: MoneyAmount;
}

export interface CustomerBookingListItem {
  bookingId: string;
  status: BookingStatus;
  scheduledAt: string; // ISO-8601 — always set; no booking state has a missing slot
  lines: CustomerBookingLineItem[];
  totalPrice: MoneyAmount;
}

export interface CustomerBookingListResponse {
  items: CustomerBookingListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface StaffBookingDetailResponse {
  bookingId: string;
  status: BookingStatus;
  scheduledAt: string;
  type: 'GUEST' | 'CUSTOMER';

  // Contact / customer info
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: Address | null;
  pickupAddress: Address | null;

  // Loyalty (null for guest bookings)
  customerId: string | null;
  loyaltyBalance: number | null; // current active points

  // Lines
  lines: StaffBookingLineResponse[];
  totalPrice: MoneyAmount;
  totalDurationMins: number;

  // Media
  beforeServicePhotoUrls: string[]; // signed read URLs
  afterServicePhotoUrls: string[]; // signed read URLs — populated once COMPLETED

  // Admin-recorded fields
  infoRequestMessage: string | null; // UC-005: what admin asked
  infoResponseMessage: string | null; // UC-005 A2: what customer answered
  approvedAt: string | null;
  approvedBy: string | null; // staffId UUID
  rejectionReason: string | null;
}

export interface CustomerBookingDetailResponse {
  bookingId: string;
  status: BookingStatus;
  scheduledAt: string | null;
  lines: CustomerBookingLineItem[];
  totalPrice: MoneyAmount;
  notes: string | null; // customer's own notes at time of request

  // UC-005 A2 — present when status is INFO_REQUESTED or beyond
  infoRequestMessage: string | null; // what the admin asked
  infoResponseMessage: string | null; // what the customer already answered (if any)

  // Photos — empty array if none
  beforeServicePhotoUrls: string[]; // signed read URLs
  afterServicePhotoUrls: string[]; // populated only when COMPLETED
}
