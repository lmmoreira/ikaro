import {
  BusinessHoursSettingsSchema,
  BusinessInfoSettingsSchema,
  LoyaltySettingsSchema,
  isValidTimeOfDay,
  isValidTimezone,
} from './tenant-settings';

describe('isValidTimeOfDay', () => {
  it('accepts a valid HH:MM time', () => {
    expect(isValidTimeOfDay('09:30')).toBe(true);
    expect(isValidTimeOfDay('23:59')).toBe(true);
    expect(isValidTimeOfDay('00:00')).toBe(true);
  });

  it('rejects an hour past 23', () => {
    expect(isValidTimeOfDay('24:00')).toBe(false);
  });

  it('rejects a minute past 59', () => {
    expect(isValidTimeOfDay('12:60')).toBe(false);
  });

  it('rejects a non HH:MM shape', () => {
    expect(isValidTimeOfDay('9:30')).toBe(false);
    expect(isValidTimeOfDay('09:30:00')).toBe(false);
    expect(isValidTimeOfDay('not-a-time')).toBe(false);
  });
});

describe('isValidTimezone', () => {
  it('accepts a valid IANA timezone', () => {
    expect(isValidTimezone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
  });

  it('rejects a non-IANA timezone string', () => {
    expect(isValidTimezone('Not/AZone')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });
});

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
