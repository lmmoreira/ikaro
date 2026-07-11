import { PlatformErrorCode } from '@ikaro/types';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';
import { requireTrimmedString } from './require-trimmed-string';

describe('requireTrimmedString', () => {
  it('trims and returns a valid string', () => {
    expect(requireTrimmedString('  hello  ', 'someField')).toBe('hello');
  });

  it('throws SETTINGS_FIELD_NOT_STRING with the field name when value is not a string', () => {
    let err: unknown;
    try {
      requireTrimmedString(123, 'someField');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(TenantSettingsValidationError);
    expect((err as TenantSettingsValidationError).code).toBe(
      PlatformErrorCode.SETTINGS_FIELD_NOT_STRING,
    );
    expect((err as TenantSettingsValidationError).field).toBe('someField');
  });
});
