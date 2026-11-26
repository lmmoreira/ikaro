import type {
  BookingFeatureRemovalImpact,
  IBillingBookingPort,
} from '../../contexts/billing/application/ports/billing-booking.port';

/** In-memory double of Billing's Booking read; a spec seeds the impact it wants a tenant to have. */
export class InMemoryBillingBookingPort implements IBillingBookingPort {
  readonly calls: Array<{ tenantId: string; effectiveDate: string }> = [];
  private readonly impactByTenant = new Map<string, BookingFeatureRemovalImpact>();

  seedImpact(tenantId: string, impact: Omit<BookingFeatureRemovalImpact, 'effectiveFrom'>): void {
    this.impactByTenant.set(tenantId, { effectiveFrom: '', ...impact });
  }

  getBookingFeatureRemovalImpact(
    tenantId: string,
    effectiveDate: string,
  ): Promise<BookingFeatureRemovalImpact> {
    this.calls.push({ tenantId, effectiveDate });
    const seeded = this.impactByTenant.get(tenantId);
    return Promise.resolve({
      bookings: 0,
      recurringSchedules: 0,
      blockers: [],
      ...seeded,
      effectiveFrom: effectiveDate,
    });
  }

  clear(): void {
    this.calls.length = 0;
    this.impactByTenant.clear();
  }
}
