import { PlatformErrorCode } from '@ikaro/types';
import type { BusinessHours } from '../../../../../shared/value-objects/business-hours.vo';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';
import { BusinessHoursValidator } from './business-hours.validator';

const VALID: BusinessHours = {
  timezone: 'America/Sao_Paulo',
  monday: { open: '09:00', close: '18:00' },
  tuesday: { open: '09:00', close: '18:00' },
  wednesday: { open: '09:00', close: '18:00' },
  thursday: { open: '09:00', close: '18:00' },
  friday: { open: '09:00', close: '18:00' },
  saturday: { open: '09:00', close: '17:00' },
  sunday: null,
};

function expectCode(businessHours: BusinessHours, code: string): void {
  let err: unknown;
  try {
    BusinessHoursValidator.validate(businessHours);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(TenantSettingsValidationError);
  expect((err as TenantSettingsValidationError).code).toBe(code);
}

describe('BusinessHoursValidator', () => {
  it('accepts valid business hours, including a closed day (null)', () => {
    expect(() => BusinessHoursValidator.validate(VALID)).not.toThrow();
  });

  it('rejects an invalid IANA timezone', () => {
    expectCode({ ...VALID, timezone: 'Not/AZone' }, PlatformErrorCode.SETTINGS_TIMEZONE_INVALID);
  });

  it('rejects a day with a malformed time', () => {
    expectCode(
      { ...VALID, monday: { open: '9am', close: '18:00' } },
      PlatformErrorCode.SETTINGS_BUSINESS_HOURS_FORMAT_INVALID,
    );
  });

  it('rejects a day where close is not after open', () => {
    expectCode(
      { ...VALID, monday: { open: '18:00', close: '09:00' } },
      PlatformErrorCode.SETTINGS_BUSINESS_HOURS_ORDER_INVALID,
    );
  });
});
