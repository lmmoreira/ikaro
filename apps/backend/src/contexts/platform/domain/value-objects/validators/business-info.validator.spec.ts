import { PlatformErrorCode } from '@ikaro/types';
import type { BusinessInfo } from '../../../../../shared/value-objects/tenant-settings-data';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';
import { BusinessInfoValidator } from './business-info.validator';

const VALID: BusinessInfo = {
  phone: '+5531999999999',
  email: 'contact@business.test',
  address: null,
  socialLinks: { whatsapp: '+5531999999999', instagram: null, facebook: null },
};

function expectCode(businessInfo: BusinessInfo, code: string): void {
  let err: unknown;
  try {
    BusinessInfoValidator.validate(businessInfo);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(TenantSettingsValidationError);
  expect((err as TenantSettingsValidationError).code).toBe(code);
}

describe('BusinessInfoValidator', () => {
  it('accepts valid business info', () => {
    expect(() => BusinessInfoValidator.validate(VALID)).not.toThrow();
  });

  it('is a no-op when businessInfo is undefined', () => {
    expect(() => BusinessInfoValidator.validate(undefined)).not.toThrow();
  });

  it('rejects an invalid phone number', () => {
    expectCode(
      { ...VALID, phone: 'not-a-phone' },
      PlatformErrorCode.SETTINGS_BUSINESS_PHONE_INVALID,
    );
  });

  it('rejects an invalid email', () => {
    expectCode(
      { ...VALID, email: 'not-an-email' },
      PlatformErrorCode.SETTINGS_BUSINESS_EMAIL_INVALID,
    );
  });

  it('rejects an invalid whatsapp number in socialLinks', () => {
    expectCode(
      { ...VALID, socialLinks: { whatsapp: 'not-a-phone', instagram: null, facebook: null } },
      PlatformErrorCode.SETTINGS_SOCIAL_WHATSAPP_INVALID,
    );
  });

  it('is a no-op when socialLinks is null', () => {
    expect(() => BusinessInfoValidator.validate({ ...VALID, socialLinks: null })).not.toThrow();
  });
});
