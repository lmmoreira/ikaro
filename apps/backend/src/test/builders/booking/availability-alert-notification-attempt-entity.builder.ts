import { uuidv7 } from '../../../shared/domain/uuid-v7';
import {
  AvailabilityAlertAttemptChannel,
  AvailabilityAlertAttemptOutcome,
} from '../../../contexts/booking/domain/availability-alert.types';
import { AvailabilityAlertNotificationAttemptEntity } from '../../../contexts/booking/infrastructure/entities/availability-alert-notification-attempt.entity';

const DAY_MS = 86_400_000;

// Defaults to a PENDING EMAIL attempt for a one-hour window two days out. Every instant is relative
// to `Date.now()` (docs/ENGINEERING_RULES_TESTING.md § Shared test-builder date defaults).
export class AvailabilityAlertNotificationAttemptEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private alertId = uuidv7();
  private windowStart = new Date(Date.now() + 2 * DAY_MS);
  private windowEnd = new Date(Date.now() + 2 * DAY_MS + 3_600_000);
  private channel: AvailabilityAlertAttemptChannel = 'EMAIL';
  private outcome: AvailabilityAlertAttemptOutcome = 'PENDING';
  private attemptCount = 0;
  private lastError: string | null = null;
  private readonly attemptedAt = new Date();

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withAlertId(alertId: string): this {
    this.alertId = alertId;
    return this;
  }

  withWindowStart(windowStart: Date): this {
    this.windowStart = windowStart;
    return this;
  }

  withWindowEnd(windowEnd: Date): this {
    this.windowEnd = windowEnd;
    return this;
  }

  withChannel(channel: AvailabilityAlertAttemptChannel): this {
    this.channel = channel;
    return this;
  }

  withOutcome(outcome: AvailabilityAlertAttemptOutcome): this {
    this.outcome = outcome;
    return this;
  }

  withAttemptCount(attemptCount: number): this {
    this.attemptCount = attemptCount;
    return this;
  }

  withLastError(lastError: string | null): this {
    this.lastError = lastError;
    return this;
  }

  build(): AvailabilityAlertNotificationAttemptEntity {
    const e = new AvailabilityAlertNotificationAttemptEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.alertId = this.alertId;
    e.matchingWindow = `[${this.windowStart.toISOString()},${this.windowEnd.toISOString()})`;
    e.channel = this.channel;
    e.outcome = this.outcome;
    e.attemptedAt = this.attemptedAt;
    e.attemptCount = this.attemptCount;
    e.lastError = this.lastError;
    return e;
  }
}
