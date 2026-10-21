import { Provider } from '@nestjs/common';
import { AvailabilityAlertSweepJob } from './application/jobs/availability-alert-sweep.job';
import { AvailabilityQueryService } from './application/services/availability-query.service';
import { AvailabilityAlertMatchingService } from './application/services/availability-alert-matching.service';
import { MatchAvailabilityAlertsForBookingUseCase } from './application/use-cases/match-availability-alerts-for-booking.use-case';
import { MatchAvailabilityAlertsUseCase } from './application/use-cases/match-availability-alerts.use-case';
import { AvailabilityAlertSweepTriggerHandler } from './infrastructure/events/availability-alert-sweep-trigger.handler';
import { BookingCancelledAvailabilityAlertHandler } from './infrastructure/events/booking-cancelled-availability-alert.handler';
import { BookingRejectedAvailabilityAlertHandler } from './infrastructure/events/booking-rejected-availability-alert.handler';
import { BookingRescheduledAvailabilityAlertHandler } from './infrastructure/events/booking-rescheduled-availability-alert.handler';

// M23-S07 — UC-072 step 3. Split out of booking.module-providers.ts, which sits at the file-size
// limit: the matching use cases, the three capacity-release handlers (cancelled, rejected,
// rescheduled) and the daily sweep (job + its cron-reminders trigger handler).
export const availabilityAlertMatchingProviders: Provider[] = [
  AvailabilityQueryService, // shared by GetAvailabilityUseCase and the alert matching
  AvailabilityAlertMatchingService,
  MatchAvailabilityAlertsUseCase,
  MatchAvailabilityAlertsForBookingUseCase,
  AvailabilityAlertSweepJob,
  AvailabilityAlertSweepTriggerHandler,
  BookingCancelledAvailabilityAlertHandler,
  BookingRejectedAvailabilityAlertHandler,
  BookingRescheduledAvailabilityAlertHandler,
];
