import { DomainEvent } from '../../../../shared/domain/domain-event';

interface RecurringBookingSchedulePausedData extends Record<string, unknown> {
  recurringScheduleId: string;
  customerId: string;
  serviceId: string;
}

// docs/03-DOMAIN_EVENTS.md § RecurringBookingSchedulePaused (UC-070 A2) — no consumers in MVP;
// still needs a real subscriber before it ships (docs/ANTI_PATTERNS.md § A domain event is
// drained) — see recurring-booking-schedule-events.handler.ts.
export class RecurringBookingSchedulePaused extends DomainEvent<RecurringBookingSchedulePausedData> {
  readonly eventVersion = 1;
  readonly data: RecurringBookingSchedulePausedData;

  constructor(tenantId: string, correlationId: string, data: RecurringBookingSchedulePausedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
