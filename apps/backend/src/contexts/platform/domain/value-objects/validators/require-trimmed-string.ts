import { PlatformErrorCode } from '@ikaro/types';
import { TenantSettingsValidationError } from '../../errors/platform-domain.error';

export function requireTrimmedString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new TenantSettingsValidationError(
      `${field} must be a string`,
      PlatformErrorCode.SETTINGS_FIELD_NOT_STRING,
      field,
    );
  }
  return value.trim();
}
