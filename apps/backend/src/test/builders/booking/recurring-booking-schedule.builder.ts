import { RecurringBookingSchedule } from '../../../contexts/booking/domain/recurring-booking-schedule.aggregate';
import { RecurringBookingScheduleStatus } from '../../../contexts/booking/domain/recurring-booking-schedule.types';

// The aggregate through its real transitions (never a hand-set status), so a spec can ask for a
// schedule in any status without bypassing the state machine. A fixed-term schedule with no
// resource assignment (`RESOLVE_PER_OCCURRENCE`), which is all the date/status rules need.
export class RecurringBookingScheduleBuilder {
  private tenantId = 'aaaaaaaa-0020-4000-8000-000000000001';
  private customerId = 'cccccccc-0020-4000-8000-000000000001';
  private serviceId = 'ssssssss-0020-4000-8000-000000000001';
  private startsOn = '2026-09-01';
  private endsOn = '2026-11-24';
  private status: RecurringBookingScheduleStatus = 'ACTIVE';
  private daysOfWeek: ('monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday')[] = [
    'tuesday',
    'thursday',
  ];

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCustomerId(customerId: string): this {
    this.customerId = customerId;
    return this;
  }

  withServiceId(serviceId: string): this {
    this.serviceId = serviceId;
    return this;
  }

  withTerm(startsOn: string, endsOn: string): this {
    this.startsOn = startsOn;
    this.endsOn = endsOn;
    return this;
  }

  withStatus(status: RecurringBookingScheduleStatus): this {
    this.status = status;
    return this;
  }

  build(): RecurringBookingSchedule {
    // CANCELLED is reached the way a real one is here: a pending request that is rejected.
    const requested =
      this.status === 'PENDING_APPROVAL' || this.status === 'CANCELLED'
        ? 'PENDING_APPROVAL'
        : 'ACTIVE';
    const schedule = RecurringBookingSchedule.request({
      tenantId: this.tenantId,
      customerId: this.customerId,
      serviceId: this.serviceId,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: this.daysOfWeek,
        startTime: '10:00',
        durationMinutes: 60,
      },
      startsOn: this.startsOn,
      endsOn: this.endsOn,
      maxTermDays: 365,
      assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
      resourceAssignments: [],
      status: requested,
      approvalHoldExpiresAt: requested === 'PENDING_APPROVAL' ? new Date('2099-01-01') : null,
      createdByStaffId: null,
      correlationId: 'corr-schedule-builder',
    });
    if (this.status === 'ENDED') schedule.markEnded();
    if (this.status === 'CANCELLED') schedule.reject('corr-schedule-builder');
    return schedule;
  }
}
