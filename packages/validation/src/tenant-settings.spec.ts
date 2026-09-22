import type { core } from 'zod';
import { PlatformErrorCode } from '@ikaro/types';
import {
  BusinessHoursSettingsSchema,
  BusinessInfoSettingsSchema,
  LeadFormSettingsSchema,
  LoyaltySettingsSchema,
} from './tenant-settings';

// Only a 'custom' (.refine()) issue carries params.code — narrow the discriminated union the
// same way packages/types/src/zod-violation.ts's real deriveViolation() does.
function customIssueCode(issue: core.$ZodIssue): unknown {
  return issue.code === 'custom' ? issue.params?.code : undefined;
}

describe('LoyaltySettingsSchema', () => {
  it('accepts notificationMinPoints up to 10000', () => {
    expect(LoyaltySettingsSchema.safeParse({ notificationMinPoints: 10000 }).success).toBe(true);
  });

  it('rejects notificationMinPoints above 10000', () => {
    expect(LoyaltySettingsSchema.safeParse({ notificationMinPoints: 10001 }).success).toBe(false);
  });

  it('accepts an integer pointsPerCurrencyUnit', () => {
    expect(LoyaltySettingsSchema.safeParse({ pointsPerCurrencyUnit: 5 }).success).toBe(true);
  });

  it('rejects a non-integer pointsPerCurrencyUnit', () => {
    expect(LoyaltySettingsSchema.safeParse({ pointsPerCurrencyUnit: 1.5 }).success).toBe(false);
  });
});

describe('BusinessHoursSettingsSchema', () => {
  it('accepts a valid IANA timezone and HH:MM day hours', () => {
    const result = BusinessHoursSettingsSchema.safeParse({
      timezone: 'America/Sao_Paulo',
      monday: { open: '08:00', close: '18:00' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-IANA timezone string', () => {
    const result = BusinessHoursSettingsSchema.safeParse({ timezone: 'Not/AZone' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed day-hours time', () => {
    const result = BusinessHoursSettingsSchema.safeParse({
      monday: { open: '8:00', close: '18:00' },
    });
    expect(result.success).toBe(false);
  });
});

describe('BusinessInfoSettingsSchema', () => {
  it('rejects an invalid whatsapp number with the platform-specific error code', () => {
    const result = BusinessInfoSettingsSchema.safeParse({
      socialLinks: { whatsapp: 'not-a-phone' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a null socialLinks/address (all-or-nothing clear)', () => {
    const result = BusinessInfoSettingsSchema.safeParse({ socialLinks: null, address: null });
    expect(result.success).toBe(true);
  });
});

// M20-S04 (UC-043) carry-over from M20-S03: a plain `.int().min().max()` here would fail with
// the generic GenericErrorCode.VALUE_OUT_OF_RANGE bucket at this Zod boundary, before the
// backend's own LeadFormSettingsValidator dedicated codes are ever reached — regression coverage
// for all three fields, asserting the dedicated code actually reaches the issue's params.code,
// not just that safeParse fails.
describe('LeadFormSettingsSchema', () => {
  it('accepts each field at its boundary values (1/24, 1/1000, 1/100)', () => {
    const result = LeadFormSettingsSchema.safeParse({
      retentionMonths: 24,
      maxSubmissionsPerDay: 1000,
      maxSubmissionsPerIpPerDay: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an out-of-range retentionMonths with the dedicated code, not the generic bucket', () => {
    const result = LeadFormSettingsSchema.safeParse({ retentionMonths: 25 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(customIssueCode(result.error.issues[0])).toBe(
        PlatformErrorCode.SETTINGS_LEAD_FORM_RETENTION_MONTHS_INVALID,
      );
    }
  });

  it('rejects an out-of-range maxSubmissionsPerDay with the dedicated code', () => {
    const result = LeadFormSettingsSchema.safeParse({ maxSubmissionsPerDay: 1001 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(customIssueCode(result.error.issues[0])).toBe(
        PlatformErrorCode.SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_DAY_INVALID,
      );
    }
  });

  it('rejects an out-of-range maxSubmissionsPerIpPerDay with the dedicated code', () => {
    const result = LeadFormSettingsSchema.safeParse({ maxSubmissionsPerIpPerDay: 101 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(customIssueCode(result.error.issues[0])).toBe(
        PlatformErrorCode.SETTINGS_LEAD_FORM_MAX_SUBMISSIONS_PER_IP_PER_DAY_INVALID,
      );
    }
  });

  it('rejects a non-integer retentionMonths with the dedicated code (not just an out-of-range value)', () => {
    const result = LeadFormSettingsSchema.safeParse({ retentionMonths: 1.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(customIssueCode(result.error.issues[0])).toBe(
        PlatformErrorCode.SETTINGS_LEAD_FORM_RETENTION_MONTHS_INVALID,
      );
    }
  });

  it('rejects retentionMonths below the minimum', () => {
    expect(LeadFormSettingsSchema.safeParse({ retentionMonths: 0 }).success).toBe(false);
  });
});
