import { HttpException, HttpStatus } from '@nestjs/common';
import { ProblemDetail } from '@ikaro/types';
import { MoneyValidationError } from '../value-objects/money';
import { PhoneNumberValidationError } from '../value-objects/phone-number.vo';
import { SeoTitleValidationError } from '../value-objects/seo-title.vo';
import { SeoDescriptionValidationError } from '../value-objects/seo-description.vo';
import { SlugValidationError } from '../value-objects/slug.vo';
import { HexColorValidationError } from '../value-objects/hex-color.vo';
import { TimezoneValidationError } from '../value-objects/timezone.vo';
import { TimeOfDayValidationError } from '../value-objects/time-of-day.vo';
import { EmailValidationError } from '../value-objects/email.vo';

/**
 * Shared branch for the 8 plain-VO-level errors (Money, PhoneNumber, SeoTitle,
 * SeoDescription, Slug, HexColor, Timezone, TimeOfDay, Email) every context mapper that
 * calls one of these VOs must handle identically — extracted to avoid re-duplicating this
 * block per context (SonarCloud new-code-duplication gate, same reasoning as
 * mapSharedAddressError). Returns without throwing when `err` isn't one of these types, so
 * callers can fall through to their own context-specific branches.
 */
export function mapSharedVoError(err: unknown): void {
  if (
    err instanceof MoneyValidationError ||
    err instanceof PhoneNumberValidationError ||
    err instanceof SeoTitleValidationError ||
    err instanceof SeoDescriptionValidationError ||
    err instanceof SlugValidationError ||
    err instanceof HexColorValidationError ||
    err instanceof TimezoneValidationError ||
    err instanceof TimeOfDayValidationError ||
    err instanceof EmailValidationError
  ) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      code: err.code,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.BAD_REQUEST);
  }
}
