import { Injectable } from '@nestjs/common';
import { Money } from '../../../../shared/value-objects/money';
import { BookingDurationOutOfRangeError } from '../../domain/errors/booking-domain.error';
import { Service } from '../../domain/service.aggregate';

export interface DurationQuoteResult {
  durationMinutes: number;
  priceAtBooking: Money;
}

// UC-067 — validates a customer-selected duration against the service's own min/max/increment
// rules and computes its price. A FIXED-duration service (the pre-M23 default) passes through
// unchanged, matching UC-067's own non-regression AC. Stateless/pure — no repository, no I/O.
@Injectable()
export class BookingQuoteService {
  quote(service: Service, requestedDurationMinutes: number | undefined): DurationQuoteResult {
    if (service.bookingPolicy.durationPolicy !== 'CUSTOMER_SELECTED') {
      return { durationMinutes: service.durationMinutes, priceAtBooking: service.price };
    }

    const durationMinutes = this.validateDuration(service, requestedDurationMinutes);
    return { durationMinutes, priceAtBooking: this.computePrice(service, durationMinutes) };
  }

  // No fallback to Service.durationMinutes when durationMinutes is omitted — locked at M23-S02
  // story-discovery, since that field isn't authoritative once durationPolicy=CUSTOMER_SELECTED
  // (docs/02-DOMAIN_MODEL.md).
  private validateDuration(service: Service, requestedDurationMinutes: number | undefined): number {
    const { durationMinMinutes, durationMaxMinutes, durationIncrementMinutes } =
      service.bookingPolicy;
    const min = durationMinMinutes!;
    const max = durationMaxMinutes!;
    const increment = durationIncrementMinutes!;

    const isWithinAllowedRange =
      requestedDurationMinutes !== undefined &&
      requestedDurationMinutes >= min &&
      requestedDurationMinutes <= max &&
      (requestedDurationMinutes - min) % increment === 0;

    if (!isWithinAllowedRange) {
      throw new BookingDurationOutOfRangeError(
        `durationMinutes must be between ${min} and ${max} minutes, in increments of ${increment}`,
      );
    }
    return requestedDurationMinutes;
  }

  // Per-increment billing, rounded up to the nearest whole pricing increment (pricingIncrementMinutes
  // is deliberately independent of durationIncrementMinutes — docs/02-DOMAIN_MODEL.md), then
  // floored at minimumChargeAmount when set (docs/02-DOMAIN_MODEL.md: "optional floor applied
  // after the per-increment calculation").
  private computePrice(service: Service, durationMinutes: number): Money {
    const { pricingPolicy, pricingIncrementMinutes, pricePerIncrementAmount, minimumChargeAmount } =
      service.bookingPolicy;
    if (pricingPolicy !== 'PER_TIME_INCREMENT') return service.price;

    const perIncrement = Money.from(pricePerIncrementAmount!, service.price.currency);
    const incrementsBilled = Math.ceil(durationMinutes / pricingIncrementMinutes!);
    const computed = Money.from(
      perIncrement.amount.times(incrementsBilled),
      service.price.currency,
    );

    if (minimumChargeAmount == null) return computed;
    const floor = Money.from(minimumChargeAmount, service.price.currency);
    return computed.isGreaterThan(floor) ? computed : floor;
  }
}
