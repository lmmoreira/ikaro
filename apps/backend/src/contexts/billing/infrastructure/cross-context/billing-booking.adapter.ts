import { Injectable } from '@nestjs/common';
import { GetBookingFeatureRemovalImpactUseCase } from '../../../booking/application/use-cases/get-booking-feature-removal-impact.use-case';
import type {
  BookingFeatureRemovalImpact,
  IBillingBookingPort,
} from '../../application/ports/billing-booking.port';

/**
 * Billing's one read of Booking (a permitted edge): the BOOKING-removal guard (M26-S18a). It maps
 * Booking's result onto Billing's own types, so no Booking type reaches Billing's application layer.
 */
@Injectable()
export class BillingBookingAdapter implements IBillingBookingPort {
  constructor(private readonly getImpact: GetBookingFeatureRemovalImpactUseCase) {}

  async getBookingFeatureRemovalImpact(
    tenantId: string,
    effectiveDate: string,
  ): Promise<BookingFeatureRemovalImpact> {
    const impact = await this.getImpact.execute({ tenantId, effectiveDate });
    return {
      effectiveFrom: impact.effectiveFrom,
      bookings: impact.bookings,
      recurringSchedules: impact.recurringSchedules,
      blockers: impact.blockers.map((blocker) => ({
        category: blocker.category,
        id: blocker.id,
        date: blocker.date,
      })),
    };
  }
}
