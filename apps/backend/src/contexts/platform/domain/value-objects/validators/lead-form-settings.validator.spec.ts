import { PlatformErrorCode } from '@ikaro/types';
import type { LeadFormSettings } from '../../../../../shared/value-objects/tenant-settings-data';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';
import { LeadFormSettingsValidator } from './lead-form-settings.validator';

const VALID: LeadFormSettings = {
  retentionMonths: 6,
  maxSubmissionsPerDay: 100,
  maxSubmissionsPerIpPerDay: 3,
};

function expectCode(settings: LeadFormSettings, code: string): void {
  let error: unknown;
  try {
    LeadFormSettingsValidator.validate(settings);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(TenantSettingsValidationError);
  expect((error as TenantSettingsValidationError).code).toBe(code);
}

describe('LeadFormSettingsValidator', () => {
  it('accepts every boundary value', () => {
    expect(() =>
      LeadFormSettingsValidator.validate({
        retentionMonths: 1,
        maxSubmissionsPerDay: 1,
        maxSubmissionsPerIpPerDay: 1,
      }),
    ).not.toThrow();
    expect(() =>
      LeadFormSettingsValidator.validate({
        retentionMonths: 24,
        maxSubmissionsPerDay: 1000,
        maxSubmissionsPerIpPerDay: 100,
      }),
    ).not.toThrow();
  });

  it.each([
    ['retentionMonths', 0, PlatformErrorCode.SETTINGS_LEAD_FORM_RETENTION_MONTHS_INVALID],
    ['retentionMonths', 25, PlatformErrorCode.SETTINGS_LEAD_FORM_RETENTION_MONTHS_INVALID],
    [
      'maxSubmissionsPerDay',
      0,
      PlatformErrorCode.SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_DAY_INVALID,
    ],
    [
      'maxSubmissionsPerDay',
      1001,
      PlatformErrorCode.SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_DAY_INVALID,
    ],
    [
      'maxSubmissionsPerIpPerDay',
      0,
      PlatformErrorCode.SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_IP_PER_DAY_INVALID,
    ],
    [
      'maxSubmissionsPerIpPerDay',
      101,
      PlatformErrorCode.SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_IP_PER_DAY_INVALID,
    ],
  ])('rejects %s=%s', (field, value, code) => {
    expectCode({ ...VALID, [field]: value }, code);
  });

  it('rejects non-integer values', () => {
    expectCode(
      { ...VALID, retentionMonths: 6.5 },
      PlatformErrorCode.SETTINGS_LEAD_FORM_RETENTION_MONTHS_INVALID,
    );
  });
});
