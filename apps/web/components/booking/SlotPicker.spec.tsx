// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AvailabilityResponse } from '@ikaro/types';
import { fetchAvailability } from '@/lib/api/schedule';
import { SlotPicker } from './SlotPicker';

vi.mock('@/lib/api/schedule', () => ({
  fetchAvailabilitySummary: vi.fn(),
  fetchAvailability: vi.fn(),
}));

describe('SlotPicker', () => {
  afterEach(() => {
    vi.mocked(fetchAvailability).mockReset();
  });

  it('shows a loading message while fetching', () => {
    vi.mocked(fetchAvailability).mockReturnValue(new Promise(() => {}));

    renderWithIntl(
      <SlotPicker
        slug="lavacar-beloauto"
        serviceIds={['svc-1']}
        date="2026-06-15"
        selectedSlot={null}
        onSelectSlot={vi.fn()}
      />,
    );

    expect(screen.getByText('Carregando horários...')).toBeInTheDocument();
  });

  it('renders slot buttons formatted as HH:mm–HH:mm', async () => {
    const availability: AvailabilityResponse = {
      date: '2026-06-15',
      available: true,
      slots: [{ startsAt: '2026-06-15T12:00:00.000Z', endsAt: '2026-06-15T13:00:00.000Z' }],
    };
    vi.mocked(fetchAvailability).mockResolvedValue(availability);

    renderWithIntl(
      <SlotPicker
        slug="lavacar-beloauto"
        serviceIds={['svc-1']}
        date="2026-06-15"
        selectedSlot={null}
        onSelectSlot={vi.fn()}
      />,
    );

    expect(await screen.findByText('09:00–10:00')).toBeInTheDocument();
  });

  it('shows a pt-BR empty state when there are no slots', async () => {
    vi.mocked(fetchAvailability).mockResolvedValue({
      date: '2026-06-15',
      available: false,
      slots: [],
    });

    renderWithIntl(
      <SlotPicker
        slug="lavacar-beloauto"
        serviceIds={['svc-1']}
        date="2026-06-15"
        selectedSlot={null}
        onSelectSlot={vi.fn()}
      />,
    );

    expect(await screen.findByText('Nenhum horário disponível')).toBeInTheDocument();
  });

  it('calls onSelectSlot when a slot button is clicked', async () => {
    const user = userEvent.setup();
    const slot = { startsAt: '2026-06-15T12:00:00.000Z', endsAt: '2026-06-15T13:00:00.000Z' };
    vi.mocked(fetchAvailability).mockResolvedValue({
      date: '2026-06-15',
      available: true,
      slots: [slot],
    });
    const onSelectSlot = vi.fn();

    renderWithIntl(
      <SlotPicker
        slug="lavacar-beloauto"
        serviceIds={['svc-1']}
        date="2026-06-15"
        selectedSlot={null}
        onSelectSlot={onSelectSlot}
      />,
    );

    await user.click(await screen.findByText('09:00–10:00'));

    expect(onSelectSlot).toHaveBeenCalledWith(slot);
  });

  it('marks the selected slot as pressed', async () => {
    const slot = { startsAt: '2026-06-15T12:00:00.000Z', endsAt: '2026-06-15T13:00:00.000Z' };
    vi.mocked(fetchAvailability).mockResolvedValue({
      date: '2026-06-15',
      available: true,
      slots: [slot],
    });

    renderWithIntl(
      <SlotPicker
        slug="lavacar-beloauto"
        serviceIds={['svc-1']}
        date="2026-06-15"
        selectedSlot={slot}
        onSelectSlot={vi.fn()}
      />,
    );

    expect(await screen.findByText('09:00–10:00')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an error message with a retry button when the fetch fails', async () => {
    vi.mocked(fetchAvailability).mockRejectedValue(new Error('network error'));

    renderWithIntl(
      <SlotPicker
        slug="lavacar-beloauto"
        serviceIds={['svc-1']}
        date="2026-06-15"
        selectedSlot={null}
        onSelectSlot={vi.fn()}
      />,
    );

    expect(
      await screen.findByText('Não foi possível carregar os horários para este dia.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
