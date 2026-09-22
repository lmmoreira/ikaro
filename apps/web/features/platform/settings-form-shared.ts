import type { UpdateTenantSettingsRequest } from '@ikaro/types';
import { WEEK_DAYS, type WeekDay } from './settings-form';

export function parseIntStrict(value: string): number {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
}

export function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function buildBusinessHours(
  timezone: string,
  days: Record<WeekDay, { open: string; close: string; closed: boolean }>,
): NonNullable<UpdateTenantSettingsRequest['settings']['businessHours']> {
  return {
    timezone,
    ...(Object.fromEntries(
      WEEK_DAYS.map((day) => {
        const value = days[day];
        return [day, value.closed ? null : { open: value.open, close: value.close }];
      }),
    ) as Record<WeekDay, { open: string; close: string } | null>),
  };
}
