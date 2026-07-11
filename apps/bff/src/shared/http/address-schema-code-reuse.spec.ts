import { AddressErrorCode, PhoneErrorCode, SeoErrorCode } from '@ikaro/types';
import { RequestBookingBodySchema } from '../../features/booking/bookings.controller';
import { UpdateCustomerProfileBodySchema } from '../../features/customer/customers.controller';
import { UpdateTenantSettingsBodySchema } from '../../features/platform/tenant-settings.controller';
import { UpdateHotsiteContentBodySchema } from '../../features/platform/hotsite-admin.controller';

/**
 * TD23 Story 10's core acceptance criterion: all 3 BFF AddressSchema copies (bookings,
 * customers, tenant-settings) — plus the phone/email/SEO fields that independently
 * duplicate a VO rule — must emit the SAME code the backend VO would for the identical
 * failure, regardless of which layer catches it first.
 */
describe('BFF Address/Phone/Email/SEO code reuse (TD23 Story 10)', () => {
  it('bookings AddressSchema: empty street reuses AddressErrorCode.FIELD_REQUIRED', () => {
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
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'contactAddress.street');
      const params = issue as unknown as { params?: { code?: string } };
      expect(params.params?.code).toBe(AddressErrorCode.FIELD_REQUIRED);
    }
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
});
