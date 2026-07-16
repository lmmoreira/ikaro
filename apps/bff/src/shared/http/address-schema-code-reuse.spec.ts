import {
  AddressErrorCode,
  CountryCodeErrorCode,
  PhoneErrorCode,
  SeoErrorCode,
  TimeOfDayErrorCode,
} from '@ikaro/types';
import { RequestBookingBodySchema } from '../../features/booking/bookings.controller';
import { UpdateCustomerProfileBodySchema } from '../../features/customer/customers.controller';
import { UpdateTenantSettingsBodySchema } from '../../features/platform/tenant-settings.controller';
import { UpdateHotsiteContentBodySchema } from '../../features/platform/hotsite-admin.controller';

/**
 * TD23 Story 10's core acceptance criterion: a BFF check that duplicates a backend VO's own
 * rule must emit the SAME code the VO would for the identical failure, regardless of which
 * layer catches it first. As of TD11, the Address/Phone/Email/hotsite schemas these tests
 * exercise are no longer independently duplicated at all — both apps import the same
 * `@ikaro/validation` schemas, so these tests now guard the shared package's behavior at
 * each BFF call site rather than two independently-drifting copies. Covers 1 of the 2
 * `AddressSchema` variants (customers, required+coded) — bookings' `AddressShapeSchema` still
 * has no required-field check (TD23 Story 13 removed it: the backend's `Address.create()`
 * already validates required-ness with equal-or-better granularity via `params.field`, and a
 * BFF-side check only produced a second, incompatible error shape for the same failure — see
 * `@ikaro/validation`'s `address.ts` for the full rationale). tenant-settings'
 * `PartialAddressSchema` is deliberately excluded from FIELD_REQUIRED assertions: every field
 * there is `.nullable()` (genuinely optional), so `AddressErrorCode.FIELD_REQUIRED` would
 * misrepresent a field that isn't actually required; it keeps generic codes instead. Also
 * covers phone/email/SEO/hex-color/timezone/country-code fields that reuse a VO's code outside
 * the Address shape, including the businessInfo.phone/.email/socialLinks.whatsapp checks TD11
 * added (previously unvalidated at the BFF).
 */
