import { describe, expect, it } from 'vitest';
import type { TenantBusinessHours } from '@ikaro/types';
import {
  getDayHoursForDate,
  getLocalTimeKey,
  getWeekDates,
  getWeekEndKey,
  getWeekStartKey,
  isValidDateKey,
  getWeekdayKey,
  minutesToTime,
  overlaps,
  parseDateKey,
  timeToMinutes,
} from './date-utils';

const businessHours: TenantBusinessHours = {
  timezone: 'America/Sao_Paulo',
  monday: { open: '09:00', close: '18:00' },
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

describe('schedule date utils', () => {
  it('resolves the week start and end for a date', () => {
    expect(getWeekStartKey('2026-07-08')).toBe('2026-07-06');
    expect(getWeekEndKey('2026-07-06')).toBe('2026-07-12');
    expect(getWeekDates('2026-07-06')).toEqual([
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
    ]);
  });

  it('maps a date to the matching business-hours day', () => {
    expect(getWeekdayKey('2026-07-06')).toBe('monday');
    expect(getWeekdayKey('2026-07-12')).toBe('sunday');
    expect(getDayHoursForDate('2026-07-06', businessHours)).toEqual({
      open: '09:00',
      close: '18:00',
    });
    expect(getDayHoursForDate('2026-07-07', businessHours)).toBeNull();
  });

  it('validates real calendar dates instead of only the date-key shape', () => {
    expect(isValidDateKey('2026-07-06')).toBe(true);
    expect(isValidDateKey('2026-07-32')).toBe(false);
    expect(isValidDateKey('2026-02-30')).toBe(false);
  });

  it('converts minutes and local time keys consistently', () => {
    expect(timeToMinutes('09:30')).toBe(570);
    expect(minutesToTime(570)).toBe('09:30');
    expect(getLocalTimeKey(new Date('2026-07-06T12:00:00.000Z'), 'America/Sao_Paulo')).toBe(
      '09:00',
    );
  });

  it('detects overlapping time ranges', () => {
    expect(overlaps(540, 600, 570, 630)).toBe(true);
    expect(overlaps(540, 600, 600, 660)).toBe(false);
  });

  it('parses date keys as UTC dates', () => {
    expect(parseDateKey('2026-07-06').toISOString()).toBe('2026-07-06T00:00:00.000Z');
  });
});
