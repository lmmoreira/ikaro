import {
  AddressErrorCode,
  AuthErrorCode,
  BffErrorCode,
  BookingErrorCode,
  CountryCodeErrorCode,
  CustomerErrorCode,
  EmailErrorCode,
  GenericErrorCode,
  HexColorErrorCode,
  LoyaltyErrorCode,
  MoneyErrorCode,
  PhoneErrorCode,
  PlatformErrorCode,
  SeoErrorCode,
  SlugErrorCode,
  StaffErrorCode,
  TimeOfDayErrorCode,
  TimezoneErrorCode,
} from '@ikaro/types';
import enErrors from '@ikaro/i18n/locales/en/errors.json';
import ptBrErrors from '@ikaro/i18n/locales/pt-BR/errors.json';
import { describe, expect, it } from 'vitest';

// Every per-origin catalog exported from packages/types/src/error-codes.ts (TD23 §3/§9). A new
// origin catalog must be added here too — this is the mechanical enforcement side of the
// "adding a new error" checklist in docs/ENGINEERING_RULES.md (TD23 Story 17).
const CATALOGS = {
  BookingErrorCode,
  CustomerErrorCode,
  StaffErrorCode,
  LoyaltyErrorCode,
  PlatformErrorCode,
  AddressErrorCode,
  CountryCodeErrorCode,
  PhoneErrorCode,
  MoneyErrorCode,
  SeoErrorCode,
  SlugErrorCode,
  HexColorErrorCode,
  TimezoneErrorCode,
  TimeOfDayErrorCode,
  EmailErrorCode,
  BffErrorCode,
  AuthErrorCode,
  GenericErrorCode,
} satisfies Record<string, Record<string, string>>;

const catalogCodes = new Set<string>(
  Object.values(CATALOGS).flatMap((catalog) => Object.values(catalog)),
);

function diff(locale: Record<string, string>): { missing: string[]; orphaned: string[] } {
  const localeCodes = new Set(Object.keys(locale));
  return {
    missing: [...catalogCodes].filter((code) => !localeCodes.has(code)).sort(),
    orphaned: [...localeCodes].filter((code) => !catalogCodes.has(code)).sort(),
  };
}

describe('error code catalog <-> translation exhaustiveness (TD23 Story 17)', () => {
  it('has a pt-BR translation for every catalog code, and no orphaned pt-BR keys', () => {
    expect(diff(ptBrErrors)).toEqual({ missing: [], orphaned: [] });
  });

  it('has an en translation for every catalog code, and no orphaned en keys', () => {
    expect(diff(enErrors)).toEqual({ missing: [], orphaned: [] });
  });
});
