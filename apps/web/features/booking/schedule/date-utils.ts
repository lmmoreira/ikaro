import { z } from 'zod';
import type { TenantBusinessHours, TenantDayHours } from '@ikaro/types';
import { addDays, toISODate } from '@/shared/lib/formatting/date-utils';

export type WeekDayKey = keyof Omit<TenantBusinessHours, 'timezone'>;

const WEEKDAY_KEYS: readonly WeekDayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

// Same calendar-aware rule the BFF/backend enforce on every date param (TD42).
const DATE_KEY_SCHEMA = z.iso.date();

export function isValidDateKey(dateKey: string): boolean {
  return DATE_KEY_SCHEMA.safeParse(dateKey).success;
}

export function getWeekStartKey(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const offset = (date.getUTCDay() + 6) % 7;
  return toISODate(addDays(date, -offset));
}

export function getWeekEndKey(dateKey: string): string {
  return toISODate(addDays(parseDateKey(dateKey), 6));
}

export function getWeekDates(weekStartKey: string): string[] {
  const weekStart = parseDateKey(weekStartKey);
  return Array.from({ length: 7 }, (_, index) => toISODate(addDays(weekStart, index)));
}

export function getWeekdayKey(dateKey: string): WeekDayKey {
  const day = parseDateKey(dateKey).getUTCDay();
  return WEEKDAY_KEYS[day === 0 ? 6 : day - 1];
}

export function getDayHoursForDate(
  dateKey: string,
  businessHours: TenantBusinessHours,
): TenantDayHours | null {
  return businessHours[getWeekdayKey(dateKey)];
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function getLocalTimeKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
