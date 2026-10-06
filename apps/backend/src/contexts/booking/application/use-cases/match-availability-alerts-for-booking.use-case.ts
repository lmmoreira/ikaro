import { Inject, Injectable } from '@nestjs/common';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import {
  MatchAvailabilityAlertsUseCase,
  MatchAvailabilityAlertsUseCaseResult,
} from './match-availability-alerts.use-case';

export interface MatchAvailabilityAlertsForBookingUseCaseInput {
  tenantId: string;
  bookingId: string;
  correlationId: string;
}

export type MatchAvailabilityAlertsForBookingUseCaseResult = MatchAvailabilityAlertsUseCaseResult;

// A rejected booking's event carries no time or service, so the rejection handler resolves them
// from the booking itself (a rejected PENDING booking was holding the slot) and re-checks that
// day for the booking's services. A booking that no longer exists frees nothing to look at.
@Injectable()
export class MatchAvailabilityAlertsForBookingUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    private readonly matchAlerts: MatchAvailabilityAlertsUseCase,
  ) {}

  async execute(
    input: MatchAvailabilityAlertsForBookingUseCaseInput,
  ): Promise<MatchAvailabilityAlertsForBookingUseCaseResult> {
    const { tenantId, bookingId, correlationId } = input;
    const booking = await this.bookingRepo.findById(bookingId, tenantId);
    if (!booking) return { notified: 0 };

    return this.matchAlerts.execute({
      tenantId,
      correlationId,
      serviceIds: booking.lines.map((line) => line.serviceId),
      around: booking.scheduledAt,
    });
  }
}
