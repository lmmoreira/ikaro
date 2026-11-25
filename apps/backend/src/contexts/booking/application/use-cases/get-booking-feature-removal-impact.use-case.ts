import { Inject, Injectable } from '@nestjs/common';
import { localDateStartUTC, utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import {
  ITenantSettingsPort,
  TENANT_SETTINGS_PORT,
} from '../../../../shared/ports/tenant-settings.port';
import {
  FEATURE_REMOVAL_BLOCKERS_REPOSITORY,
  IFeatureRemovalBlockersRepository,
} from '../ports/feature-removal-blockers-repository.port';

// At most this many named blockers come back; the counts stay exact beyond it.
export const FEATURE_REMOVAL_BLOCKER_SAMPLE_LIMIT = 10;

export type FeatureRemovalBlockerCategory = 'BOOKING' | 'RECURRING_SCHEDULE';

// Ids and dates only, never customer data: the manager's page links to each one.
export interface FeatureRemovalBlocker {
  category: FeatureRemovalBlockerCategory;
  id: string;
  // YYYY-MM-DD, tenant-local: a booking's end day or a schedule's last day.
  date: string;
}

export interface GetBookingFeatureRemovalImpactUseCaseInput {
  tenantId: string;
  // The removal's effective date, a YYYY-MM-DD calendar day in the tenant's timezone: the first
  // day the BOOKING feature no longer applies.
  effectiveDate: string;
}

export interface GetBookingFeatureRemovalImpactUseCaseResult {
  effectiveFrom: string;
  bookings: number;
  recurringSchedules: number;
  blockers: FeatureRemovalBlocker[];
}

// M26-S18a (UC-136 A11): what removing BOOKING on `effectiveDate` would strand. Read-only, two
// tenant-scoped queries; it neither throws for a blocker nor changes anything (the plan save,
// M26-S19, turns a non-empty answer into BILLING_FEATURE_IN_USE). Availability alerts are not
// counted on purpose: they hold no capacity and only the customer can cancel one, so counting
// them could block a removal with nothing the manager can do (decided at discovery).
@Injectable()
export class GetBookingFeatureRemovalImpactUseCase {
  constructor(
    @Inject(FEATURE_REMOVAL_BLOCKERS_REPOSITORY)
    private readonly blockersRepo: IFeatureRemovalBlockersRepository,
    @Inject(TENANT_SETTINGS_PORT) private readonly tenantSettings: ITenantSettingsPort,
  ) {}

  async execute(
    input: GetBookingFeatureRemovalImpactUseCaseInput,
  ): Promise<GetBookingFeatureRemovalImpactUseCaseResult> {
    const { tenantId, effectiveDate } = input;
    const { businessHours } = await this.tenantSettings.getSettings(tenantId);
    const timezone = businessHours.timezone;
    // One instant, the start of the effective day in the tenant's timezone: a booking that ends
    // exactly then occupies nothing of that day and does not block.
    const boundary = localDateStartUTC(effectiveDate, timezone);

    const [bookings, schedules] = await Promise.all([
      this.blockersRepo.findBookingsEndingAfter(
        tenantId,
        boundary,
        FEATURE_REMOVAL_BLOCKER_SAMPLE_LIMIT,
      ),
      this.blockersRepo.findSchedulesEndingOnOrAfter(
        tenantId,
        effectiveDate,
        FEATURE_REMOVAL_BLOCKER_SAMPLE_LIMIT,
      ),
    ]);

    // The repository already orders each sample by date then id; bookings come first (category
    // order), then schedules, so the bounded list is the same on every call.
    const blockers: FeatureRemovalBlocker[] = [
      ...bookings.sample.map((b) => ({
        category: 'BOOKING' as const,
        id: b.id,
        date: utcDateToLocalDate(b.scheduledEndAt, timezone),
      })),
      ...schedules.sample.map((s) => ({
        category: 'RECURRING_SCHEDULE' as const,
        id: s.id,
        date: s.endsOn,
      })),
    ].slice(0, FEATURE_REMOVAL_BLOCKER_SAMPLE_LIMIT);

    return {
      effectiveFrom: effectiveDate,
      bookings: bookings.total,
      recurringSchedules: schedules.total,
      blockers,
    };
  }
}
