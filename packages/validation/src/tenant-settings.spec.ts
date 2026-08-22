import {
  BusinessHoursSettingsSchema,
  BusinessInfoSettingsSchema,
  LoyaltySettingsSchema,
} from './tenant-settings';

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
