// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailabilityResponse, DaySummary } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import {
  fetchAvailability,
  fetchAvailabilitySummary,
} from '@/features/platform/hotsite/api/schedule';
import { AvailabilityStep } from './AvailabilityStep';

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

  describe('"Avise-me quando abrir" (M23-S31)', () => {
    const HREF = '/lavacar-beloauto/booking/availability-alert?serviceId=svc-1';

    it('puts the alert button in the nav row between Voltar and Próximo', async () => {
      vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
      renderWithIntl(
        <AvailabilityStep {...baseProps()} datePickerType="carousel" alertHref={HREF} />,
      );
      await screen.findAllByTestId('day-option');

      const back = screen.getByRole('button', { name: 'Voltar' });
      const alert = screen.getByTestId('availability-alert-entry');
      const next = screen.getByTestId('step-next');

      expect(alert).toHaveAttribute('href', HREF);
      expect(back.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(alert.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('renders no alert button when no alert can be offered', async () => {
      vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
      renderWithIntl(
        <AvailabilityStep {...baseProps()} datePickerType="carousel" alertHref={null} />,
      );
      await screen.findAllByTestId('day-option');

      expect(screen.queryByTestId('availability-alert-entry')).not.toBeInTheDocument();
    });

    it('stays visible while the availability is still loading', () => {
      vi.mocked(fetchAvailabilitySummary).mockReturnValue(new Promise(() => undefined));
      renderWithIntl(
        <AvailabilityStep {...baseProps()} datePickerType="carousel" alertHref={HREF} />,
      );

      expect(screen.getByTestId('availability-alert-entry')).toBeInTheDocument();
    });

    it('stays visible when the availability fails to load', async () => {
      vi.mocked(fetchAvailabilitySummary).mockRejectedValue(new Error('boom'));
      renderWithIntl(
        <AvailabilityStep {...baseProps()} datePickerType="carousel" alertHref={HREF} />,
      );

      await screen.findByRole('alert');
      expect(screen.getByTestId('availability-alert-entry')).toBeInTheDocument();
    });

    it('stays visible after a slot conflict sends the customer back to this step', () => {
      vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
      renderWithIntl(
        <AvailabilityStep
          {...baseProps()}
          datePickerType="carousel"
          alertHref={HREF}
          error={{ message: 'Horário indisponível' }}
        />,
      );

      expect(screen.getByTestId('availability-alert-entry')).toBeInTheDocument();
    });

    it('also shows in the calendar date picker', () => {
      vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
      renderWithIntl(
        <AvailabilityStep {...baseProps()} datePickerType="calendar" alertHref={HREF} />,
      );

      expect(screen.getByTestId('availability-alert-entry')).toBeInTheDocument();
    });
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
