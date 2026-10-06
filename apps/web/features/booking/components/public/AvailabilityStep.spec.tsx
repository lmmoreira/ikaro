// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailabilityResponse, DaySummary } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import {
  fetchAvailability,
  fetchAvailabilitySummary,
} from '@/features/platform/hotsite/api/schedule';
import { AvailabilityStep } from './AvailabilityStep';

// The fixtures use fixed 2026-06-15 slots; the picker hides a slot that has already started, so the
// clock is pinned to the morning of that day.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

vi.mock('@/features/platform/hotsite/api/schedule', () => ({
  fetchAvailabilitySummary: vi.fn(),
  fetchAvailability: vi.fn(),
}));

const day: DaySummary = { date: '2026-06-15', available: true, slotCount: 1 };
const slot = { startsAt: '2026-06-15T12:00:00.000Z', endsAt: '2026-06-15T13:00:00.000Z' };
const availability: AvailabilityResponse = { date: '2026-06-15', available: true, slots: [slot] };

function baseProps() {
  return {
    slug: 'lavacar-beloauto',
    selectedServiceIds: ['svc-1'],
    selectedDate: null as string | null,
    selectedSlot: null,
    carouselDays: 14,
    maxBookingAdvanceDays: 30,
    minBookingAdvanceHours: 0,
    timezone: 'UTC',
    onSelectDate: vi.fn(),
    onSelectSlot: vi.fn(),
    error: null,
    onBack: vi.fn(),
    onNext: vi.fn(),
  };
}

describe('AvailabilityStep', () => {
  beforeEach(() => {
    vi.mocked(fetchAvailabilitySummary).mockReset();
    vi.mocked(fetchAvailability).mockReset();
  });

  it('renders the carousel day picker when datePickerType is "carousel"', async () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
    renderWithIntl(<AvailabilityStep {...baseProps()} datePickerType="carousel" />);

    expect(await screen.findAllByTestId('day-option')).not.toHaveLength(0);
  });

  it('does not render the carousel day picker when datePickerType is "calendar"', async () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
    renderWithIntl(<AvailabilityStep {...baseProps()} datePickerType="calendar" />);

    expect(screen.queryByTestId('day-option')).not.toBeInTheDocument();
  });

  it('shows the slot picker once a date is selected', async () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
    vi.mocked(fetchAvailability).mockResolvedValue(availability);
    renderWithIntl(
      <AvailabilityStep {...baseProps()} datePickerType="carousel" selectedDate="2026-06-15" />,
    );

    expect(await screen.findByTestId('time-slot')).toBeInTheDocument();
  });

  it('shows the step2 error when present', () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
    renderWithIntl(
      <AvailabilityStep
        {...baseProps()}
        datePickerType="carousel"
        error={{ message: 'Erro no passo 2' }}
      />,
    );

    expect(screen.getByTestId('step2-error')).toHaveTextContent('Erro no passo 2');
  });

  it('disables the next button until a slot is selected, then calls onNext when clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
    const onNext = vi.fn();
    const { rerender } = renderWithIntl(
      <AvailabilityStep {...baseProps()} datePickerType="carousel" onNext={onNext} />,
    );

    expect(screen.getByTestId('step-next')).toBeDisabled();

    rerender(
      <AvailabilityStep
        {...baseProps()}
        datePickerType="carousel"
        onNext={onNext}
        selectedSlot={slot}
      />,
    );
    await user.click(screen.getByTestId('step-next'));

    expect(onNext).toHaveBeenCalled();
  });

  it('calls onBack when the back button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
    const onBack = vi.fn();
    renderWithIntl(<AvailabilityStep {...baseProps()} datePickerType="carousel" onBack={onBack} />);

    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(onBack).toHaveBeenCalled();
  });

  it('forwards the resource picks and the duration to the summary and the slot queries', async () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
    vi.mocked(fetchAvailability).mockResolvedValue(availability);
    const picks = [
      { serviceId: 'svc-1', legIndex: null, resourceType: 'STAFF' as const, resourceId: 'r-1' },
    ];
    renderWithIntl(
      <AvailabilityStep
        {...baseProps()}
        datePickerType="carousel"
        selectedDate="2026-06-15"
        resourceSelections={picks}
        durationMinutes={90}
      />,
    );

    await screen.findByTestId('time-slot');

    const flow = { resourceSelections: picks, durationMinutes: 90 };
    expect(fetchAvailabilitySummary).toHaveBeenCalledWith(
      'lavacar-beloauto',
      expect.any(String),
      expect.any(String),
      ['svc-1'],
      flow,
    );
    expect(fetchAvailability).toHaveBeenCalledWith(
      'lavacar-beloauto',
      '2026-06-15',
      ['svc-1'],
      flow,
    );
  });

  it('re-fetches the slot list when a pick changes', async () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
    vi.mocked(fetchAvailability).mockResolvedValue(availability);
    const pick = (resourceId: string) => [
      { serviceId: 'svc-1', legIndex: null, resourceType: 'STAFF' as const, resourceId },
    ];
    const props = {
      ...baseProps(),
      datePickerType: 'carousel' as const,
      selectedDate: '2026-06-15',
    };
    const { rerender } = renderWithIntl(
      <AvailabilityStep {...props} resourceSelections={pick('r-1')} />,
    );
    await screen.findByTestId('time-slot');

    rerender(<AvailabilityStep {...props} resourceSelections={pick('r-2')} />);

    await vi.waitFor(() => expect(fetchAvailability).toHaveBeenCalledTimes(2));
  });
});
