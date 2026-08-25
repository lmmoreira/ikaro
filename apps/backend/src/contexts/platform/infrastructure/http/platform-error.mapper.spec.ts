import { HttpException, HttpStatus } from '@nestjs/common';
import {
  AddressErrorCode,
  AuthErrorCode,
  CountryCodeErrorCode,
  GenericErrorCode,
  HexColorErrorCode,
  PlatformErrorCode,
  SeoErrorCode,
  SlugErrorCode,
} from '@ikaro/types';
import { AddressValidationError } from '../../../../shared/value-objects/address';
import { CountryCodeValidationError } from '../../../../shared/value-objects/country-code.vo';
import { SeoTitleValidationError } from '../../../../shared/value-objects/seo-title.vo';
import { SeoDescriptionValidationError } from '../../../../shared/value-objects/seo-description.vo';
import { SlugValidationError } from '../../../../shared/value-objects/slug.vo';
import { HexColorValidationError } from '../../../../shared/value-objects/hex-color.vo';
import {
  HotsiteBrandingColorInvalidError,
  HotsiteConfigConcurrentModificationError,
  HotsiteNotFoundError,
  SlugAlreadyTakenError,
  TenantInactiveError,
  TenantNotFoundError,
  TenantSettingsValidationError,
} from '../../domain/errors/platform-domain.error';
import {
  ChatbotConcurrencyCapReachedError,
  ChatbotDailyCapReachedError,
  ChatbotGlobalSpendLimitReachedError,
  ChatbotMessageCapReachedError,
  ChatbotProviderBalanceLowError,
  ChatbotProviderUnavailableError,
  ChatbotSessionNotFoundError,
} from '../../domain/errors/chatbot-domain.error';
import {
  LeadFormAnswerQuestionInvalidError,
  LeadFormAnswerRequiredError,
  LeadFormCustomerOnlyError,
  LeadFormDailyCapReachedError,
  LeadFormNotEnabledError,
} from '../../domain/errors/lead-form-domain.error';
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

  it('maps HotsiteConfigConcurrentModificationError to 409 with code', () => {
    const err = call(new HotsiteConfigConcurrentModificationError());
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(err.getResponse()).toMatchObject({
      code: PlatformErrorCode.HOTSITE_CONCURRENT_MODIFICATION,
    });
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

  // hotsite-config.aggregate.ts and tenant.aggregate.ts always pre-guard with .isValid()
  // before calling these VOs' .create(), so these branches are unreachable through the
  // validated HTTP request path today — this direct unit test is their only coverage
  // (see TD23 Story 8 discovery notes for why the branch is still wired regardless).
  it('maps SeoTitleValidationError to 400 with code (defensive — unreachable via the validated request path today)', () => {
    const err = call(new SeoTitleValidationError('too long', SeoErrorCode.TITLE_TOO_LONG));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: SeoErrorCode.TITLE_TOO_LONG });
  });

  it('maps SeoDescriptionValidationError to 400 with code (defensive — unreachable via the validated request path today)', () => {
    const err = call(
      new SeoDescriptionValidationError('too long', SeoErrorCode.DESCRIPTION_TOO_LONG),
    );
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: SeoErrorCode.DESCRIPTION_TOO_LONG });
  });

  it('maps SlugValidationError to 400 with code (defensive — unreachable via the validated request path today)', () => {
    const err = call(new SlugValidationError('bad slug', SlugErrorCode.FORMAT_INVALID));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: SlugErrorCode.FORMAT_INVALID });
  });

  it('maps HexColorValidationError to 400 with code (defensive — unreachable via the validated request path today)', () => {
    const err = call(new HexColorValidationError('bad color', HexColorErrorCode.FORMAT_INVALID));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: HexColorErrorCode.FORMAT_INVALID });
  });

  it.each([
    [new ChatbotDailyCapReachedError(), PlatformErrorCode.CHATBOT_DAILY_CAP_REACHED],
    [new ChatbotConcurrencyCapReachedError(), PlatformErrorCode.CHATBOT_CONCURRENCY_CAP_REACHED],
    [new ChatbotMessageCapReachedError(), PlatformErrorCode.CHATBOT_MESSAGE_CAP_REACHED],
    [
      new ChatbotGlobalSpendLimitReachedError(),
      PlatformErrorCode.CHATBOT_GLOBAL_SPEND_LIMIT_REACHED,
    ],
    [new ChatbotProviderBalanceLowError(), PlatformErrorCode.CHATBOT_PROVIDER_BALANCE_LOW],
  ])('maps %p to 429 with code %s', (error, code) => {
    const err = call(error);
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(err.getResponse()).toMatchObject({ code });
  });

  it('maps ChatbotProviderUnavailableError to 503 with code', () => {
    const err = call(new ChatbotProviderUnavailableError());
    expect(err.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(err.getResponse()).toMatchObject({
      code: PlatformErrorCode.CHATBOT_PROVIDER_UNAVAILABLE,
    });
  });

  it('maps ChatbotSessionNotFoundError to 404 with code', () => {
    const err = call(new ChatbotSessionNotFoundError('session-1'));
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(err.getResponse()).toMatchObject({ code: PlatformErrorCode.CHATBOT_SESSION_NOT_FOUND });
  });

  it('maps LeadFormNotEnabledError to 404 with code', () => {
    const err = call(new LeadFormNotEnabledError('tenant-1'));
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(err.getResponse()).toMatchObject({ code: PlatformErrorCode.LEAD_FORM_NOT_ENABLED });
  });

  it('maps LeadFormCustomerOnlyError to 401 with the existing AUTH_UNAUTHORIZED code, not a new one', () => {
    const err = call(new LeadFormCustomerOnlyError());
    expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(err.getResponse()).toMatchObject({ code: AuthErrorCode.UNAUTHORIZED });
  });

  it('maps LeadFormDailyCapReachedError to 429 with code — the first HTTP consumer of this M20-S02 error', () => {
    const err = call(new LeadFormDailyCapReachedError());
    expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(err.getResponse()).toMatchObject({
      code: PlatformErrorCode.LEAD_FORM_DAILY_CAP_REACHED,
    });
  });

  it('maps LeadFormAnswerQuestionInvalidError to 400 with code and field', () => {
    const err = call(new LeadFormAnswerQuestionInvalidError(0));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({
      code: GenericErrorCode.VALUE_INVALID,
      field: 'answers[0].questionId',
    });
  });

  it('maps LeadFormAnswerRequiredError to 400 with code and field', () => {
    const err = call(new LeadFormAnswerRequiredError('question-1'));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({
      code: GenericErrorCode.FIELD_REQUIRED,
      field: 'answers.question-1',
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
