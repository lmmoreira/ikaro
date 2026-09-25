import { BookingStatus, BookingType, ResourceType } from '@ikaro/types';

// One leg's resolved schedule/resource entry on a legged-service booking line (UC-065) — mirrors
// the backend's identical BookingLineItineraryLeg shape (M23-S01).
export interface BookingLineItineraryLegResponse {
  legIndex: number;
  resourceName: string;
  startsAt: string;
  endsAt: string;
}

export interface BookingLineResponse {
  lineId: string;
  serviceId: string;
  priceAtBooking: { amount: number; currency: string };
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
  // Set only for a flat AUTO_ANY requirement (UC-063) — never for AUTO_FUNGIBLE_POOL or
  // CUSTOMER_CHOICE (M23-S01).
  assignedResourceName?: string;
  // Set only for a legged service (UC-065); mutually exclusive with assignedResourceName above.
  itinerary?: BookingLineItineraryLegResponse[];
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
  status: BookingStatus;
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

export interface BookingResourceAssignment {
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
}

export interface BookingListItem {
  id: string;
  status: BookingStatus;
  type: BookingType;
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
  // Which physical resource(s), if any, this booking's line(s) resolved to — display-only,
  // always present regardless of any client-side filter state (TD44-S2 round 3).
  assignedResources: BookingResourceAssignment[];
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
  status: BookingStatus;
  type: BookingType;
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
  beforeServicePhotoPaths: string[];
  afterServicePhotoPaths: string[];
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
