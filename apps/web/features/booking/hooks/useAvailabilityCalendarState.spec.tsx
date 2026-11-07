// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DaySummary } from '@ikaro/types';
import { fetchAvailabilitySummary } from '@/features/platform/hotsite/api/schedule';
import { useAvailabilityCalendarState } from './useAvailabilityCalendarState';

vi.mock('@/features/platform/hotsite/api/schedule', () => ({
  fetchAvailabilitySummary: vi.fn(),
}));

type CalendarProps = Parameters<typeof useAvailabilityCalendarState>[0];

function day(date: string, available = true): DaySummary {
  return { date, available, slotCount: available ? 3 : 0 };
}

function renderCalendar(overrides: Partial<CalendarProps> = {}) {
  const onSelectDate = vi.fn();
  const initialProps: CalendarProps = {
    slug: 'lavacar',
    serviceIds: ['svc-1'],
    selectedDate: null,
    onSelectDate,
    maxBookingAdvanceDays: 90,
    timezone: 'UTC',
    ...overrides,
  };
  const view = renderHook((props: CalendarProps) => useAvailabilityCalendarState(props), {
    initialProps,
  });
  return { ...view, onSelectDate };
}

function pending<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('useAvailabilityCalendarState', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(fetchAvailabilitySummary).mockReset();
  });

  describe('the booking window', () => {
    it('opens on the month of the tenant-local today, which can differ from the UTC date', async () => {
      vi.setSystemTime(new Date('2026-06-30T23:30:00.000Z'));

      const { result } = renderCalendar({ timezone: 'Pacific/Auckland' });
      await waitFor(() => expect(result.current.days).toEqual([]));

      expect(result.current.month.getMonth()).toBe(6); // July: already 2026-07-01 in Auckland
      expect(result.current.startMonth.getMonth()).toBe(6);
    });

    it('asks for the visible month clamped forward to the first bookable day', async () => {
      renderCalendar();

      await waitFor(() => expect(fetchAvailabilitySummary).toHaveBeenCalledTimes(1));

      expect(fetchAvailabilitySummary).toHaveBeenCalledWith(
        'lavacar',
        '2026-06-15',
        '2026-06-30',
        ['svc-1'],
        { resourceSelections: undefined, durationMinutes: undefined },
      );
    });

    it('moves the first bookable day by the minimum notice', async () => {
      renderCalendar({ minBookingAdvanceHours: 24 });

      await waitFor(() => expect(fetchAvailabilitySummary).toHaveBeenCalledTimes(1));

      expect(vi.mocked(fetchAvailabilitySummary).mock.calls[0].slice(1, 3)).toEqual([
        '2026-06-16',
        '2026-06-30',
      ]);
    });

    it('clamps the end of the span to the last bookable day', async () => {
      renderCalendar({ maxBookingAdvanceDays: 5 });

      await waitFor(() => expect(fetchAvailabilitySummary).toHaveBeenCalledTimes(1));

      expect(vi.mocked(fetchAvailabilitySummary).mock.calls[0].slice(1, 3)).toEqual([
        '2026-06-15',
        '2026-06-19',
      ]);
    });

    it('passes the flow parameters through to the request', async () => {
      renderCalendar({ resourceSelections: [], durationMinutes: 90 });

      await waitFor(() => expect(fetchAvailabilitySummary).toHaveBeenCalledTimes(1));

      expect(vi.mocked(fetchAvailabilitySummary).mock.calls[0][4]).toEqual({
        resourceSelections: [],
        durationMinutes: 90,
      });
    });

    it('exposes the bounds the picker needs, and the selected day as a local date', () => {
      const { result } = renderCalendar({ selectedDate: '2026-06-20' });

      expect(result.current.endMonth).toEqual(new Date('2026-09-12T00:00:00'));
      expect(result.current.selected).toEqual(new Date('2026-06-20T00:00:00'));
    });

    it('has no selected day until one is chosen', () => {
      const { result } = renderCalendar();

      expect(result.current.selected).toBeUndefined();
    });
  });

  describe('loading the days', () => {
    it('is loading until the fetch resolves, then holds the days', async () => {
      const june = pending<DaySummary[]>();
      vi.mocked(fetchAvailabilitySummary).mockReturnValue(june.promise);
      const { result } = renderCalendar();
      expect(result.current.days).toBeUndefined();

      await act(async () => june.resolve([day('2026-06-20')]));

      expect(result.current.days).toEqual([day('2026-06-20')]);
      expect(result.current.error).toBe(false);
    });

    it('reports an error when the fetch fails, and refetches on retry', async () => {
      vi.mocked(fetchAvailabilitySummary).mockRejectedValueOnce(new Error('network'));
      const { result } = renderCalendar();
      await waitFor(() => expect(result.current.error).toBe(true));

      act(() => result.current.handleRetry());
      expect(result.current.days).toBeUndefined();

      await waitFor(() => expect(result.current.days).toEqual([]));
      expect(result.current.error).toBe(false);
      expect(fetchAvailabilitySummary).toHaveBeenCalledTimes(2);
    });

    it('asks for the new month when the month changes', async () => {
      const { result } = renderCalendar();
      await waitFor(() => expect(result.current.days).toEqual([]));

      act(() => result.current.handleMonthChange(new Date(2026, 6, 1)));

      await waitFor(() => expect(fetchAvailabilitySummary).toHaveBeenCalledTimes(2));
      expect(vi.mocked(fetchAvailabilitySummary).mock.calls[1].slice(1, 3)).toEqual([
        '2026-07-01',
        '2026-07-31',
      ]);
    });

    it('treats a month with nothing bookable as empty and asks for nothing', async () => {
      const { result } = renderCalendar({ maxBookingAdvanceDays: 10 });
      await waitFor(() => expect(result.current.days).toEqual([]));

      act(() => result.current.handleMonthChange(new Date(2026, 8, 1)));

      expect(result.current.days).toEqual([]);
      expect(result.current.error).toBe(false);
      expect(fetchAvailabilitySummary).toHaveBeenCalledTimes(1);
    });

    it('does not show the previous month while the new month is loading', async () => {
      const july = pending<DaySummary[]>();
      vi.mocked(fetchAvailabilitySummary)
        .mockResolvedValueOnce([day('2026-06-20')])
        .mockReturnValueOnce(july.promise);
      const { result } = renderCalendar();
      await waitFor(() => expect(result.current.days).toEqual([day('2026-06-20')]));

      act(() => result.current.handleMonthChange(new Date(2026, 6, 1)));

      expect(result.current.days).toBeUndefined();
      await act(async () => july.resolve([day('2026-07-02')]));
      expect(result.current.days).toEqual([day('2026-07-02')]);
    });

    it('ignores a slow response for a month the visitor has already left', async () => {
      const june = pending<DaySummary[]>();
      vi.mocked(fetchAvailabilitySummary)
        .mockReturnValueOnce(june.promise)
        .mockResolvedValueOnce([day('2026-07-02')]);
      const { result } = renderCalendar();

      act(() => result.current.handleMonthChange(new Date(2026, 6, 1)));
      await waitFor(() => expect(result.current.days).toEqual([day('2026-07-02')]));
      await act(async () => june.resolve([day('2026-06-20')]));

      expect(result.current.days).toEqual([day('2026-07-02')]);
    });

    it('ignores a failure that arrives after the visitor left the month', async () => {
      const june = pending<DaySummary[]>();
      vi.mocked(fetchAvailabilitySummary)
        .mockReturnValueOnce(june.promise)
        .mockResolvedValueOnce([day('2026-07-02')]);
      const { result } = renderCalendar();

      act(() => result.current.handleMonthChange(new Date(2026, 6, 1)));
      await waitFor(() => expect(result.current.days).toEqual([day('2026-07-02')]));
      await act(async () => june.reject(new Error('late failure')));

      expect(result.current.error).toBe(false);
      expect(result.current.days).toEqual([day('2026-07-02')]);
    });
  });

  describe('which days are disabled', () => {
    const DAYS = [day('2026-06-20', false), day('2026-06-21', true)];

    async function renderWithDays() {
      vi.mocked(fetchAvailabilitySummary).mockResolvedValue(DAYS);
      const view = renderCalendar();
      await waitFor(() => expect(view.result.current.days).toEqual(DAYS));
      return view;
    }

    it('disables a day before the first bookable day', async () => {
      const { result } = await renderWithDays();

      expect(result.current.isDisabled(new Date(2026, 5, 14))).toBe(true);
    });

    it('disables a day the backend reports as unavailable and keeps an available one enabled', async () => {
      const { result } = await renderWithDays();

      expect(result.current.isDisabled(new Date(2026, 5, 20))).toBe(true);
      expect(result.current.isDisabled(new Date(2026, 5, 21))).toBe(false);
    });

    it('treats a day beyond the booking window as out of range but not disabled', async () => {
      const { result } = await renderWithDays();
      const beyond = new Date(2026, 8, 20);

      expect(result.current.isOutOfRange(beyond)).toBe(true);
      expect(result.current.isDisabled(beyond)).toBe(false);
      expect(result.current.isOutOfRange(new Date(2026, 5, 21))).toBe(false);
    });
  });

  describe('choosing a day', () => {
    it('reports the chosen day as a local ISO date and shows no notice', async () => {
      const { result, onSelectDate } = renderCalendar();
      await waitFor(() => expect(result.current.days).toEqual([]));

      act(() => result.current.handleSelect(new Date(2026, 5, 21)));

      expect(onSelectDate).toHaveBeenCalledWith('2026-06-21');
      expect(result.current.showOutOfRangeMessage).toBe(false);
    });

    it('ignores a click that carries no day', async () => {
      const { result, onSelectDate } = renderCalendar();
      await waitFor(() => expect(result.current.days).toEqual([]));

      act(() => result.current.handleSelect(undefined));

      expect(onSelectDate).not.toHaveBeenCalled();
    });

    it('shows the booking-window notice instead of selecting a day beyond it', async () => {
      const { result, onSelectDate } = renderCalendar();
      await waitFor(() => expect(result.current.days).toEqual([]));

      act(() => result.current.handleSelect(new Date(2026, 8, 20)));

      expect(onSelectDate).not.toHaveBeenCalled();
      expect(result.current.showOutOfRangeMessage).toBe(true);
    });

    it('clears the notice on the next valid choice', async () => {
      const { result } = renderCalendar();
      await waitFor(() => expect(result.current.days).toEqual([]));
      act(() => result.current.handleSelect(new Date(2026, 8, 20)));

      act(() => result.current.handleSelect(new Date(2026, 5, 21)));

      expect(result.current.showOutOfRangeMessage).toBe(false);
    });

    it('does not bring the notice back when the visitor returns to the month', async () => {
      const { result } = renderCalendar();
      await waitFor(() => expect(result.current.days).toEqual([]));
      act(() => result.current.handleSelect(new Date(2026, 8, 20)));
      expect(result.current.showOutOfRangeMessage).toBe(true);

      act(() => result.current.handleMonthChange(new Date(2026, 6, 1)));
      expect(result.current.showOutOfRangeMessage).toBe(false);
      act(() => result.current.handleMonthChange(new Date(2026, 5, 1)));

      expect(result.current.showOutOfRangeMessage).toBe(false);
    });
  });
});
