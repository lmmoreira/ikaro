import { PlatformErrorCode } from '@ikaro/types';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';
import { NotificationSettingsValidator } from './notification-settings.validator';

describe('NotificationSettingsValidator', () => {
  it('accepts a valid fromEmail', () => {
    expect(() =>
      NotificationSettingsValidator.validate({ fromEmail: 'no-reply@business.test' }),
    ).not.toThrow();
  });

  it('accepts a null fromEmail', () => {
    expect(() => NotificationSettingsValidator.validate({ fromEmail: null })).not.toThrow();
  });

  it('is a no-op when notification is undefined', () => {
    expect(() => NotificationSettingsValidator.validate(undefined)).not.toThrow();
  });

  it('rejects an invalid fromEmail', () => {
    let err: unknown;
    try {
      NotificationSettingsValidator.validate({ fromEmail: 'not-an-email' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(TenantSettingsValidationError);
    expect((err as TenantSettingsValidationError).code).toBe(
      PlatformErrorCode.SETTINGS_NOTIFICATION_EMAIL_INVALID,
    );
  });
});