describe('BFF Address/Phone/Email/SEO code reuse (TD23 Story 10)', () => {
  it('bookings AddressSchema: empty street is accepted by the BFF, deferring to the backend (TD23 Story 13)', () => {
    const result = RequestBookingBodySchema.safeParse({
      contactEmail: 'joao@example.com',
      contactName: 'João',
      contactPhone: '+5511999999999',
      scheduledAt: '2026-06-15T10:00:00.000Z',
      serviceIds: ['30000000-0000-4000-8000-000000000001'],
      contactAddress: {
        street: '',
        number: '10',
        city: 'Belo Horizonte',
        state: 'MG',
        zipCode: '30000-000',
      },
    });
    expect(result.success).toBe(true);
  });

  it('customers AddressSchema: empty zipCode reuses AddressErrorCode.FIELD_REQUIRED', () => {
    const result = UpdateCustomerProfileBodySchema.safeParse({
      defaultAddress: {
        street: 'Rua A',
        number: '1',
        city: 'BH',
        state: 'MG',
        zipCode: '',
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'defaultAddress.zipCode');
      const params = issue as unknown as { params?: { code?: string } };
      expect(params.params?.code).toBe(AddressErrorCode.FIELD_REQUIRED);
    }
  });

  it('bookings contactPhone reuses PhoneErrorCode.FORMAT_INVALID', () => {
    const result = RequestBookingBodySchema.safeParse({
      contactEmail: 'joao@example.com',
      contactName: 'João',
      contactPhone: '123',
      scheduledAt: '2026-06-15T10:00:00.000Z',
      serviceIds: ['30000000-0000-4000-8000-000000000001'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'contactPhone');
      const params = issue as unknown as { params?: { code?: string } };
      expect(params.params?.code).toBe(PhoneErrorCode.FORMAT_INVALID);
    }
  });

  it('bookings contactEmail (z.email()) reuses EmailErrorCode.FORMAT_INVALID', () => {
    const result = RequestBookingBodySchema.safeParse({
      contactEmail: 'not-an-email',
      contactName: 'João',
      contactPhone: '+5511999999999',
      scheduledAt: '2026-06-15T10:00:00.000Z',
      serviceIds: ['30000000-0000-4000-8000-000000000001'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'contactEmail');
      expect((issue as unknown as { code: string }).code).toBe('invalid_format');
      // EmailErrorCode is applied by the pipe's deriveViolation(), not carried on the raw
      // ZodIssue itself (z.email() has no params mechanism) — verified in
      // zod-validation.pipe.spec.ts's dedicated invalid_format/email test.
    }
  });

  it('tenant-settings "at least one field" reuses the same PlatformErrorCode.SETTINGS_UPDATE_EMPTY as the backend', () => {
    const result = UpdateTenantSettingsBodySchema.safeParse({ settings: {} });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0] as unknown as { params?: { code?: string } };
      expect(issue.params?.code).toBe('PLATFORM_SETTINGS_UPDATE_EMPTY');
    }
  });

  it('hotsite SEO title over 60 chars reuses SeoErrorCode.TITLE_TOO_LONG', () => {
    const result = UpdateHotsiteContentBodySchema.safeParse({
      seo: { title: 'a'.repeat(61) },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'seo.title');
      const params = issue as unknown as { params?: { code?: string } };
      expect(params.params?.code).toBe(SeoErrorCode.TITLE_TOO_LONG);
    }
  });

  it('tenant-settings businessHours DayHoursSchema.open reuses TimeOfDayErrorCode.FORMAT_INVALID', () => {
    const result = UpdateTenantSettingsBodySchema.safeParse({
      settings: { businessHours: { monday: { open: '25:00', close: '18:00' } } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join('.') === 'settings.businessHours.monday.open',
      );
      const params = issue as unknown as { params?: { code?: string } };
      expect(params.params?.code).toBe(TimeOfDayErrorCode.FORMAT_INVALID);
    }
  });

  it('tenant-settings LocalizationSchema.countryCode reuses CountryCodeErrorCode.FORMAT_INVALID', () => {
    const result = UpdateTenantSettingsBodySchema.safeParse({
      settings: { localization: { countryCode: '1' } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join('.') === 'settings.localization.countryCode',
      );
      const params = issue as unknown as { params?: { code?: string } };
      expect(params.params?.code).toBe(CountryCodeErrorCode.FORMAT_INVALID);
    }
  });

  it('tenant-settings businessInfo address fields stay generic (genuinely optional, not FIELD_REQUIRED)', () => {
    const result = UpdateTenantSettingsBodySchema.safeParse({
      settings: {
        businessInfo: { address: { street: '', number: '1', city: 'BH', state: '', zipCode: '' } },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join('.') === 'settings.businessInfo.address.state',
      );
      const params = issue as unknown as { params?: { code?: string } };
      // Not AddressErrorCode.FIELD_REQUIRED — this field is nullable/optional, so an empty
      // string (once provided) falls to the generic bucket rather than misrepresenting it
      // as "required".
      expect(params.params?.code).not.toBe(AddressErrorCode.FIELD_REQUIRED);
    }
  });

  // TD11: businessInfo.phone/.email and socialLinks.whatsapp had no format validation at all
  // at the BFF before this migration (bare z.string().nullable()) — an invalid value round-
  // tripped to the backend before being rejected there. Reuses the backend's own
  // BusinessInfoValidator codes, not the generic PhoneErrorCode/EmailErrorCode.
  it('tenant-settings businessInfo.phone rejects an invalid format with SETTINGS_BUSINESS_PHONE_INVALID', () => {
    const result = UpdateTenantSettingsBodySchema.safeParse({
      settings: { businessInfo: { phone: 'not-a-phone' } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join('.') === 'settings.businessInfo.phone',
      );
      const params = issue as unknown as { params?: { code?: string } };
      expect(params.params?.code).toBe('PLATFORM_SETTINGS_BUSINESS_PHONE_INVALID');
    }
  });

  it('tenant-settings businessInfo.email rejects an invalid format with SETTINGS_BUSINESS_EMAIL_INVALID', () => {
    const result = UpdateTenantSettingsBodySchema.safeParse({
      settings: { businessInfo: { email: 'not-an-email' } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join('.') === 'settings.businessInfo.email',
      );
      const params = issue as unknown as { params?: { code?: string } };
      expect(params.params?.code).toBe('PLATFORM_SETTINGS_BUSINESS_EMAIL_INVALID');
    }
  });

  it('tenant-settings businessInfo.phone accepts a valid E.164 number', () => {
    const result = UpdateTenantSettingsBodySchema.safeParse({
      settings: { businessInfo: { phone: '+5511912345678' } },
    });
    expect(result.success).toBe(true);
  });

  it('tenant-settings businessInfo.phone accepts null (clears the field)', () => {
    const result = UpdateTenantSettingsBodySchema.safeParse({
      settings: { businessInfo: { phone: null } },
    });
    expect(result.success).toBe(true);
  });

  it('tenant-settings socialLinks.whatsapp rejects an invalid format with SETTINGS_SOCIAL_WHATSAPP_INVALID', () => {
    const result = UpdateTenantSettingsBodySchema.safeParse({
      settings: { businessInfo: { socialLinks: { whatsapp: 'not-a-phone' } } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path.join('.') === 'settings.businessInfo.socialLinks.whatsapp',
      );
      const params = issue as unknown as { params?: { code?: string } };
      expect(params.params?.code).toBe('PLATFORM_SETTINGS_SOCIAL_WHATSAPP_INVALID');
    }
  });

  it('tenant-settings socialLinks.whatsapp accepts null (clears the field)', () => {
    const result = UpdateTenantSettingsBodySchema.safeParse({
      settings: {
        businessInfo: { socialLinks: { whatsapp: null, instagram: null, facebook: null } },
      },
    });
    expect(result.success).toBe(true);
  });
});
