import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import {
  RecurringBookingScheduleExceptionAlreadyExistsError,
  RecurringBookingScheduleNotActiveError,
} from './errors/recurring-booking-schedule.error';
import { RecurringBookingSchedulePaused } from './events/recurring-booking-schedule-paused.event';
import { RecurringBookingScheduleEnded } from './events/recurring-booking-schedule-ended.event';
import { assertValidTerm, RecurrenceRule } from './recurrence-rule.helpers';
import { buildRequestedEvent } from './recurring-booking-schedule-request-event.helpers';
import {
  RecurringBookingScheduleActorType,
  RecurringBookingScheduleAssignmentPolicy,
  RecurringBookingScheduleCancellationReason,
  RecurringBookingScheduleExceptionProps,
  RecurringBookingScheduleProps,
  RecurringBookingScheduleResourceAssignmentProps,
  RecurringBookingScheduleStatus,
  RequestRecurringBookingScheduleOptions,
} from './recurring-booking-schedule.types';

// RecurringBookingScheduleStatus/AssignmentPolicy/CancellationReason/ExceptionKind/ActorType and
// every *Props/*Options interface moved to recurring-booking-schedule.types.ts to keep this file
// under the file-length cap — re-exported so existing imports of these symbols keep working.
export * from './recurring-booking-schedule.types';

export class RecurringBookingSchedule extends AggregateRoot {
  private readonly props: RecurringBookingScheduleProps;
  // Exceptions are append-only and immutable once created — the repository only ever needs to
  // INSERT a newly-added one, never touch an existing row. Tracked separately from props.exceptions
  // (which mirrors full DB state) so save() doesn't need to diff the whole array to find what's new
  // (mirrors Booking's own _linesModified dirty-flag precedent, docs/ENGINEERING_RULES_BACKEND.md
  // § A repository that wholesale-replaces a child collection).
  private readonly newExceptions: RecurringBookingScheduleExceptionProps[] = [];

  private constructor(props: RecurringBookingScheduleProps) {
    super();
    this.props = {
      ...props,
      resourceAssignments: [...props.resourceAssignments],
      exceptions: [...props.exceptions],
    };
  }

  get pendingNewExceptions(): RecurringBookingScheduleExceptionProps[] {
    return [...this.newExceptions];
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
  get exceptions(): RecurringBookingScheduleExceptionProps[] {
    return [...this.props.exceptions];
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

    const schedule = new RecurringBookingSchedule({
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
      exceptions: [],
      approvalHoldExpiresAt: options.approvalHoldExpiresAt,
      approvedByStaffId: null,
      approvedAt: null,
      cancellationReason: null,
      createdByStaffId: options.createdByStaffId,
      createdAt: now,
      updatedAt: now,
    });

    schedule.addDomainEvent(buildRequestedEvent(options, id, resourceAssignments));

    return schedule;
  }

  static reconstitute(props: RecurringBookingScheduleProps): RecurringBookingSchedule {
    return new RecurringBookingSchedule(props);
  }

  // UC-070 A2 — only once ACTIVE; a PENDING_APPROVAL request is withdrawn outright instead
  // (no aggregate method for that — the use case simply doesn't offer it), and a PAUSED schedule
  // has no path back to ACTIVE in this story (no resume use case is in scope — locked in during
  // M23-S04 story-discovery).
  private assertActive(): void {
    if (this.props.status !== 'ACTIVE') {
      throw new RecurringBookingScheduleNotActiveError(this.props.id);
    }
  }

  private assertNoExistingException(occurrenceStart: Date): void {
    const iso = occurrenceStart.toISOString();
    if (this.props.exceptions.some((e) => e.occurrenceStart.toISOString() === iso)) {
      throw new RecurringBookingScheduleExceptionAlreadyExistsError(iso);
    }
  }

  private addException(exception: RecurringBookingScheduleExceptionProps): void {
    this.props.exceptions.push(exception);
    this.newExceptions.push(exception);
    this.props.updatedAt = new Date();
  }

  skipOccurrence(
    occurrenceStart: Date,
    actorType: RecurringBookingScheduleActorType,
    actorId: string | null,
    reason: string | null,
  ): void {
    this.assertActive();
    this.assertNoExistingException(occurrenceStart);
    this.addException({
      id: uuidv7(),
      occurrenceStart,
      kind: 'SKIPPED',
      replacementBookingId: null,
      actorType,
      actorId,
      reason,
      createdAt: new Date(),
    });
  }

  rescheduleOccurrence(
    occurrenceStart: Date,
    replacementBookingId: string,
    actorType: RecurringBookingScheduleActorType,
    actorId: string | null,
    reason: string | null,
  ): void {
    this.assertActive();
    this.assertNoExistingException(occurrenceStart);
    this.addException({
      id: uuidv7(),
      occurrenceStart,
      kind: 'RESCHEDULED',
      replacementBookingId,
      actorType,
      actorId,
      reason,
      createdAt: new Date(),
    });
  }

  pause(correlationId: string): void {
    this.assertActive();
    this.props.status = 'PAUSED';
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new RecurringBookingSchedulePaused(this.props.tenantId, correlationId, {
        recurringScheduleId: this.props.id,
        customerId: this.props.customerId,
        serviceId: this.props.serviceId,
      }),
    );
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
