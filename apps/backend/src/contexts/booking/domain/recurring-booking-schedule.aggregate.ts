import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import {
  RecurringBookingScheduleNotActiveError,
  RecurringBookingScheduleNotPendingApprovalError,
} from './errors/recurring-booking-schedule.error';
import { RecurringBookingScheduleCreated } from './events/recurring-booking-schedule-created.event';
import { RecurringBookingScheduleEnded } from './events/recurring-booking-schedule-ended.event';
import { RecurringBookingScheduleRejected } from './events/recurring-booking-schedule-rejected.event';
import { assertValidTerm, RecurrenceRule } from './recurrence-rule.helpers';
import { buildRequestedEvent } from './recurring-booking-schedule-request-event.helpers';
import {
  RecurringBookingScheduleAssignmentPolicy,
  RecurringBookingScheduleCancellationReason,
  RecurringBookingScheduleProps,
  RecurringBookingScheduleResourceAssignmentProps,
  RecurringBookingScheduleStatus,
  RequestRecurringBookingScheduleOptions,
} from './recurring-booking-schedule.types';

// RecurringBookingScheduleStatus/AssignmentPolicy/CancellationReason/ActorType and every
// *Props/*Options interface moved to recurring-booking-schedule.types.ts to keep this file under
// the file-length cap — re-exported so existing imports of these symbols keep working.
export * from './recurring-booking-schedule.types';

export class RecurringBookingSchedule extends AggregateRoot {
  private readonly props: RecurringBookingScheduleProps;
  // The resource assignments are a wholesale-replaced child collection: true after request() (the
  // first save must insert them) and after reassignResource(), false after reconstitute(), so a
  // save that never touched them skips the delete+reinsert (docs/ENGINEERING_RULES_BACKEND.md § A
  // wholesale-replaced child collection needs a dirty flag on the aggregate).
  private assignmentsDirty: boolean;

  private constructor(props: RecurringBookingScheduleProps, assignmentsDirty: boolean) {
    super();
    this.props = { ...props, resourceAssignments: [...props.resourceAssignments] };
    this.assignmentsDirty = assignmentsDirty;
  }

