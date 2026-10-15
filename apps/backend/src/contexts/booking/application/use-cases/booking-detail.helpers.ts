import { Money } from '../../../../shared/value-objects/money';
import { Booking } from '../../domain/booking.aggregate';

type MoneyDetail = { amount: number; currency: string };

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

export interface BookingAddressDetail {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  zipCode: string;
}

export function toAddressDetail(address: Booking['contactAddress']): BookingAddressDetail | null {
  const addr = address?.toJSON() ?? null;
  if (!addr) return null;
  return {
    street: addr.street,
    number: addr.number,
    complement: addr.complement ?? null,
    neighborhood: addr.neighborhood ?? null,
    city: addr.city,
    state: addr.state,
    zipCode: addr.zipCode,
  };
}

export function toMoneyDetail(money: Money | null): MoneyDetail | null {
  if (!money) return null;
  return {
    amount: money.amount.toNumber(),
    currency: money.currency,
  };
}

export function toLineDetail(l: Booking['lines'][number]): BookingLineDetail {
  return {
    lineId: l.lineId,
    serviceId: l.serviceId,
    serviceNameAtBooking: l.serviceNameAtBooking,
    priceAtBooking: {
      amount: l.priceAtBooking.amount.toNumber(),
      currency: l.priceAtBooking.currency,
    },
    durationMinsAtBooking: l.durationMinsAtBooking,
    pointsValueAtBooking: l.pointsValueAtBooking,
    requiresPickupAddressAtBooking: l.requiresPickupAddressAtBooking,
    actualPriceCharged: toMoneyDetail(l.actualPriceCharged),
  };
}
