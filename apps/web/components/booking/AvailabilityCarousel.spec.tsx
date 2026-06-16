// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DaySummary } from '@beloauto/types';
import { fetchAvailabilitySummary } from '@/lib/api/schedule';
import { AvailabilityCarousel } from './AvailabilityCarousel';

vi.mock('@/lib/api/schedule', () => ({
  fetchAvailabilitySummary: vi.fn(),
  fetchAvailability: vi.fn(),
}));

function renderCarousel(overrides?: Partial<Parameters<typeof AvailabilityCarousel>[0]>) {
  return render(
    <AvailabilityCarousel
      slug="lavacar-beloauto"
      serviceIds={['svc-1']}
      selectedDate={null}
      onSelectDate={vi.fn()}
      carouselDays={14}
      {...overrides}
    />,
  );
}

describe('AvailabilityCarousel', () => {
  afterEach(() => {
    vi.mocked(fetchAvailabilitySummary).mockReset();
  });

  it('shows a loading message while fetching', () => {
    vi.mocked(fetchAvailabilitySummary).mockReturnValue(new Promise(() => {}));

    renderCarousel();

    expect(screen.getByText('Carregando disponibilidade...')).toBeInTheDocument();
  });

  it('renders day cards with weekday labels, marking the first as "Hoje"', async () => {
    const days: DaySummary[] = [
      { date: '2026-06-15', available: true, slotCount: 5 },
      { date: '2026-06-16', available: true, slotCount: 3 },
      { date: '2026-06-17', available: false, slotCount: 0 },
    ];
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue(days);

    renderCarousel();

    expect(await screen.findByTestId('day-card-2026-06-15')).toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.getByText('Ter')).toBeInTheDocument();
  });

  it('disables day cards with available: false', async () => {
    const days: DaySummary[] = [
      { date: '2026-06-15', available: true, slotCount: 5 },
      { date: '2026-06-17', available: false, slotCount: 0 },
    ];
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue(days);

    renderCarousel();

    expect(await screen.findByTestId('day-card-2026-06-17')).toBeDisabled();
    expect(screen.getByTestId('day-card-2026-06-15')).not.toBeDisabled();
  });

  it('calls onSelectDate when an available day card is clicked', async () => {
    const user = userEvent.setup();
    const days: DaySummary[] = [{ date: '2026-06-15', available: true, slotCount: 5 }];
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue(days);
    const onSelectDate = vi.fn();

    renderCarousel({ onSelectDate });

    await user.click(await screen.findByTestId('day-card-2026-06-15'));

    expect(onSelectDate).toHaveBeenCalledWith('2026-06-15');
  });

  it('highlights the selected day card', async () => {
    const days: DaySummary[] = [{ date: '2026-06-15', available: true, slotCount: 5 }];
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue(days);

    renderCarousel({ selectedDate: '2026-06-15' });

    expect(await screen.findByTestId('day-card-2026-06-15')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows an error message when the fetch fails', async () => {
    vi.mocked(fetchAvailabilitySummary).mockRejectedValue(new Error('network error'));

    renderCarousel();

    expect(
      await screen.findByText('Não foi possível carregar a disponibilidade. Tente novamente.'),
    ).toBeInTheDocument();
  });

  it('shows a fully booked message when all days in the window are unavailable', async () => {
    const days: DaySummary[] = [
      { date: '2026-06-15', available: false, slotCount: 0 },
      { date: '2026-06-16', available: false, slotCount: 0 },
    ];
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue(days);

    renderCarousel({ carouselDays: 14 });

    expect(await screen.findByTestId('fully-booked-message')).toHaveTextContent(
      'Nenhum horário disponível nos próximos 14 dias.',
    );
    expect(screen.getByTestId('day-card-2026-06-15')).toBeDisabled();
  });

  it('uses the configured carouselDays value in the fully booked message', async () => {
    const days: DaySummary[] = [{ date: '2026-06-15', available: false, slotCount: 0 }];
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue(days);

    renderCarousel({ carouselDays: 30 });

    expect(await screen.findByTestId('fully-booked-message')).toHaveTextContent(
      'Nenhum horário disponível nos próximos 30 dias.',
    );
  });
});