  get resourceAssignmentsModified(): boolean {
    return this.assignmentsDirty;
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get customerId(): string {
    return this.props.customerId;
  }
  get serviceId(): string {
    return this.props.serviceId;
  }
  // Converts back to the wire shape (startTime as a plain "HH:mm" string) for external consumers
  // — the repository mapper (JSONB persistence) and domain events both expect RecurrenceRule, not
  // the aggregate's own internal TimeOfDay-typed representation.
  get recurrence(): RecurrenceRule {
    return {
      ...this.props.recurrence,
      daysOfWeek: [...this.props.recurrence.daysOfWeek],
      startTime: this.props.recurrence.startTime.value,
    };
  }
  get startsOn(): string {
    return this.props.startsOn;
  }
  get endsOn(): string {
    return this.props.endsOn;
  }
  get status(): RecurringBookingScheduleStatus {
    return this.props.status;
  }
  get assignmentPolicy(): RecurringBookingScheduleAssignmentPolicy {
    return this.props.assignmentPolicy;
  }
  get resourceAssignments(): RecurringBookingScheduleResourceAssignmentProps[] {
    return [...this.props.resourceAssignments];
  }
  get approvalHoldExpiresAt(): Date | null {
    return this.props.approvalHoldExpiresAt;
  }
  get approvedByStaffId(): string | null {
    return this.props.approvedByStaffId;
  }
  get approvedAt(): Date | null {
    return this.props.approvedAt;
  }
  get cancellationReason(): RecurringBookingScheduleCancellationReason | null {
    return this.props.cancellationReason;
  }
  get createdByStaffId(): string | null {
    return this.props.createdByStaffId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get version(): number | undefined {
    return this.props.version;
  }

  // Called by the repository after a successful insert/update — mirrors Booking.markPersisted()'s
  // own optimistic-concurrency precedent (docs/ENGINEERING_RULES_BACKEND.md).
  markPersisted(version: number): void {
    this.props.version = version;
  }

  static request(options: RequestRecurringBookingScheduleOptions): RecurringBookingSchedule {
    assertValidTerm(options.startsOn, options.endsOn, options.maxTermDays);
    const id = uuidv7();
    const now = new Date();
    const resourceAssignments = options.resourceAssignments.map((a) => ({
      ...a,
      assignedAt: now,
    }));

    const schedule = new RecurringBookingSchedule(
      {
        id,
        tenantId: options.tenantId,
        customerId: options.customerId,
        serviceId: options.serviceId,
        recurrence: {
          ...options.recurrence,
          startTime: TimeOfDay.create(options.recurrence.startTime),
        },
        startsOn: options.startsOn,
        endsOn: options.endsOn,
        status: options.status,
        assignmentPolicy: options.assignmentPolicy,
        resourceAssignments,
        approvalHoldExpiresAt: options.approvalHoldExpiresAt,
        approvedByStaffId: null,
        approvedAt: null,
        cancellationReason: null,
        createdByStaffId: options.createdByStaffId,
        createdAt: now,
        updatedAt: now,
      },
      true,
    );

    schedule.addDomainEvent(buildRequestedEvent(options, id, resourceAssignments));

    return schedule;
  }

  static reconstitute(props: RecurringBookingScheduleProps): RecurringBookingSchedule {
    return new RecurringBookingSchedule(props, false);
  }

  // UC-071 approve: only a request still inside its hold window can be approved — the expiry job
  // runs on a coarse schedule, so a request past its deadline is refused here even before the job
  // has cancelled it (UC-071 A2).
  approve(staffId: string, correlationId: string, now: Date = new Date()): void {
    this.assertPendingApproval();
    if (this.props.approvalHoldExpiresAt && this.props.approvalHoldExpiresAt <= now) {
      throw new RecurringBookingScheduleNotPendingApprovalError(this.props.id);
    }
    this.props.status = 'ACTIVE';
    this.props.approvedByStaffId = staffId;
    this.props.approvedAt = now;
    this.props.approvalHoldExpiresAt = null;
    this.props.updatedAt = now;
    this.addDomainEvent(
      new RecurringBookingScheduleCreated(this.props.tenantId, correlationId, {
        recurringScheduleId: this.props.id,
        customerId: this.props.customerId,
        serviceId: this.props.serviceId,
        resourceIds: this.props.resourceAssignments.map((a) => a.resourceId),
        assignmentPolicy: this.props.assignmentPolicy,
        recurrence: this.recurrence,
        startsOn: this.props.startsOn,
        endsOn: this.props.endsOn,
      }),
    );
  }

  // UC-071 reject: no free-text reason — the column only holds the cancellationReason enum.
  reject(correlationId: string): void {
    this.cancelPending('APPROVAL_REJECTED', correlationId);
  }

  // UC-070 A5: the expiry job cancels a request that reached its hold deadline undecided.
  expire(correlationId: string): void {
    this.cancelPending('APPROVAL_EXPIRED', correlationId);
  }

  // The term is over: nothing was cancelled and no consumer needs an event, so none is raised
  // (docs/03-DOMAIN_EVENTS.md § RecurringBookingScheduleEnded).
  markEnded(): void {
    this.assertActive();
    this.props.status = 'ENDED';
    this.props.updatedAt = new Date();
  }

  private assertPendingApproval(): void {
    if (this.props.status !== 'PENDING_APPROVAL') {
      throw new RecurringBookingScheduleNotPendingApprovalError(this.props.id);
    }
  }

  private cancelPending(
    reason: 'APPROVAL_REJECTED' | 'APPROVAL_EXPIRED',
    correlationId: string,
  ): void {
    this.assertPendingApproval();
    this.props.status = 'CANCELLED';
    this.props.cancellationReason = reason;
    this.props.approvalHoldExpiresAt = null;
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new RecurringBookingScheduleRejected(this.props.tenantId, correlationId, {
        recurringScheduleId: this.props.id,
        customerId: this.props.customerId,
        serviceId: this.props.serviceId,
        reason,
      }),
    );
  }

  // UC-070 A2 — only once ACTIVE; a PENDING_APPROVAL request is withdrawn outright instead
  // (no aggregate method for that — the use case simply doesn't offer it).
  private assertActive(): void {
    if (this.props.status !== 'ACTIVE') {
      throw new RecurringBookingScheduleNotActiveError(this.props.id);
    }
  }

  // M23-S08 (UC-077): a manager's REASSIGN moved this schedule's occurrences off `fromResourceId`.
  // The assignment row is only the record of what was requested, so it follows the occurrences
  // only once the use case has confirmed none is left on the old resource. A no-op when the
  // schedule was not assigned to `fromResourceId`; when `toResourceId` is already assigned (a
  // multi-unit requirement) the old row is simply dropped so the (schedule, resource) key holds.
  reassignResource(fromResourceId: string, toResourceId: string): void {
    this.assertActive();
    const from = this.props.resourceAssignments.find((a) => a.resourceId === fromResourceId);
    if (!from) return;
    const remaining = this.props.resourceAssignments.filter((a) => a.resourceId !== fromResourceId);
    const alreadyAssigned = remaining.some((a) => a.resourceId === toResourceId);
    this.props.resourceAssignments = alreadyAssigned
      ? remaining
      : [...remaining, { ...from, resourceId: toResourceId, assignedAt: new Date() }];
    this.assignmentsDirty = true;
    this.props.updatedAt = new Date();
  }

  // cancelledBookingIds is supplied by the use case — it's the one that knows which materialized
  // future occurrences exist and released their resource_occupancy rows (the aggregate itself has
  // no visibility into the Booking aggregate).
  end(correlationId: string, cancelledBookingIds: string[]): void {
    this.assertActive();
    this.props.status = 'CANCELLED';
    this.props.cancellationReason = 'CUSTOMER_CANCELLED';
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new RecurringBookingScheduleEnded(this.props.tenantId, correlationId, {
        recurringScheduleId: this.props.id,
        customerId: this.props.customerId,
        serviceId: this.props.serviceId,
        cancelledBookingIds,
      }),
    );
  }
}
