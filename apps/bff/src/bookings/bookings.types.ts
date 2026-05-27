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
  neighborhood: string;
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
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: { amount: number; currency: string; formatted: string };
}

export interface BookingListItem {
  id: string;
  status: string;
  type: string;
  customerId: string | null;
  guestName: string;
  guestEmail: string;
  scheduledAt: string;
  totalDurationMins: number;
  totalPrice: { amount: number; currency: string; formatted: string };
  lineSummary: BookingLineSummary[];
  createdAt: string;
}

export interface BookingListResponse {
  items: BookingListItem[];
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
}

export interface BookingLineDetail {
  lineId: string;
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: { amount: number; currency: string; formatted: string };
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
  actualPriceCharged: { amount: number; currency: string; formatted: string } | null;
}

export interface BookingDetailResponse {
  id: string;
  status: string;
  type: string;
  customerId: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  scheduledAt: string;
  totalDurationMins: number;
  totalPrice: { amount: number; currency: string; formatted: string };
  totalActualPrice: { amount: number; currency: string; formatted: string } | null;
  pickupAddress: AddressResponse | null;
  lines: BookingLineDetail[];
  beforeServicePhotoUrls: string[];
  afterServicePhotoUrls: string[];
  adminNotes: string | null;
  infoRequestMessage: string | null;
  infoResponseMessage: string | null;
  createdAt: string;
}
