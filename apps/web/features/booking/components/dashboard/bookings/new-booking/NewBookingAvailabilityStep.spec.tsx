// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AvailableSlot } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { NewBookingAvailabilityStep } from './NewBookingAvailabilityStep';

const carousel = vi.hoisted(() => vi.fn());
const slotPicker = vi.hoisted(() => vi.fn());

vi.mock('@/features/booking/components/public/AvailabilityCarousel', () => ({
  AvailabilityCarousel: (props: Record<string, unknown>) => {
    carousel(props);
    return <div data-testid="carousel" />;
  },
}));
vi.mock('@/features/booking/components/public/SlotPicker', () => ({
  SlotPicker: (props: Record<string, unknown>) => {
    slotPicker(props);
    return <div data-testid="slot-picker" />;
  },
}));

const SLOT: AvailableSlot = {
  startsAt: '2026-06-15T12:00:00.000Z',
  endsAt: '2026-06-15T12:30:00.000Z',
};

function renderStep(
  overrides: Partial<React.ComponentProps<typeof NewBookingAvailabilityStep>> = {},
) {
  const props = {
    slug: 'vitta',
    selectedServiceIds: ['svc-1'],
    selectedDate: null,
    selectedSlot: null,
    maxBookingAdvanceDays: 60,
    minBookingAdvanceHours: 2,
    timezone: 'America/Sao_Paulo',
    resourceSelections: [],
    error: null,
    onSelectDate: vi.fn(),
    onSelectSlot: vi.fn(),
    summary: null,
    onBack: vi.fn(),
    onNext: vi.fn(),
    ...overrides,
  };
  renderWithIntl(<NewBookingAvailabilityStep {...props} />);
  return props;
}

describe('NewBookingAvailabilityStep', () => {
  it('uses the dashboard variants and lets staff book inside the minimum notice', () => {
    renderStep({ selectedDate: '2026-06-15' });

    expect(carousel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variant: 'dashboard',
        minBookingAdvanceHours: 0,
        maxBookingAdvanceDays: 60,
      }),
    );
    expect(slotPicker).toHaveBeenLastCalledWith(
      expect.objectContaining({ variant: 'dashboard', noticeMarkerHours: 2 }),
    );
    expect(slotPicker.mock.calls.at(-1)![0]).not.toHaveProperty('minBookingAdvanceHours');
  });

  it('forwards the resource picks and the chosen duration to the availability reads', () => {
    renderStep({
      selectedDate: '2026-06-15',
      resourceSelections: [{ serviceId: 'svc-1', resourceType: 'STAFF', resourceId: 'r-1' }],
      durationMinutes: 90,
    });

    expect(carousel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        durationMinutes: 90,
        resourceSelections: [{ serviceId: 'svc-1', resourceType: 'STAFF', resourceId: 'r-1' }],
      }),
    );
  });

  it('lists the slots only after a date is picked, and explains the dot', () => {
    renderStep({ selectedDate: null });
    expect(screen.queryByTestId('slot-picker')).not.toBeInTheDocument();
  });

  it('explains the notice dot only when the business has a minimum notice', () => {
    renderStep({ selectedDate: '2026-06-15', minBookingAdvanceHours: 2 });
    expect(screen.getByTestId('notice-legend')).toHaveTextContent('2 h');
  });

  it('has no legend without a minimum notice', () => {
    renderStep({ selectedDate: '2026-06-15', minBookingAdvanceHours: 0 });
    expect(screen.queryByTestId('notice-legend')).not.toBeInTheDocument();
  });

  it('cannot continue before a slot is chosen', () => {
    renderStep();
    expect(screen.getAllByTestId('step-next')[0]).toBeDisabled();
  });

  it('continues with a slot chosen', () => {
    renderStep({ selectedDate: '2026-06-15', selectedSlot: SLOT });
    expect(screen.getAllByTestId('step-next')[0]).toBeEnabled();
  });

  it('shows the refusal that sent staff back to this step, with everything kept', () => {
    renderStep({ error: { message: 'Esse horário acabou de ser ocupado' } });
    expect(screen.getByTestId('step2-error')).toHaveTextContent(
      'Esse horário acabou de ser ocupado',
    );
  });
});
