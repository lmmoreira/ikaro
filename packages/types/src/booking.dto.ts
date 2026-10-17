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

// M23-S39/S40 (UC-108) — body of `POST /bookings/staff`. It is the guest booking body minus
// `beforeServicePhotoUrls` (the staff flow collects no photos) plus exactly one way to say who the
// booking is for: a customer of the tenant, or the contact of a person who is not in the system.
export interface StaffBookingBaseRequest extends BookingFlowRequestFields {
  scheduledAt: string; // ISO-8601 datetime
  serviceIds: string[];
  pickupAddress?: Address;
  notes?: string;
}

export interface StaffBookingForCustomerRequest extends StaffBookingBaseRequest {
  customerId: string;
}

export interface StaffBookingForGuestRequest extends StaffBookingBaseRequest {
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  contactAddress?: Address;
}

export type CreateBookingByStaffRequest =
  StaffBookingForCustomerRequest | StaffBookingForGuestRequest;

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
  // M23-S46 — the booking has an open "Reservas a resolver" entry (a view of current data, never
  // stored): the queue card shows the "Precisa de decisão" pill. Staff responses only.
  hasOpenException: boolean;
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

// M23-S27 — one status change of a booking, as the staff booking detail shows it. `actorName` is the
// staff member's name or the booking's contact name (for a CUSTOMER actor); it is null for a GUEST
// or SYSTEM actor and for a staff member who cannot be resolved or has no name, and the UI then
// shows a role label ("Gerente" for MANAGER, "Equipe" for STAFF).
export interface BookingStatusHistoryEntry {
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  reason: string | null;
  actorType: 'STAFF' | 'MANAGER' | 'CUSTOMER' | 'GUEST' | 'SYSTEM';
  actorId: string | null;
  actorName: string | null;
  occurredAt: string;
}

// M23-S47 — the full booking detail. Who picked a resource; null when the service no longer declares
// a requirement for that resource type, so a wrong tag is never shown.
export type BookingResourceOrigin = 'CUSTOMER_CHOICE' | 'SYSTEM_ASSIGNED';

// One resource of a flat booking line. A fungible pool is one entry with `quantity` (units reserved)
// and no `resourceName`: the pool never says which unit was reserved. It comes from the latest
// resource assignment per slot, so a cancelled or rejected booking still has it.
export interface BookingLineResourceEntry {
  lineId: string;
  serviceName: string;
  resourceType: ResourceType;
  resourceName: string | null;
  origin: BookingResourceOrigin | null;
  quantity: number | null;
}

// One leg of a legged booking line, in leg order. The times exist only while the occupancy row does
// (never after a cancel or reject, nor after the 90-day purge): null then.
export interface BookingItineraryLeg {
  lineId: string;
  serviceName: string;
  legIndex: number;
  legName: string | null;
  resourceType: ResourceType;
  resourceName: string;
  startsAt: string | null;
  endsAt: string | null;
}

export interface BookingDetailAttendee {
  name: string;
  isMinor: boolean;
}

// Labelled with the intake schema version the booking was made on, not the active one.
export interface BookingDetailIntakeAnswer {
  fieldKey: string;
  label: string;
  type: 'FREE_TEXT' | 'BOOLEAN';
  value: string | boolean;
}

export interface CustomerBookingDetailIntake {
  schemaVersion: number;
  answers: BookingDetailIntakeAnswer[];
  // Null when staff created the booking and the customer's consent was not collected (UC-108).
  consentAcceptedAt: string | null;
}

export interface StaffBookingDetailIntake extends CustomerBookingDetailIntake {
  consentVersion: number | null;
}

// Who did it, for the staff read only. `name` is the staff member's name, or the booking's contact
// name for a customer; null when unresolvable, and the UI then shows a role label.
export interface BookingActorRef {
  // SYSTEM: the platform cancelled an unanswered manual-approval request (TD51); no name.
  kind: 'CUSTOMER' | 'STAFF' | 'SYSTEM';
  name: string | null;
}

export interface StaffBookingTermination {
  at: string;
  reason: string | null;
  by: BookingActorRef;
}

// The customer sees who only as "you" or "the establishment", never a staff name or id. A customer's
// own cancel stores no reason, so `reason` is non-null only when the establishment cancelled.
export interface CustomerBookingCancellation {
  at: string;
  byCustomer: boolean;
  // The request expired without an answer (TD51): neither the customer nor the establishment
  // cancelled it. Absent from a BFF that predates TD51, which a reader treats as false.
  expired?: boolean;
  reason: string | null;
}

// The reason the business gave when it declined the request (it is also emailed to the customer).
export interface CustomerBookingRejection {
  at: string;
  reason: string | null;
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

  // M23-S27 — every status change of the booking, oldest first (staff-facing only).
  statusHistory: BookingStatusHistoryEntry[];

  // M23-S47 — the full booking detail.
  notes: string | null; // the customer's own notes at request time
  adminNotes: string | null; // internal, staff only
  createdAt: string;
  createdByName: string | null; // set only for a booking staff created on the customer's behalf
  resources: BookingLineResourceEntry[];
  itinerary: BookingItineraryLeg[];
  participantCount: number | null;
  attendees: BookingDetailAttendee[];
  intake: StaffBookingDetailIntake | null;
  recurringScheduleId: string | null;
  cancellation: StaffBookingTermination | null;
  rejection: StaffBookingTermination | null;

  // M23-S46 — the booking has an open "Reservas a resolver" entry (a view of current data, never
  // stored): the detail shows the "Precisa de decisão" banner and, for a manager, the decision panel.
  hasOpenException: boolean;
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
  pickupAddress: Address | null;

  // M23-S47 — the booking's resources, participants, the customer's own answers and, once terminal,
  // the cancel or reject facts. Never internal notes, "Criado por" or an actor's name or id.
  resources: BookingLineResourceEntry[];
  itinerary: BookingItineraryLeg[];
  participantCount: number | null;
  attendees: BookingDetailAttendee[];
  intake: CustomerBookingDetailIntake | null;
  recurringScheduleId: string | null;
  cancellation: CustomerBookingCancellation | null;
  rejection: CustomerBookingRejection | null;

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
