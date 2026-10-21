import { Injectable } from '@nestjs/common';
import {
  AvailabilityAlertMatchingInput,
  AvailabilityAlertMatchingResult,
  AvailabilityAlertMatchingService,
} from '../services/availability-alert-matching.service';

export type MatchAvailabilityAlertsUseCaseInput = AvailabilityAlertMatchingInput;
export type MatchAvailabilityAlertsUseCaseResult = AvailabilityAlertMatchingResult;

// The matching itself lives in AvailabilityAlertMatchingService so that
// MatchAvailabilityAlertsForBookingUseCase can reuse it without one use case calling another.
// The booking-event handlers and the daily sweep job call this use case.
@Injectable()
export class MatchAvailabilityAlertsUseCase {
  constructor(private readonly matching: AvailabilityAlertMatchingService) {}

  execute(
    input: MatchAvailabilityAlertsUseCaseInput,
  ): Promise<MatchAvailabilityAlertsUseCaseResult> {
    return this.matching.match(input);
  }
}
