import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Timezone } from '../../../shared/value-objects/timezone.vo';
import { AvailabilityAlertNotEditableError } from './errors/availability-alert.error';
import { AvailabilityAlertCancelled } from './events/availability-alert-cancelled.event';
import { AvailabilityAlertCreated } from './events/availability-alert-created.event';
import { AvailabilityAlertExpired } from './events/availability-alert-expired.event';
import { AvailabilityAlertMatched } from './events/availability-alert-matched.event';
import { AvailabilityAlertUpdated } from './events/availability-alert-updated.event';
import {
  buildCriteria,
  mergeCriteriaPatch,
  resolveExpiry,
} from './availability-alert-criteria.helpers';
import {
  AvailabilityAlertAttemptChannel,
  AvailabilityAlertCriteria,
  AvailabilityAlertMatchingWindow,
  AvailabilityAlertNotificationAttempt,
  AvailabilityAlertProps,
  AvailabilityAlertStatus,
  CreateAvailabilityAlertOptions,
  UpdateAvailabilityAlertChanges,
} from './availability-alert.types';

export * from './availability-alert.types';
export {
  ALERT_ACTIVE_CAP_PER_CUSTOMER,
  ALERT_DEFAULT_EXPIRY_DAYS,
  ALERT_MAX_EXPIRY_DAYS,
} from './availability-alert-criteria.helpers';

export class AvailabilityAlert extends AggregateRoot {
  private readonly props: AvailabilityAlertProps;
  // The attempt recorded by recordNotificationAttempt(), waiting for the repository to persist it
  // in the same transaction as the status change (like the pending domain events).
  private pendingAttempt: AvailabilityAlertNotificationAttempt | null = null;

