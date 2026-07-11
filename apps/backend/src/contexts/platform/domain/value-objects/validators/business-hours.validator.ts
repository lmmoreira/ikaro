import { PlatformErrorCode } from '@ikaro/types';
import type {
  BusinessHours,
  DayHours,
} from '../../../../../shared/value-objects/business-hours.vo';
import { TimeOfDay } from '../../../../../shared/value-objects/time-of-day.vo';
import { Timezone } from '../../../../../shared/value-objects/timezone.vo';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';

const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export class BusinessHoursValidator {
  static validate(businessHours: BusinessHours): void {
    if (!Timezone.isValid(businessHours.timezone)) {
      throw new TenantSettingsValidationError(
        `Invalid IANA timezone: ${businessHours.timezone}`,
        PlatformErrorCode.SETTINGS_TIMEZONE_INVALID,
        'businessHours.timezone',
      );
    }
    for (const day of DAYS_OF_WEEK) {
      BusinessHoursValidator.validateDayHours(day, businessHours[day]);
    }
  }

  private static validateDayHours(day: string, hours: DayHours): void {
    if (hours === null || hours === undefined) return;
    if (!TimeOfDay.isValid(hours.open) || !TimeOfDay.isValid(hours.close)) {
      throw new TenantSettingsValidationError(
        `businessHours.${day}: open/close must be HH:MM format`,
        PlatformErrorCode.SETTINGS_BUSINESS_HOURS_FORMAT_INVALID,
        `businessHours.${day}`,
      );
    }
    if (hours.close <= hours.open) {
      throw new TenantSettingsValidationError(
        `businessHours.${day}: close must be after open`,
        PlatformErrorCode.SETTINGS_BUSINESS_HOURS_ORDER_INVALID,
        `businessHours.${day}`,
      );
    }
  }
}
