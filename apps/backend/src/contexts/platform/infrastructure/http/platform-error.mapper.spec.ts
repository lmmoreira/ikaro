import { HttpException, HttpStatus } from '@nestjs/common';
import { AddressErrorCode, CountryCodeErrorCode, PlatformErrorCode } from '@ikaro/types';
import { AddressValidationError } from '../../../../shared/value-objects/address';
import { CountryCodeValidationError } from '../../../../shared/value-objects/country-code.vo';
import {
  HotsiteBrandingColorInvalidError,
  HotsiteNotFoundError,
  SlugAlreadyTakenError,
  TenantInactiveError,
  TenantNotFoundError,
  TenantSettingsValidationError,
} from '../../domain/errors/platform-domain.error';
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
  it('maps AddressValidationError to 400 with code', () => {
    const err = call(
      new AddressValidationError('Invalid CEP: 123', AddressErrorCode.POSTAL_CODE_INVALID),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: AddressErrorCode.POSTAL_CODE_INVALID });
  });

  it('maps CountryCodeValidationError to 400 with code', () => {
    const err = call(
      new CountryCodeValidationError(
        'countryCode must be supported',
        CountryCodeErrorCode.UNSUPPORTED,
      ),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: CountryCodeErrorCode.UNSUPPORTED });
  });

  it('maps SlugAlreadyTakenError to 409 with code and field', () => {
    const err = call(new SlugAlreadyTakenError('lavacar-belo'));
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(err.getResponse()).toMatchObject({
      code: PlatformErrorCode.SLUG_ALREADY_TAKEN,
      field: 'slug',
    });
  });

  it('maps TenantInactiveError to 409 with code', () => {
    const err = call(new TenantInactiveError('tenant-1'));
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(err.getResponse()).toMatchObject({ code: PlatformErrorCode.TENANT_INACTIVE });
  });

  it('maps TenantNotFoundError to 404 with code', () => {
    const err = call(new TenantNotFoundError('tenant-1'));
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(err.getResponse()).toMatchObject({ code: PlatformErrorCode.TENANT_NOT_FOUND });
  });

  it('maps HotsiteNotFoundError to 404 with code', () => {
    const err = call(new HotsiteNotFoundError('tenant-1'));
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(err.getResponse()).toMatchObject({ code: PlatformErrorCode.HOTSITE_NOT_FOUND });
  });

  it('maps generic PlatformDomainError to 400, preserving the code and field carried on the instance', () => {
    const err = call(new HotsiteBrandingColorInvalidError('primaryColor'));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({
      code: PlatformErrorCode.HOTSITE_BRANDING_COLOR_INVALID,
      field: 'branding.primaryColor',
    });
  });

  it('maps TenantSettingsValidationError to 400 with the code/field forwarded by its call site', () => {
    const err = call(
      new TenantSettingsValidationError(
        'localization.currency must not be empty',
        PlatformErrorCode.SETTINGS_CURRENCY_REQUIRED,
        'localization.currency',
      ),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({
      code: PlatformErrorCode.SETTINGS_CURRENCY_REQUIRED,
      field: 'localization.currency',
    });
  });

  it('re-throws plain Error instances unchanged', () => {
    const err = new Error('unexpected');
    expect(() => mapPlatformError(err)).toThrow(err);
  });

  it('wraps unknown non-Error values in an Error', () => {
    expect(() => mapPlatformError('unexpected string')).toThrow(Error);
  });
});
