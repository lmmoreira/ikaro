import { BaseContactNotificationDto } from './base-contact-notification.dto';

interface AddressDto {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface SendBookingRequestedNotificationDto extends BaseContactNotificationDto {
  scheduledAt: string;
  totalPrice: { amount: string; currency: string };
  lines: Array<{ serviceNameAtBooking: string }>;
  pickupAddress: AddressDto | null;
}
