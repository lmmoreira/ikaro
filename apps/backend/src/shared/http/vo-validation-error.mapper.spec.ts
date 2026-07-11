import { HttpException, HttpStatus } from '@nestjs/common';
import {
  EmailErrorCode,
  HexColorErrorCode,
  MoneyErrorCode,
  PhoneErrorCode,
  SeoErrorCode,
  SlugErrorCode,
  TimeOfDayErrorCode,
  TimezoneErrorCode,
} from '@ikaro/types';
import { MoneyValidationError } from '../value-objects/money';
import { PhoneNumberValidationError } from '../value-objects/phone-number.vo';
import { SeoTitleValidationError } from '../value-objects/seo-title.vo';
import { SeoDescriptionValidationError } from '../value-objects/seo-description.vo';
import { SlugValidationError } from '../value-objects/slug.vo';
import { HexColorValidationError } from '../value-objects/hex-color.vo';
import { TimezoneValidationError } from '../value-objects/timezone.vo';
import { TimeOfDayValidationError } from '../value-objects/time-of-day.vo';
import { EmailValidationError } from '../value-objects/email.vo';
import { mapSharedVoError } from './vo-validation-error.mapper';

function call(err: unknown): HttpException {
  try {
    mapSharedVoError(err);
    throw new Error('mapSharedVoError should have thrown');
  } catch (e) {
    return e as HttpException;
  }
}

describe('mapSharedVoError', () => {
  it('maps MoneyValidationError to 400 with code', () => {
    const err = call(
      new MoneyValidationError('Invalid money amount: NaN', MoneyErrorCode.AMOUNT_INVALID),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: MoneyErrorCode.AMOUNT_INVALID });
  });

  it('maps PhoneNumberValidationError to 400 with code', () => {
    const err = call(
      new PhoneNumberValidationError('"123" is not valid', PhoneErrorCode.FORMAT_INVALID),
    );
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: PhoneErrorCode.FORMAT_INVALID });
  });

  it('maps SeoTitleValidationError to 400 with code', () => {
    const err = call(new SeoTitleValidationError('too long', SeoErrorCode.TITLE_TOO_LONG));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: SeoErrorCode.TITLE_TOO_LONG });
  });

  it('maps SeoDescriptionValidationError to 400 with code', () => {
    const err = call(
      new SeoDescriptionValidationError('too long', SeoErrorCode.DESCRIPTION_TOO_LONG),
    );
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: SeoErrorCode.DESCRIPTION_TOO_LONG });
  });

  it('maps SlugValidationError to 400 with code', () => {
    const err = call(new SlugValidationError('bad slug', SlugErrorCode.FORMAT_INVALID));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: SlugErrorCode.FORMAT_INVALID });
  });

  it('maps HexColorValidationError to 400 with code', () => {
    const err = call(new HexColorValidationError('bad color', HexColorErrorCode.FORMAT_INVALID));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: HexColorErrorCode.FORMAT_INVALID });
  });

  it('maps TimezoneValidationError to 400 with code', () => {
    const err = call(new TimezoneValidationError('bad tz', TimezoneErrorCode.INVALID));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: TimezoneErrorCode.INVALID });
  });

  it('maps TimeOfDayValidationError to 400 with code', () => {
    const err = call(new TimeOfDayValidationError('bad time', TimeOfDayErrorCode.FORMAT_INVALID));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: TimeOfDayErrorCode.FORMAT_INVALID });
  });

  it('maps EmailValidationError to 400 with code', () => {
    const err = call(new EmailValidationError('bad email', EmailErrorCode.FORMAT_INVALID));
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: EmailErrorCode.FORMAT_INVALID });
  });

  it('returns without throwing for any other error', () => {
    expect(() => mapSharedVoError(new Error('unrelated'))).not.toThrow();
  });
});
