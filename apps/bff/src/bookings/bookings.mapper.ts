import {
  CustomerBookingListItem,
  StaffBookingCardResponse,
  StaffBookingDetailResponse,
} from '@ikaro/types';
import { BookingDetailResponse, BookingListItem } from './bookings.types';

export function toCustomerBookingListItem(item: BookingListItem): CustomerBookingListItem {
  return {
    bookingId: item.id,
    status: item.status as CustomerBookingListItem['status'],
    scheduledAt: item.scheduledAt,
    lines: item.lineSummary.map((l) => ({
      lineId: l.lineId,
      serviceName: l.serviceNameAtBooking,
      durationMinsAtBooking: l.durationMinsAtBooking,
      priceAtBooking: { amount: l.priceAtBooking.amount, currency: l.priceAtBooking.currency },
    })),
    totalPrice: { amount: item.totalPrice.amount, currency: item.totalPrice.currency },
  };
}

export function toStaffBookingCard(item: BookingListItem): StaffBookingCardResponse {
  return {
    bookingId: item.id,
    status: item.status as StaffBookingCardResponse['status'],
    scheduledAt: item.scheduledAt,
    contactName: item.contactName,
    serviceNames: item.lineSummary.map((l) => l.serviceNameAtBooking),
    totalPrice: { amount: item.totalPrice.amount, currency: item.totalPrice.currency },
    totalDurationMins: item.totalDurationMins,
    isCustomer: item.customerId !== null,
  };
}

export function toStaffBookingDetail(
  detail: BookingDetailResponse,
  loyaltyBalance: number | null,
): StaffBookingDetailResponse {
  return {
    bookingId: detail.id,
    status: detail.status as StaffBookingDetailResponse['status'],
    scheduledAt: detail.scheduledAt,
    type: detail.type as StaffBookingDetailResponse['type'],
    contactName: detail.contactName,
    contactEmail: detail.contactEmail,
    contactPhone: detail.contactPhone,
    contactAddress: detail.contactAddress,
    pickupAddress: detail.pickupAddress,
    customerId: detail.customerId,
    loyaltyBalance,
    lines: detail.lines.map((l) => ({
      lineId: l.lineId,
      serviceName: l.serviceNameAtBooking,
      priceAtBooking: { amount: l.priceAtBooking.amount, currency: l.priceAtBooking.currency },
      durationMinsAtBooking: l.durationMinsAtBooking,
      pointsValueAtBooking: l.pointsValueAtBooking,
      requiresPickupAddressAtBooking: l.requiresPickupAddressAtBooking,
    })),
    totalPrice: { amount: detail.totalPrice.amount, currency: detail.totalPrice.currency },
    totalDurationMins: detail.totalDurationMins,
    beforeServicePhotoUrls: detail.beforeServicePhotoUrls,
    afterServicePhotoUrls: detail.afterServicePhotoUrls,
    infoRequestMessage: detail.infoRequestMessage,
    infoResponseMessage: detail.infoResponseMessage,
    approvedAt: detail.approvedAt,
    approvedBy: detail.approvedBy,
    rejectionReason: detail.rejectionReason,
  };
}