  private constructor(props: AvailabilityAlertProps) {
    super();
    this.props = { ...props };
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get serviceId(): string {
    return this.props.serviceId;
  }
  get customerId(): string {
    return this.props.customerId;
  }
  get preferredResourceId(): string | null {
    return this.props.preferredResourceId;
  }
  get timezone(): string {
    return this.props.timezone.value;
  }
  get criteria(): AvailabilityAlertCriteria {
    const criteria = this.props.criteria;
    return criteria.criteriaType === 'WEEKLY_PREFERENCE'
      ? { ...criteria, weekdays: [...criteria.weekdays] }
      : { ...criteria };
  }
  get durationMinutes(): number | null {
    return this.props.durationMinutes;
  }
  get participantCount(): number | null {
    return this.props.participantCount;
  }
  get status(): AvailabilityAlertStatus {
    return this.props.status;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get version(): number | undefined {
    return this.props.version;
  }

  // Called by the repository after a successful insert/update (optimistic concurrency, same
  // precedent as RecurringBookingSchedule.markPersisted()).
  markPersisted(version: number): void {
    this.props.version = version;
  }

  // UC-072: an intent only — nothing is reserved. The criteria, the expiry and the numeric fields
  // are validated here; whether the service permits alerts, the resource preference and the
  // per-customer cap need other aggregates/rows and are checked by the use case.
  static create(options: CreateAvailabilityAlertOptions): AvailabilityAlert {
    const now = options.now ?? new Date();
    const criteria = buildCriteria(options.criteria, now);
    const expiresAt = resolveExpiry({
      criteria,
      requested: options.expiresAt,
      current: null,
      anchor: now,
      now,
    });
    const alert = new AvailabilityAlert({
      id: uuidv7(),
      tenantId: options.tenantId,
      serviceId: options.serviceId,
      customerId: options.customerId,
      preferredResourceId: options.preferredResourceId,
      timezone: Timezone.create(options.timezone),
      criteria,
      durationMinutes: options.durationMinutes,
      participantCount: options.participantCount,
      status: 'ACTIVE',
      expiresAt,
      createdAt: now,
    });
    alert.addDomainEvent(
      new AvailabilityAlertCreated(alert.tenantId, options.correlationId, {
        alertId: alert.id,
        customerId: alert.customerId,
        serviceId: alert.serviceId,
        criteriaType: criteria.criteriaType,
        expiresAt: expiresAt.toISOString(),
      }),
    );
    return alert;
  }

  static reconstitute(props: AvailabilityAlertProps): AvailabilityAlert {
    return new AvailabilityAlert(props);
  }

  // UC-076: only an ACTIVE alert that has not yet reached its expiry can change — the expiry job
  // runs on a coarse schedule, so an alert past its deadline is refused here even before the job
  // has marked it EXPIRED (UC-076 A1).
  update(
    changes: UpdateAvailabilityAlertChanges,
    correlationId: string,
    now: Date = new Date(),
  ): void {
    this.assertEditable(now);
    const criteria = changes.criteria
      ? buildCriteria(mergeCriteriaPatch(this.props.criteria, changes.criteria), now)
      : this.props.criteria;
    const expiresAt = resolveExpiry({
      criteria,
      requested: changes.expiresAt ?? null,
      current: this.props.expiresAt,
      anchor: this.props.createdAt,
      now,
    });

    this.props.criteria = criteria;
    this.props.expiresAt = expiresAt;
    if (changes.preferredResourceId !== undefined) {
      this.props.preferredResourceId = changes.preferredResourceId;
    }
    if (changes.durationMinutes !== undefined) this.props.durationMinutes = changes.durationMinutes;
    if (changes.participantCount !== undefined) {
      this.props.participantCount = changes.participantCount;
    }
    this.addDomainEvent(
      new AvailabilityAlertUpdated(this.props.tenantId, correlationId, this.refData()),
    );
  }

  // UC-072 A2 / UC-076. Idempotent on an already-cancelled alert (returns false, no event); a
  // NOTIFIED or EXPIRED alert is read-only history — and so is an ACTIVE one already past its
  // expiry that the expiry job has not reached yet, exactly as in update(). Returns whether
  // anything changed.
  cancel(correlationId: string, now: Date = new Date()): boolean {
    if (this.props.status === 'CANCELLED') return false;
    this.assertEditable(now);
    this.props.status = 'CANCELLED';
    this.addDomainEvent(
      new AvailabilityAlertCancelled(this.props.tenantId, correlationId, this.refData()),
    );
    return true;
  }

  // UC-072 step 3 (M23-S07): a bookable slot satisfied this alert's criteria. Records exactly one
  // notification attempt for the (window, channel), moves the alert ACTIVE → NOTIFIED and raises
  // AvailabilityAlertMatched. Idempotent: an alert that is no longer ACTIVE — already notified,
  // cancelled or expired — records nothing and returns false, so a replayed event, a racing sweep
  // or a second matching slot can never notify twice. Never cancels an alert (UC-076).
  recordNotificationAttempt(
    matchingWindow: AvailabilityAlertMatchingWindow,
    channel: AvailabilityAlertAttemptChannel,
    correlationId: string,
    now: Date = new Date(),
  ): boolean {
    if (this.props.status !== 'ACTIVE' || this.props.expiresAt <= now) return false;
    this.props.status = 'NOTIFIED';
    this.pendingAttempt = {
      id: uuidv7(),
      tenantId: this.props.tenantId,
      alertId: this.props.id,
      matchingWindow: { ...matchingWindow },
      channel,
      outcome: 'PENDING',
      attemptedAt: now,
      attemptCount: 0,
      lastError: null,
    };
    this.addDomainEvent(
      new AvailabilityAlertMatched(this.props.tenantId, correlationId, {
        ...this.refData(),
        matchingWindowStart: matchingWindow.startsAt.toISOString(),
        matchingWindowEnd: matchingWindow.endsAt.toISOString(),
        resourceId: this.props.preferredResourceId,
      }),
    );
    return true;
  }

  // Read-and-clear by the repository inside the save transaction.
  takePendingAttempt(): AvailabilityAlertNotificationAttempt | null {
    const attempt = this.pendingAttempt;
    this.pendingAttempt = null;
    return attempt;
  }

  // System: the expiry job moves an ACTIVE alert whose expiresAt has passed to EXPIRED.
  expire(correlationId: string): void {
    if (this.props.status !== 'ACTIVE') {
      throw new AvailabilityAlertNotEditableError(this.props.id);
    }
    this.props.status = 'EXPIRED';
    this.addDomainEvent(
      new AvailabilityAlertExpired(this.props.tenantId, correlationId, this.refData()),
    );
  }

  private assertEditable(now: Date): void {
    if (this.props.status !== 'ACTIVE' || this.props.expiresAt <= now) {
      throw new AvailabilityAlertNotEditableError(this.props.id);
    }
  }

  private refData(): { alertId: string; customerId: string; serviceId: string } {
    return {
      alertId: this.props.id,
      customerId: this.props.customerId,
      serviceId: this.props.serviceId,
    };
  }
}
