// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RecurrenceRule, RecurringBookingScheduleListItem } from '@ikaro/types';
import { useRecurrenceText } from './use-recurrence-text';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    formatDate: (date: Date) => date.toISOString().slice(0, 10),
  }),
}));

const rule = (daysOfWeek: RecurrenceRule['daysOfWeek']): RecurrenceRule => ({
  frequency: 'WEEKLY',
  daysOfWeek,
  startTime: '10:00',
  durationMinutes: 120,
});

describe('useRecurrenceText', () => {
  it('names a single weekday with its own "every …" key and the time range', () => {
    const { result } = renderHook(() => useRecurrenceText());

    expect(result.current.recurrenceLine(rule(['tuesday']))).toBe(
      'recurrenceLine:{"days":"everyTuesday","from":"10:00","to":"12:00"}',
    );
  });

  it('lists several weekdays Monday-first, joined as a sentence, under "weekly on"', () => {
    const { result } = renderHook(() => useRecurrenceText());

    const line = result.current.recurrenceLine(rule(['friday', 'monday', 'wednesday']));

    expect(line).toContain('weeklyOn');
    expect(line).toContain('shortMonday, shortWednesday, and shortFriday');
    expect(line).not.toContain('everyMonday');
  });

  it('formats a date key as the same calendar day', () => {
    const { result } = renderHook(() => useRecurrenceText());

    expect(result.current.formatDateKey('2026-11-11')).toBe('2026-11-11');
  });

  it('shows "until" for a running schedule and a range for any other', () => {
    const { result } = renderHook(() => useRecurrenceText());
    const base: RecurringBookingScheduleListItem = {
      id: 's',
      customerId: 'c',
      serviceId: 'sv',
      serviceName: 'Sala',
      recurrence: rule(['tuesday']),
      startsOn: '2026-08-19',
      endsOn: '2026-11-11',
      status: 'ACTIVE',
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceIds: [],
      approvalHoldExpiresAt: null,
    };

    expect(result.current.termText(base)).toBe('termUntil:{"date":"2026-11-11"}');
    expect(result.current.termText({ ...base, status: 'ENDED' })).toBe(
      'termRange:{"start":"2026-08-19","end":"2026-11-11"}',
    );
  });
});
