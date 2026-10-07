// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingRescheduleOptions } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ReschedulePicker } from './ReschedulePicker';

const carouselProps = vi.fn();
const slotPickerProps = vi.fn();

vi.mock('@/features/booking/components/public/AvailabilityCarousel', () => ({
  AvailabilityCarousel: (props: Record<string, unknown>) => {
    carouselProps(props);
    return <div data-testid="carousel" />;
  },
}));

vi.mock('@/features/booking/components/public/SlotPicker', () => ({
  SlotPicker: (props: Record<string, unknown>) => {
    slotPickerProps(props);
    return <div data-testid="slot-picker" />;
  },
}));

const RESCHEDULE: BookingRescheduleOptions = {
  eligibleUntil: '2030-06-18T13:00:00.000Z',
  serviceIds: ['svc-1'],
  resourceSelections: [
    { serviceId: 'svc-1', legIndex: null, resourceType: 'STAFF', resourceId: 'res-1' },
  ],
  durationMinutes: 90,
  window: { minAdvanceHours: 12, maxAdvanceDays: 30 },
  keptPicks: [],
};

function renderPicker(
  reschedule: BookingRescheduleOptions = RESCHEDULE,
  selectedDate: string | null = '2030-06-20',
) {
  renderWithIntl(
    <ReschedulePicker
      tenantSlug="lavacar-bh"
      reschedule={reschedule}
      selectedDate={selectedDate}
      selectedSlot={null}
      onSelectDate={vi.fn()}
      onSelectSlot={vi.fn()}
    />,
  );
}

describe('ReschedulePicker', () => {
  beforeEach(() => {
    carouselProps.mockClear();
    slotPickerProps.mockClear();
  });

  it('pins the kept picks, the kept duration and the effective window on both pickers', () => {
    renderPicker();

    for (const props of [carouselProps.mock.calls[0]![0], slotPickerProps.mock.calls[0]![0]]) {
      expect(props).toMatchObject({
        slug: 'lavacar-bh',
        serviceIds: ['svc-1'],
        resourceSelections: RESCHEDULE.resourceSelections,
        durationMinutes: 90,
        minBookingAdvanceHours: 12,
        variant: 'dashboard',
      });
    }
    expect(carouselProps.mock.calls[0]![0]).toMatchObject({
      maxBookingAdvanceDays: 30,
      carouselDays: 14,
      timezone: 'America/Sao_Paulo',
    });
  });

  it('omits the pins when the booking has no kept pick and a fixed duration', () => {
    renderPicker({ ...RESCHEDULE, resourceSelections: [], durationMinutes: null });

    expect(slotPickerProps.mock.calls[0]![0].resourceSelections).toBeUndefined();
    expect(slotPickerProps.mock.calls[0]![0].durationMinutes).toBeUndefined();
  });

  it('offers no slot list until a day is chosen', () => {
    renderPicker(RESCHEDULE, null);

    expect(screen.getByTestId('carousel')).toBeInTheDocument();
    expect(screen.queryByTestId('slot-picker')).not.toBeInTheDocument();
    expect(screen.queryByText('Horários disponíveis')).not.toBeInTheDocument();
  });

  it('labels the date and slot sections and notes the duration and price are unchanged', () => {
    renderPicker();

    expect(screen.getByText('Escolha a nova data')).toBeInTheDocument();
    expect(screen.getByText('Horários disponíveis')).toBeInTheDocument();
    expect(
      screen.getByText('Seu serviço continua com a mesma duração e o mesmo valor.'),
    ).toBeInTheDocument();
  });
});
