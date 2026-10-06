import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { AvailabilityAlertEntity } from '../../../contexts/booking/infrastructure/entities/availability-alert.entity';
import {
  AvailabilityAlertCriteriaType,
  AvailabilityAlertStatus,
} from '../../../contexts/booking/domain/availability-alert.types';
import { WeekDayName } from '../../../shared/utils/calendar-date';

const DAY_MS = 86_400_000;

// Defaults to an ACTIVE ONE_TIME_RANGE alert. Every instant is relative to `Date.now()` — a
// hardcoded calendar date would silently become an already-expired alert once it passes
// (docs/ENGINEERING_RULES_TESTING.md § Shared test-builder date defaults).
export class AvailabilityAlertEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private serviceId = uuidv7();
  private customerId = uuidv7();
  private preferredResourceId: string | null = null;
  private criteriaType: AvailabilityAlertCriteriaType = 'ONE_TIME_RANGE';
  private readonly timezone = 'America/Sao_Paulo';
  private acceptableStartAt: Date | null = new Date(Date.now() + 2 * DAY_MS);
  private acceptableEndAt: Date | null = new Date(Date.now() + 2 * DAY_MS + 4 * 3_600_000);
  private weekdays: WeekDayName[] | null = null;
  private localStartTime: string | null = null;
  private localEndTime: string | null = null;
  private durationMinutes: number | null = null;
  private readonly participantCount: number | null = null;
  private status: AvailabilityAlertStatus = 'ACTIVE';
  private expiresAt = new Date(Date.now() + 7 * DAY_MS);
  private readonly createdAt = new Date();

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withServiceId(serviceId: string): this {
    this.serviceId = serviceId;
    return this;
  }

  withCustomerId(customerId: string): this {
    this.customerId = customerId;
    return this;
  }

  withPreferredResourceId(preferredResourceId: string | null): this {
    this.preferredResourceId = preferredResourceId;
    return this;
  }

  withOneTimeRange(acceptableStartAt: Date, acceptableEndAt: Date): this {
    this.criteriaType = 'ONE_TIME_RANGE';
    this.acceptableStartAt = acceptableStartAt;
    this.acceptableEndAt = acceptableEndAt;
    this.weekdays = null;
    this.localStartTime = null;
    this.localEndTime = null;
    return this;
  }

  withWeeklyPreference(
    weekdays: WeekDayName[],
    localStartTime: string,
    localEndTime: string,
  ): this {
    this.criteriaType = 'WEEKLY_PREFERENCE';
    this.acceptableStartAt = null;
    this.acceptableEndAt = null;
    this.weekdays = weekdays;
    this.localStartTime = localStartTime;
    this.localEndTime = localEndTime;
    return this;
  }

  withDurationMinutes(durationMinutes: number | null): this {
    this.durationMinutes = durationMinutes;
    return this;
  }

  withStatus(status: AvailabilityAlertStatus): this {
    this.status = status;
    return this;
  }

  withExpiresAt(expiresAt: Date): this {
    this.expiresAt = expiresAt;
    return this;
  }

  build(): AvailabilityAlertEntity {
    const e = new AvailabilityAlertEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.serviceId = this.serviceId;
    e.customerId = this.customerId;
    e.preferredResourceId = this.preferredResourceId;
    e.criteriaType = this.criteriaType;
    e.timezone = this.timezone;
    e.acceptableStartAt = this.acceptableStartAt;
    e.acceptableEndAt = this.acceptableEndAt;
    e.weekdays = this.weekdays;
    e.localStartTime = this.localStartTime;
    e.localEndTime = this.localEndTime;
    e.durationMinutes = this.durationMinutes;
    e.participantCount = this.participantCount;
    e.status = this.status;
    e.expiresAt = this.expiresAt;
    e.createdAt = this.createdAt;
    return e;
  }
}
