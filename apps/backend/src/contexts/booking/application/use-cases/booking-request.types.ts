// One leg's resolved schedule/resource entry on a legged-service booking line (UC-065) — always
// revealed regardless of the leg's own requirement selectionMode, since it's schedule
// disclosure, not identity disclosure (M23-S01).
export interface BookingLineItineraryLeg {
  legIndex: number;
  resourceName: string;
  startsAt: string;
  endsAt: string;
}

export interface BookingLineResult {
  lineId: string;
  serviceId: string;
  priceAtBooking: { amount: number; currency: string };
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
  // Set only when this line resolved a flat AUTO_ANY requirement (UC-063) — never set for
  // AUTO_FUNGIBLE_POOL (UC-062, identity must stay hidden) or CUSTOMER_CHOICE (the customer
  // already knows their own choice). Joined with ", " in the rare case of more than one AUTO_ANY
  // requirement on the same line (M23-S01).
  assignedResourceName?: string;
  // Set only when this line resolved a legged service (UC-065); mutually exclusive with
  // assignedResourceName above.
  itinerary?: BookingLineItineraryLeg[];
}

export interface AddressResult {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  zipCode: string;
}

export interface BookingRequestResult {
  bookingId: string;
  status: string;
  scheduledAt: string;
  totalPrice: { amount: number; currency: string };
  totalDurationMins: number;
  pickupAddress: AddressResult | null;
  beforeServicePhotoUrls: string[];
  lines: BookingLineResult[];
}
