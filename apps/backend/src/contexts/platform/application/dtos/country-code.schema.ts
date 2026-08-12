import { z } from 'zod';
import { CountryCodeErrorCode } from '@ikaro/types/protocol/errors';
import { COUNTRY_CODE_FORMAT_PATTERN } from '@ikaro/validation';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';

/**
 * Shared by every DTO in this context that accepts a country code: format check first
 * (generic FORMAT_INVALID, native Zod issue), then the full semantic check via the
 * `CountryCode` VO (CountryCodeErrorCode.UNSUPPORTED). Two stages instead of one
 * `.refine(CountryCode.isValid)` call so a malformed code and a well-formed-but-unsupported
 * one report distinct codes.
 */
export const CountryCodeSchema = z
  .string()
  .trim()
  .regex(COUNTRY_CODE_FORMAT_PATTERN, {
    message: 'countryCode must be a 2-letter ISO 3166-1 alpha-2 code',
  })
  .toUpperCase()
  .refine(CountryCode.isValid, {
    error: 'countryCode must be a supported country code',
    params: { code: CountryCodeErrorCode.UNSUPPORTED },
  });
