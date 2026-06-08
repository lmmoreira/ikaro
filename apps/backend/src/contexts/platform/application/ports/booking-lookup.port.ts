export const BOOKING_LOOKUP_PORT = Symbol('IBookingLookupPort');

export interface BookingLookupSummary {
  id: string;
  customerId: string | null;
  beforeServicePhotoUrls: string[];
  afterServicePhotoUrls: string[];
}

export interface IBookingLookupPort {
  findById(bookingId: string, tenantId: string): Promise<BookingLookupSummary | null>;
}
