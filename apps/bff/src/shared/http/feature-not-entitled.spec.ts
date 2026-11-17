import { HttpException, HttpStatus } from '@nestjs/common';
import { BillingErrorCode } from '@ikaro/types';
import { isFeatureNotEntitled } from './feature-not-entitled';

describe('isFeatureNotEntitled', () => {
  it('matches the typed 403 for a missing feature', () => {
    const err = new HttpException(
      { code: BillingErrorCode.FEATURE_NOT_ENTITLED },
      HttpStatus.FORBIDDEN,
    );
    expect(isFeatureNotEntitled(err)).toBe(true);
  });

  it('does not match a suspension denial, which is also a 403', () => {
    const err = new HttpException(
      { code: BillingErrorCode.TENANT_SUSPENDED },
      HttpStatus.FORBIDDEN,
    );
    expect(isFeatureNotEntitled(err)).toBe(false);
  });

  it('does not match the same code on another status', () => {
    const err = new HttpException(
      { code: BillingErrorCode.FEATURE_NOT_ENTITLED },
      HttpStatus.BAD_REQUEST,
    );
    expect(isFeatureNotEntitled(err)).toBe(false);
  });

  it.each([new Error('boom'), 'text', null, undefined])('does not match %p', (err) => {
    expect(isFeatureNotEntitled(err)).toBe(false);
  });
});
