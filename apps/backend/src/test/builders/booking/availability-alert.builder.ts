import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { WeekDayName } from '../../../shared/utils/calendar-date';
import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import { Timezone } from '../../../shared/value-objects/timezone.vo';
import {
  AvailabilityAlert,
  AvailabilityAlertCriteria,
  AvailabilityAlertStatus,
} from '../../../contexts/booking/domain/availability-alert.aggregate';

const DAY_MS = 86_400_000;

// Builds a persisted-looking alert through reconstitute() (no pending events), so any status can
// be set directly. Use AvailabilityAlert.create() in a spec that is about creation itself.
// Every instant is relative to `Date.now()` (docs/ENGINEERING_RULES_TESTING.md § Shared
// test-builder date defaults).
export class AvailabilityAlertBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private serviceId = uuidv7();
  private customerId = uuidv7();
  private preferredResourceId: string | null = null;
  private readonly timezone = Timezone.create('America/Sao_Paulo');
  private criteria: AvailabilityAlertCriteria = {
    criteriaType: 'ONE_TIME_RANGE',
    acceptableStartAt: new Date(Date.now() + 2 * DAY_MS),
    acceptableEndAt: new Date(Date.now() + 2 * DAY_MS + 4 * 3_600_000),
  };
  private readonly durationMinutes: number | null = null;
  private readonly participantCount: number | null = null;
  private status: AvailabilityAlertStatus = 'ACTIVE';
  private expiresAt = new Date(Date.now() + 7 * DAY_MS);
  private createdAt = new Date();
  private readonly version = 1;

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
    this.criteria = { criteriaType: 'ONE_TIME_RANGE', acceptableStartAt, acceptableEndAt };
    return this;
  }

  withWeeklyPreference(
    weekdays: WeekDayName[],
    localStartTime: string,
    localEndTime: string,
  ): this {
    this.criteria = {
      criteriaType: 'WEEKLY_PREFERENCE',
      weekdays,
      localStartTime: TimeOfDay.create(localStartTime),
      localEndTime: TimeOfDay.create(localEndTime),
    };
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

  withCreatedAt(createdAt: Date): this {
    this.createdAt = createdAt;
    return this;
  }

  build(): AvailabilityAlert {
    return AvailabilityAlert.reconstitute({
      id: this.id,
      tenantId: this.tenantId,
      serviceId: this.serviceId,
      customerId: this.customerId,
      preferredResourceId: this.preferredResourceId,
      timezone: this.timezone,
      criteria: this.criteria,
      durationMinutes: this.durationMinutes,
      participantCount: this.participantCount,
      status: this.status,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      version: this.version,
    });
  }
}
