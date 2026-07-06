import { HttpException, HttpStatus } from '@nestjs/common';
import { TenantSettingsValidationError } from '../../domain/value-objects/tenant-settings.vo';
import { mapPlatformError } from './platform-error.mapper';

function call(err: unknown): HttpException {
  try {
    mapPlatformError(err);
    throw new Error('mapPlatformError should have thrown');
  } catch (e) {
    return e as HttpException;
  }
}

describe('mapPlatformError', () => {
  it('maps TenantSettingsValidationError to 400', () => {
    const err = call(new TenantSettingsValidationError('localization.countryCode must be valid'));
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });
});
