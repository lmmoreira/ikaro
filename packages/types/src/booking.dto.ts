import type { Address } from './address';
import type { MoneyAmount } from './money';
import type { BookingStatus, ResourceType } from './enums';
export { ALLOWED_IMAGE_CONTENT_TYPES } from './media';
export type { ImageContentType } from './media';

// One customer-chosen resource for one CUSTOMER_CHOICE requirement. legIndex is omitted/null for a
// flat (non-legged) requirement; resourceType disambiguates within a bundle.
export interface ResourceSelectionItem {
  serviceId: string;
  legIndex?: number | null;
  resourceType: ResourceType;
  resourceId: string;
}

export interface BookingAttendeeInput {
  name: string;
  isMinor?: boolean;
}

// Keys are ServiceIntakeQuestion.fieldKey; FREE_TEXT answers are strings, BOOLEAN answers booleans.
export type BookingIntakeAnswers = Record<string, string | boolean>;

// Request fields shared by the guest and authenticated booking requests (M23): resource picks, the
// chosen duration, capacity, and the intake form submission.
export interface BookingFlowRequestFields {
  resourceSelections?: ResourceSelectionItem[];
  durationMinutes?: number;
  participantCount?: number;
  intakeSchemaVersion?: number;
  intakeAnswers?: BookingIntakeAnswers;
  consentAccepted?: boolean;
  attendees?: BookingAttendeeInput[];
}

export interface CreateBookingRequest extends BookingFlowRequestFields {
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

export interface AuthenticatedBookingRequest extends BookingFlowRequestFields {
  scheduledAt: string; // ISO-8601 datetime
  serviceIds: string[];
  pickupAddress?: Address;
  notes?: string;
  beforeServicePhotoUrls?: string[];
}

// One leg's resolved schedule/resource entry on a legged-service booking line.
export interface BookingLineItineraryLegResponse {
  legIndex: number;
  resourceName: string;
  startsAt: string;
  endsAt: string;
}

export interface BookingLineResponse {
  lineId: string;
  serviceId: string;
  priceAtBooking: MoneyAmount;
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
  // Set only for a flat AUTO_ANY requirement — never for AUTO_FUNGIBLE_POOL or CUSTOMER_CHOICE.
  assignedResourceName?: string;
  // Set only for a legged service; mutually exclusive with assignedResourceName.
  itinerary?: BookingLineItineraryLegResponse[];
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

export interface ApproveBookingRequest {
  scheduledAt?: string;
}

export interface ApproveBookingResponse {
  bookingId: string;
  status: 'APPROVED';
  approvedAt: string;
}

export interface RejectBookingRequest {
  reason: string;
}

export interface RequestMoreInfoRequest {
  message: string;
}

export interface SlotConflictSuggestion {
  startsAt: string;
  endsAt: string;
}

export interface SlotConflictError {
  error: 'slot-conflict';
  suggestions: SlotConflictSuggestion[];
}

export interface AttachmentSignedUrlResponse {
  signedUrl: string;
  filePath: string;
  expiresAt: string;
}

export interface StaffBookingCardResourceAssignment {
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
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
  // Which physical resource(s), if any, this booking's line(s) resolved to — display-only,
  // always present regardless of any client-side filter state (TD44-S2 round 3).
  assignedResources: StaffBookingCardResourceAssignment[];
}

export interface StaffBookingListResponse {
  items: StaffBookingCardResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface StaffBookingLineResponse {
  lineId: string;
  serviceId: string;
  serviceName: string;
  priceAtBooking: MoneyAmount;
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
  actualPriceCharged: MoneyAmount | null;
}

export interface CustomerBookingLineItem {
  lineId: string;
  serviceName: string;
  durationMinsAtBooking: number;
  priceAtBooking: MoneyAmount;
  // Populated once the booking is COMPLETED; null otherwise (quoted price never charged).
  actualPriceCharged: MoneyAmount | null;
}

export interface CustomerBookingListItem {
  bookingId: string;
  status: BookingStatus;
  scheduledAt: string; // ISO-8601 — always set; no booking state has a missing slot
  lines: CustomerBookingLineItem[];
  totalPrice: MoneyAmount;
  // Self-cancellation deadline (UC-007): scheduledAt minus the tenant's cancellation window,
  // computed server-side. Non-null only for APPROVED bookings.
  cancellableUntil: string | null;
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
  totalActualPrice: MoneyAmount | null; // populated once COMPLETED
  discountPointsUsed: number | null; // loyalty redemption applied at completion
  discountAmount: MoneyAmount | null;
  totalDurationMins: number;

  // Media
  beforeServicePhotoUrls: string[]; // signed read URLs
  afterServicePhotoUrls: string[]; // signed read URLs — populated once COMPLETED
  // Raw "tenants/<id>/bookings/<id>/..." storage paths for the same photos, in the same order —
  // needed by POST /tenants/hotsite/gallery/feature-booking-photo, which validates against the
  // raw path, not the signed URL.
  beforeServicePhotoPaths: string[];
  afterServicePhotoPaths: string[]; // populated once COMPLETED

  // Admin-recorded fields
  infoRequestMessage: string | null; // UC-005: what admin asked
  infoResponseMessage: string | null; // UC-005 A2: what customer answered
  approvedAt: string | null;
  approvedBy: string | null; // staffId UUID
  completedAt: string | null;
  rejectionReason: string | null;
}

export interface BookingRescheduleKeptPick {
  serviceName: string;
  legName: string | null;
  legIndex: number | null;
  resourceType: ResourceType;
  resourceName: string;
}

// UC-069 — the whole input of the customer reschedule screen, resolved server-side with the same
// helpers the reschedule write path replays.
export interface BookingRescheduleOptions {
  eligibleUntil: string;
  serviceIds: string[];
  resourceSelections: ResourceSelectionItem[];
  durationMinutes: number | null;
  window: { minAdvanceHours: number; maxAdvanceDays: number };
  keptPicks: BookingRescheduleKeptPick[];
}

export interface CustomerBookingDetailResponse {
  bookingId: string;
  status: BookingStatus;
  scheduledAt: string | null;
  lines: CustomerBookingLineItem[];
  totalPrice: MoneyAmount;
  notes: string | null; // customer's own notes at time of request

  // Self-cancellation deadline (UC-007), same semantics as CustomerBookingListItem.
  cancellableUntil: string | null;

  // UC-069 — non-null only for an APPROVED booking.
  reschedule: BookingRescheduleOptions | null;

  // UC-005 A2 — present when status is INFO_REQUESTED or beyond
  infoRequestMessage: string | null; // what the admin asked
  infoResponseMessage: string | null; // what the customer already answered (if any)

  // Photos — empty array if none
  beforeServicePhotoUrls: string[]; // signed read URLs
  afterServicePhotoUrls: string[]; // populated only when COMPLETED

  // Completion summary — populated only when status is COMPLETED
  completedAt: string | null;
  totalActualPrice: MoneyAmount | null; // "Valor cobrado"
  discountPointsUsed: number | null; // loyalty redemption applied at completion
  discountAmount: MoneyAmount | null;
  pointsEarned: number | null; // sum of lines' pointsValueAtBooking
}

// UC-005 A2 — guest reads booking summary before submitting info (M13-S39). Only reachable
// while status is INFO_REQUESTED — the BFF returns 409 otherwise.
export interface GuestBookingReadResponse {
  bookingId: string;
  status: 'INFO_REQUESTED';
  serviceSummary: string; // joined service names, e.g. "Lavagem Simples, Cera"
  scheduledAt: string;
  infoRequestMessage: string;
  contactName: string;
}
