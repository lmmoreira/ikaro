import { RecurringBookingScheduleForbiddenError } from '../../domain/errors/recurring-booking-schedule.error';
import {
  RecurringBookingSchedule,
  RecurringBookingScheduleActorType,
} from '../../domain/recurring-booking-schedule.aggregate';

// A CUSTOMER actor may only mutate their own schedule — mirrors cancel-booking-as-customer.use-case.ts's
// `booking.customerId !== customerId` precedent. A STAFF actor (which already collapses MANAGER at
// the controller boundary — see RequestContext.actorType) may mutate any schedule in the tenant.
export function assertScheduleOwnership(
  schedule: RecurringBookingSchedule,
  actorType: RecurringBookingScheduleActorType,
  actorId: string,
): void {
  if (actorType === 'CUSTOMER' && schedule.customerId !== actorId) {
    throw new RecurringBookingScheduleForbiddenError();
  }
}
