import type { BookingStatus, BookingType } from './enums';
import type { Money } from './money';
import type { Address } from './address';
import type { ServiceResponse } from './service.dto';

export interface CreateBookingRequest {
  serviceId: string;
  scheduledAt: string; // ISO-8601 datetime
  vehiclePlate: string;
  vehicleModel?: string;
  pickupAddress?: Address;
  notes?: string;
  // For guest bookings
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface BookingLineResponse {
  id: string;
  service: ServiceResponse;
  price: Money;
  loyaltyPointsEarned: number;
}

export interface BookingResponse {
  id: string;
  tenantId: string;
  type: BookingType;
  status: BookingStatus;
  scheduledAt: string;
  vehiclePlate: string;
  vehicleModel?: string;
  pickupAddress?: Address;
  notes?: string;
  infoRequest?: string;
  lines: BookingLineResponse[];
  total: Money;
  beforePhotoUrls: string[];
  afterPhotoUrls: string[];
  createdAt: string;
  updatedAt: string;
  // Guest fields
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface CompleteBookingRequest {
  afterPhotoKeys: string[];
}

export interface RescheduleBookingRequest {
  scheduledAt: string; // ISO-8601 datetime
  reason?: string;
}

export interface RequestMoreInfoRequest {
  message: string;
}

export interface SubmitInfoRequest {
  response: string;
}
