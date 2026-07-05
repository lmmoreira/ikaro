export interface BookingLineResponse {
  lineId: string;
  serviceId: string;
  priceAtBooking: { amount: number; currency: string };
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
}

export interface AddressResponse {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  zipCode: string;
}

export interface BookingResponse {
  bookingId: string;
  status: string;
  scheduledAt: string;
  totalPrice: { amount: number; currency: string };
  totalDurationMins: number;
  pickupAddress: AddressResponse | null;
  beforeServicePhotoUrls: string[];
  lines: BookingLineResponse[];
}

export interface BookingLineSummary {
  lineId: string;
  serviceId: string;
  serviceNameAtBooking: string;
  durationMinsAtBooking: number;
  priceAtBooking: { amount: number; currency: string };
}

export interface BookingListItem {
  id: string;
  status: string;
  type: string;
  customerId: string | null;
  contactName: string;
  contactEmail: string;
  scheduledAt: string;
  totalDurationMins: number;
  totalPrice: { amount: number; currency: string };
  lineSummary: BookingLineSummary[];
  createdAt: string;
  // Customer self-cancellation deadline (UC-007) — non-null only for APPROVED bookings.
  cancellableUntil: string | null;
}

export interface BookingListResponse {
  items: BookingListItem[];
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
}

export interface BookingLineDetail {
  lineId: string;
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: { amount: number; currency: string };
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
  actualPriceCharged: { amount: number; currency: string } | null;
}

export interface CancelBookingResponse {
  bookingId: string;
  status: string;
}

export interface RescheduleBookingResponse {
  bookingId: string;
  status: string;
  scheduledAt: string;
}

export interface CompleteBookingResponse {
  bookingId: string;
  status: string;
  completedAt: string;
  totalActualPrice: { amount: number; currency: string };
}

export interface AttachmentSignedUrlResponse {
  signedUrl: string;
  filePath: string;
  expiresAt: string;
}

export interface BookingDetailResponse {
  id: string;
  status: string;
  type: string;
  customerId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: AddressResponse | null;
  notes: string | null;
  scheduledAt: string;
  totalDurationMins: number;
  totalPrice: { amount: number; currency: string };
  totalActualPrice: { amount: number; currency: string } | null;
  discountPointsUsed: number | null;
  discountAmount: { amount: number; currency: string } | null;
  pickupAddress: AddressResponse | null;
  lines: BookingLineDetail[];
  beforeServicePhotoUrls: string[];
  afterServicePhotoUrls: string[];
  adminNotes: string | null;
  infoRequestMessage: string | null;
  infoResponseMessage: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  completedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  cancellableUntil: string | null;
  pointsEarned: number | null;
}
