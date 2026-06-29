// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DaySummary } from '@ikaro/types';
import { fetchAvailabilitySummary } from '@/lib/api/schedule';
import { AvailabilityCarousel } from './AvailabilityCarousel';

vi.mock('@/lib/api/schedule', () => ({
  fetchAvailabilitySummary: vi.fn(),
  fetchAvailability: vi.fn(),
}));

function renderCarousel(overrides?: Partial<Parameters<typeof AvailabilityCarousel>[0]>) {
  return renderWithIntl(
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

function getDayOption(date: string): HTMLElement {
  const all = screen.getAllByTestId('day-option');
  const found = all.find((el) => el.getAttribute('data-date') === date);
  if (!found) throw new Error(`day-option with data-date="${date}" not found`);
  return found;
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

    await screen.findAllByTestId('day-option');
    expect(getDayOption('2026-06-15')).toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.getByText('ter.')).toBeInTheDocument();
  });

  it('disables day cards with available: false', async () => {
    const days: DaySummary[] = [
      { date: '2026-06-15', available: true, slotCount: 5 },
      { date: '2026-06-17', available: false, slotCount: 0 },
    ];
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue(days);

    renderCarousel();

    await screen.findAllByTestId('day-option');
    expect(getDayOption('2026-06-17')).toBeDisabled();
    expect(getDayOption('2026-06-15')).not.toBeDisabled();
  });

  it('calls onSelectDate when an available day card is clicked', async () => {
    const user = userEvent.setup();
    const days: DaySummary[] = [{ date: '2026-06-15', available: true, slotCount: 5 }];
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue(days);
    const onSelectDate = vi.fn();

    renderCarousel({ onSelectDate });

    await user.click(await screen.findAllByTestId('day-option').then((els) => els[0]));

    expect(onSelectDate).toHaveBeenCalledWith('2026-06-15');
  });

  it('highlights the selected day card', async () => {
    const days: DaySummary[] = [{ date: '2026-06-15', available: true, slotCount: 5 }];
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue(days);

    renderCarousel({ selectedDate: '2026-06-15' });

    await screen.findAllByTestId('day-option');
    expect(getDayOption('2026-06-15')).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses dashboard rounded button styling when requested', async () => {
    const days: DaySummary[] = [{ date: '2026-06-15', available: true, slotCount: 5 }];
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue(days);

    renderCarousel({ selectedDate: '2026-06-15', variant: 'dashboard' });

    await screen.findAllByTestId('day-option');
    expect(getDayOption('2026-06-15')).toHaveStyle({ borderRadius: '0.75rem' });
  });

  it('shows an error message with a retry button when the fetch fails', async () => {
    vi.mocked(fetchAvailabilitySummary).mockRejectedValue(new Error('network error'));

    renderCarousel();

    expect(
      await screen.findByText('Não foi possível carregar a disponibilidade'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(fetchAvailabilitySummary).toHaveBeenCalledTimes(2);
  });

  it('scrolls the carousel when the navigation buttons are used', async () => {
    const scrollBy = vi.fn();
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([
      { date: '2026-06-15', available: true, slotCount: 5 },
      { date: '2026-06-16', available: true, slotCount: 3 },
    ]);

    const { container } = renderCarousel();

    await screen.findAllByTestId('day-option');
    const scrollContainer = container.querySelector('.overflow-x-auto');
    if (!scrollContainer) {
      throw new Error('scroll container not found');
    }
    Object.defineProperty(scrollContainer, 'scrollBy', {
      value: scrollBy,
      configurable: true,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Dias anteriores' }));
    await userEvent.click(screen.getByRole('button', { name: 'Próximos dias' }));

    expect(scrollBy).toHaveBeenNthCalledWith(1, { left: -240, behavior: 'smooth' });
    expect(scrollBy).toHaveBeenNthCalledWith(2, { left: 240, behavior: 'smooth' });
  });

  it('shows a fully booked message when all days in the window are unavailable', async () => {
    const days: DaySummary[] = [
      { date: '2026-06-15', available: false, slotCount: 0 },
      { date: '2026-06-16', available: false, slotCount: 0 },
    ];
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue(days);

    renderCarousel({ carouselDays: 14 });

    expect(await screen.findByTestId('fully-booked-message')).toHaveTextContent(
      'Nenhum horário disponível nos próximos dias',
    );
    await screen.findAllByTestId('day-option');
    expect(getDayOption('2026-06-15')).toBeDisabled();
  });

  it('shows the fully booked message regardless of carouselDays value', async () => {
    const days: DaySummary[] = [{ date: '2026-06-15', available: false, slotCount: 0 }];
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue(days);

    renderCarousel({ carouselDays: 30 });

    expect(await screen.findByTestId('fully-booked-message')).toHaveTextContent(
      'Nenhum horário disponível nos próximos dias',
    );
  });
});
