import { PlatformErrorCode } from '@ikaro/types';
import {
  HotsiteBrandingColorInvalidError,
  HotsiteBrandingOptionInvalidError,
  HotsiteImageNotUploadedError,
  HotsiteModuleTypeInvalidError,
  HotsiteNoEnabledModulesError,
  HotsiteNotFoundError,
  HotsiteSeoDescriptionTooLongError,
  HotsiteSeoTitleTooLongError,
  PlatformDomainError,
  SlugAlreadyTakenError,
  TenantInactiveError,
  TenantNameRequiredError,
  TenantNotFoundError,
  TenantSettingsValidationError,
  TenantSlugInvalidError,
} from './platform-domain.error';

describe('PlatformDomainError (base class)', () => {
  it('sets name, code, field and is a real Error instance', () => {
    const err = new PlatformDomainError(
      'something went wrong',
      PlatformErrorCode.TENANT_NAME_REQUIRED,
      'someField',
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PlatformDomainError);
    expect(err.name).toBe('PlatformDomainError');
    expect(err.code).toBe(PlatformErrorCode.TENANT_NAME_REQUIRED);
    expect(err.field).toBe('someField');
    expect(err.message).toBe('something went wrong');
  });

  it('leaves field undefined when not provided', () => {
    const err = new PlatformDomainError('x', PlatformErrorCode.TENANT_NAME_REQUIRED);
    expect(err.field).toBeUndefined();
  });
});

describe('SlugAlreadyTakenError', () => {
  it('carries PLATFORM_SLUG_ALREADY_TAKEN with field: "slug"', () => {
    const err = new SlugAlreadyTakenError('lavacar-belo');
    expect(err).toBeInstanceOf(PlatformDomainError);
    expect(err.code).toBe(PlatformErrorCode.SLUG_ALREADY_TAKEN);
    expect(err.field).toBe('slug');
  });
});

describe('TenantNotFoundError', () => {
  it('carries PLATFORM_TENANT_NOT_FOUND', () => {
    expect(new TenantNotFoundError('tenant-1').code).toBe(PlatformErrorCode.TENANT_NOT_FOUND);
  });
});

describe('TenantInactiveError', () => {
  it('carries PLATFORM_TENANT_INACTIVE', () => {
    expect(new TenantInactiveError('tenant-1').code).toBe(PlatformErrorCode.TENANT_INACTIVE);
  });
});

describe('HotsiteNotFoundError', () => {
  it('carries PLATFORM_HOTSITE_NOT_FOUND', () => {
    expect(new HotsiteNotFoundError('tenant-1').code).toBe(PlatformErrorCode.HOTSITE_NOT_FOUND);
  });
});

describe('HotsiteImageNotUploadedError', () => {
  it('carries PLATFORM_HOTSITE_IMAGE_NOT_UPLOADED', () => {
    expect(new HotsiteImageNotUploadedError('tenants/1/hotsite/x.jpg').code).toBe(
      PlatformErrorCode.HOTSITE_IMAGE_NOT_UPLOADED,
    );
  });
});

describe('TenantNameRequiredError', () => {
  it('carries PLATFORM_TENANT_NAME_REQUIRED with field: "name"', () => {
    const err = new TenantNameRequiredError();
    expect(err.code).toBe(PlatformErrorCode.TENANT_NAME_REQUIRED);
    expect(err.field).toBe('name');
  });
});

describe('TenantSlugInvalidError', () => {
  it('carries PLATFORM_TENANT_SLUG_INVALID with field: "slug"', () => {
    const err = new TenantSlugInvalidError();
    expect(err.code).toBe(PlatformErrorCode.TENANT_SLUG_INVALID);
    expect(err.field).toBe('slug');
  });
});

describe('HotsiteNoEnabledModulesError', () => {
  it('carries PLATFORM_HOTSITE_NO_ENABLED_MODULES', () => {
    expect(new HotsiteNoEnabledModulesError().code).toBe(
      PlatformErrorCode.HOTSITE_NO_ENABLED_MODULES,
    );
  });
});

describe('HotsiteBrandingColorInvalidError', () => {
  it('carries PLATFORM_HOTSITE_BRANDING_COLOR_INVALID with field: "branding.<field>"', () => {
    const err = new HotsiteBrandingColorInvalidError('primaryColor');
    expect(err.code).toBe(PlatformErrorCode.HOTSITE_BRANDING_COLOR_INVALID);
    expect(err.field).toBe('branding.primaryColor');
  });
});

describe('HotsiteBrandingOptionInvalidError', () => {
  it('carries PLATFORM_HOTSITE_BRANDING_OPTION_INVALID with field: "branding.<field>"', () => {
    const err = new HotsiteBrandingOptionInvalidError('borderRadius', ['sharp', 'rounded', 'pill']);
    expect(err.code).toBe(PlatformErrorCode.HOTSITE_BRANDING_OPTION_INVALID);
    expect(err.field).toBe('branding.borderRadius');
  });
});

describe('HotsiteModuleTypeInvalidError', () => {
  it('carries PLATFORM_HOTSITE_MODULE_TYPE_INVALID', () => {
    expect(new HotsiteModuleTypeInvalidError('UNKNOWN').code).toBe(
      PlatformErrorCode.HOTSITE_MODULE_TYPE_INVALID,
    );
  });
});

describe('HotsiteSeoTitleTooLongError', () => {
  it('carries PLATFORM_HOTSITE_SEO_TITLE_TOO_LONG with field: "seo.title"', () => {
    const err = new HotsiteSeoTitleTooLongError(60);
    expect(err.code).toBe(PlatformErrorCode.HOTSITE_SEO_TITLE_TOO_LONG);
    expect(err.field).toBe('seo.title');
  });
});

describe('HotsiteSeoDescriptionTooLongError', () => {
  it('carries PLATFORM_HOTSITE_SEO_DESCRIPTION_TOO_LONG with field: "seo.description"', () => {
    const err = new HotsiteSeoDescriptionTooLongError(158);
    expect(err.code).toBe(PlatformErrorCode.HOTSITE_SEO_DESCRIPTION_TOO_LONG);
    expect(err.field).toBe('seo.description');
  });
});

describe('TenantSettingsValidationError', () => {
  it('extends PlatformDomainError and forwards the code/field passed by its call site', () => {
    const err = new TenantSettingsValidationError(
      'localization.currency must not be empty',
      PlatformErrorCode.SETTINGS_CURRENCY_REQUIRED,
      'localization.currency',
    );
    expect(err).toBeInstanceOf(PlatformDomainError);
    expect(err.name).toBe('TenantSettingsValidationError');
    expect(err.code).toBe(PlatformErrorCode.SETTINGS_CURRENCY_REQUIRED);
    expect(err.field).toBe('localization.currency');
  });

  it('leaves field undefined when the call site has no natural field (e.g. a dynamic requireTrimmedString field)', () => {
    const err = new TenantSettingsValidationError(
      'x must be a string',
      PlatformErrorCode.SETTINGS_FIELD_NOT_STRING,
    );
    expect(err.field).toBeUndefined();
  });
});
