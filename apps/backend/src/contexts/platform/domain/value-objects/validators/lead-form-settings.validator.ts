import { PlatformErrorCode } from '@ikaro/types/protocol/errors';
import type { LeadFormSettings } from '../../../../../shared/value-objects/tenant-settings-data';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';

export class LeadFormSettingsValidator {
  static validate(leadForm: LeadFormSettings): void {
    LeadFormSettingsValidator.validateIntegerRange(
      leadForm.retentionMonths,
      1,
      24,
      'retentionMonths',
      PlatformErrorCode.SETTINGS_LEAD_FORM_RETENTION_MONTHS_INVALID,
    );
    LeadFormSettingsValidator.validateIntegerRange(
      leadForm.maxSubmissionsPerDay,
      1,
      1000,
      'maxSubmissionsPerDay',
      PlatformErrorCode.SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_DAY_INVALID,
    );
    LeadFormSettingsValidator.validateIntegerRange(
      leadForm.maxSubmissionsPerIpPerDay,
      1,
      100,
      'maxSubmissionsPerIpPerDay',
      PlatformErrorCode.SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_IP_PER_DAY_INVALID,
    );
  }

  private static validateIntegerRange(
    value: number,
    minimum: number,
    maximum: number,
    field: string,
    code: PlatformErrorCode,
  ): void {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new TenantSettingsValidationError(
        `leadForm.${field} must be an integer between ${minimum} and ${maximum}`,
        code,
        `leadForm.${field}`,
      );
    }
  }
}
