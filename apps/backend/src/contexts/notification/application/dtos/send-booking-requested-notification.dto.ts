interface AddressDto {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface SendBookingRequestedNotificationDto {
  tenantId: string;
  eventId: string;
  correlationId: string;
  guestEmail: string;
  guestName: string;
  scheduledAt: string;
  totalPrice: { amount: string; currency: string };
  lines: Array<{ serviceNameAtBooking: string }>;
  pickupAddress: AddressDto | null;
}
