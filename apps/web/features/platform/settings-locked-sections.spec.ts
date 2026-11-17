import { describe, expect, it } from 'vitest';
import {
  SETTINGS_SECTION_FEATURE,
  lockedSettingsSections,
  withoutLockedSettings,
} from './settings-locked-sections';

describe('lockedSettingsSections', () => {
  it('locks exactly the sections whose feature is locked', () => {
    expect(lockedSettingsSections(['LOYALTY'])).toEqual({ loyalty: 'LOYALTY' });
    expect(lockedSettingsSections(['BOOKING', 'LEAD_FORM'])).toEqual({
      booking: 'BOOKING',
      leadForm: 'LEAD_FORM',
    });
  });

  it.each(Object.entries(SETTINGS_SECTION_FEATURE))(
    'locks the %s section when %s is locked, and only then',
    (section, feature) => {
      expect(lockedSettingsSections([feature])).toHaveProperty(section, feature);
      expect(lockedSettingsSections([])).not.toHaveProperty(section);
    },
  );

  it('locks nothing when no feature is locked, or when only HOTSITE is (the page itself)', () => {
    expect(lockedSettingsSections([])).toEqual({});
    expect(lockedSettingsSections(['HOTSITE'])).toEqual({});
  });
});

describe('withoutLockedSettings', () => {
  const settings = {
    booking: { cancellationWindowHours: 24 },
    loyalty: { expiryDays: 180 },
    chatbot: { knowledgeText: 'Aceitamos Pix.' },
    leadForm: { retentionMonths: 12 },
    businessInfo: { phone: null },
  };

  it('drops only the locked sections and leaves every other key untouched', () => {
    expect(withoutLockedSettings(settings, ['loyalty', 'chatbot'])).toEqual({
      booking: { cancellationWindowHours: 24 },
      leadForm: { retentionMonths: 12 },
      businessInfo: { phone: null },
    });
  });

  it('drops all four lockable sections and still keeps what no feature owns', () => {
    expect(withoutLockedSettings(settings, Object.keys(SETTINGS_SECTION_FEATURE))).toEqual({
      businessInfo: { phone: null },
    });
  });

  it('returns every key when nothing is locked, without mutating its input', () => {
    const snapshot = JSON.stringify(settings);

    expect(withoutLockedSettings(settings, [])).toEqual(settings);
    expect(JSON.stringify(settings)).toBe(snapshot);
  });
});
