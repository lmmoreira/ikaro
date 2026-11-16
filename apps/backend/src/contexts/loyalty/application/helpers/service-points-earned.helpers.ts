import { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';
import { ServicePointsEarned } from '../../domain/events/service-points-earned.event';

export interface ServicePointsEarnedSource {
  tenantId: string;
  correlationId: string;
  bookingId: string;
}

export function buildServicePointsEarnedEvent(
  source: ServicePointsEarnedSource,
  customerId: string,
  totalPointsEarned: number,
  entries: LoyaltyEntry[],
  currentBalance: number,
): ServicePointsEarned {
  return new ServicePointsEarned(source.tenantId, source.correlationId, {
    customerId,
    bookingId: source.bookingId,
    totalPointsEarned,
    earnedAt: entries[0].earnedAt.toISOString(),
    lines: entries.map((e) => ({
      entryId: e.id,
      serviceId: e.serviceId,
      pointsEarned: e.points,
      expiresAt: e.expiresAt.toISOString(),
    })),
    currentBalance,
  });
}
