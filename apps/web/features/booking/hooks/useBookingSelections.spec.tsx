// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeHotsiteService } from '@/test-utils';
import { useBookingSelections } from './useBookingSelections';

const a = makeHotsiteService({ id: 'a' });
const b = makeHotsiteService({ id: 'b' });
const slot = { startsAt: '2026-06-15T12:00:00.000Z', endsAt: '2026-06-15T13:00:00.000Z' };

describe('useBookingSelections', () => {
  it('toggles services and exposes the selected service objects in selection order', () => {
    const { result } = renderHook(() => useBookingSelections([a, b]));

    act(() => result.current.toggleService('b'));
    act(() => result.current.toggleService('a'));
    expect(result.current.selectedServiceIds).toEqual(['b', 'a']);
    expect(result.current.selectedServices.map((s) => s.id)).toEqual(['a', 'b']);

    act(() => result.current.toggleService('b'));
    expect(result.current.selectedServiceIds).toEqual(['a']);
  });

  it('resets the date, slot, picks and intake answers when the services change', () => {
    const { result } = renderHook(() => useBookingSelections([a, b]));
    act(() => {
      result.current.selectDate('2026-06-15');
      result.current.selectSlot(slot);
      result.current.setPicks([
        { serviceId: 'a', legIndex: null, resourceType: 'STAFF', resourceId: 'r' },
      ]);
      result.current.setIntake({
        answers: { q: 'x' },
        participantCount: '2',
        attendees: [],
        consentAccepted: true,
      });
    });

    act(() => result.current.toggleService('a'));

    expect(result.current.selectedDate).toBeNull();
    expect(result.current.selectedSlot).toBeNull();
    expect(result.current.picks).toEqual([]);
    expect(result.current.intake.consentAccepted).toBe(false);
    expect(result.current.intake.answers).toEqual({});
  });

  it('selecting a date clears the slot, selecting a slot keeps the date', () => {
    const { result } = renderHook(() => useBookingSelections([a]));
    act(() => result.current.selectDate('2026-06-15'));
    act(() => result.current.selectSlot(slot));
    expect(result.current.selectedSlot).toEqual(slot);

    act(() => result.current.selectDate('2026-06-16'));

    expect(result.current.selectedDate).toBe('2026-06-16');
    expect(result.current.selectedSlot).toBeNull();
  });

  it('choosing a duration drops its quote and the date and slot searched with the old one', () => {
    const { result } = renderHook(() => useBookingSelections([a]));
    act(() => result.current.selectDate('2026-06-15'));
    act(() => result.current.selectSlot(slot));
    act(() => result.current.chooseDuration(60));
    act(() => result.current.setQuotedAmount(60, 50));
    expect(result.current.duration).toEqual({ minutes: 60, quotedAmount: 50 });

    act(() => result.current.chooseDuration(90));

    expect(result.current.duration).toEqual({ minutes: 90, quotedAmount: null });
    expect(result.current.selectedDate).toBeNull();
    expect(result.current.selectedSlot).toBeNull();
  });

  it('ignores a quote that arrives for a duration the customer has since replaced', () => {
    const { result } = renderHook(() => useBookingSelections([a]));
    act(() => result.current.chooseDuration(60));
    act(() => result.current.chooseDuration(90));

    act(() => result.current.setQuotedAmount(60, 50));

    expect(result.current.duration).toEqual({ minutes: 90, quotedAmount: null });
  });

  it('clearing the duration also clears the slot, and a services change clears the duration', () => {
    const { result } = renderHook(() => useBookingSelections([a, b]));
    act(() => result.current.chooseDuration(60));
    act(() => result.current.selectSlot(slot));

    act(() => result.current.clearDuration());
    expect(result.current.duration).toBeNull();
    expect(result.current.selectedSlot).toBeNull();

    act(() => result.current.chooseDuration(60));
    act(() => result.current.toggleService('a'));
    expect(result.current.duration).toBeNull();
  });

  it('clears only the slot', () => {
    const { result } = renderHook(() => useBookingSelections([a]));
    act(() => result.current.selectDate('2026-06-15'));
    act(() => result.current.selectSlot(slot));

    act(() => result.current.clearSlot());

    expect(result.current.selectedSlot).toBeNull();
    expect(result.current.selectedDate).toBe('2026-06-15');
  });
});

describe('useBookingSelections — deep-link seed', () => {
  const seed = { serviceId: 'a', date: '2026-06-20', durationMinutes: null, resourceId: null };

  it('starts exactly as before without a seed', () => {
    const { result } = renderHook(() => useBookingSelections([a, b], null));

    expect(result.current.selectedServiceIds).toEqual([]);
    expect(result.current.selectedDate).toBeNull();
    expect(result.current.duration).toBeNull();
    expect(result.current.picks).toEqual([]);
  });

  it('starts with the link’s service ticked and its day selected', () => {
    const { result } = renderHook(() => useBookingSelections([a, b], seed));

    expect(result.current.selectedServiceIds).toEqual(['a']);
    expect(result.current.selectedServices.map((s) => s.id)).toEqual(['a']);
    expect(result.current.selectedDate).toBe('2026-06-20');
    expect(result.current.selectedSlot).toBeNull();
  });

  it('starts with the link’s duration without clearing its day', () => {
    const { result } = renderHook(() =>
      useBookingSelections([a, b], { ...seed, durationMinutes: 90 }),
    );

    expect(result.current.duration).toEqual({ minutes: 90, quotedAmount: null });
    expect(result.current.selectedDate).toBe('2026-06-20');
  });

  it('lets the customer change the seeded selection like any other', () => {
    const { result } = renderHook(() => useBookingSelections([a, b], seed));

    act(() => result.current.toggleService('b'));

    expect(result.current.selectedServiceIds).toEqual(['a', 'b']);
    expect(result.current.selectedDate).toBeNull();
  });
});
