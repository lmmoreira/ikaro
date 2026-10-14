// @vitest-environment jsdom
import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchServiceQuote } from '@/features/booking/api/public';
import type { ChosenDuration } from '@/features/booking/model/basket-lines';
import { makeHotsiteService, renderWithIntl } from '@/test-utils';
import { NewBookingDurationStep } from './NewBookingDurationStep';

vi.mock('@/features/booking/api/public', () => ({ fetchServiceQuote: vi.fn() }));

const service = makeHotsiteService({
  id: 'svc-room',
  name: 'Sala de reunião',
  bookingPolicy: {
    ...makeHotsiteService().bookingPolicy,
    durationPolicy: 'CUSTOMER_SELECTED',
    durationMinMinutes: 60,
    durationMaxMinutes: 120,
    durationIncrementMinutes: 30,
    pricingPolicy: 'PER_TIME_INCREMENT',
    pricingIncrementMinutes: 60,
    pricePerIncrementAmount: 50,
  },
});

const quote = (durationMinutes: number, amount: number) => ({
  durationMinutes,
  price: { amount, currency: 'BRL' },
});

// Holds the duration state the way useBookingSelections does, so the step runs end to end.
function Harness({
  error = null,
  onNext = vi.fn(),
}: {
  readonly error?: { message: string } | null;
  readonly onNext?: () => void;
}) {
  const [duration, setDuration] = useState<ChosenDuration | null>(null);
  return (
    <NewBookingDurationStep
      slug="vitta"
      service={service}
      duration={duration}
      error={error}
      onChooseDuration={(minutes) => setDuration({ minutes, quotedAmount: null })}
      onQuoted={(minutes, amount) =>
        setDuration((current) =>
          current?.minutes === minutes ? { minutes, quotedAmount: amount } : current,
        )
      }
      summary={null}
      onBack={vi.fn()}
      onNext={onNext}
    />
  );
}

describe('NewBookingDurationStep', () => {
  beforeEach(() => vi.mocked(fetchServiceQuote).mockReset());

  it('lists the durations from min to max and opens on the minimum with its server quote', async () => {
    vi.mocked(fetchServiceQuote).mockResolvedValue(quote(60, 50));
    renderWithIntl(<Harness />);

    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      '1h',
      '1h 30min',
      '2h',
    ]);
    expect(await screen.findByTestId('duration-total')).toHaveTextContent('Total: R$ 50,00');
    expect(screen.getByTestId('duration-select')).toHaveValue('60');
  });

  it('only lets staff continue on a duration whose quote has arrived', async () => {
    let resolveQuote: (value: ReturnType<typeof quote>) => void = () => undefined;
    vi.mocked(fetchServiceQuote).mockReturnValue(
      new Promise((resolve) => {
        resolveQuote = resolve;
      }),
    );
    renderWithIntl(<Harness />);

    expect(screen.getAllByTestId('step-next')[0]).toBeDisabled();
    resolveQuote(quote(60, 50));

    await screen.findByTestId('duration-total');
    await waitFor(() => expect(screen.getAllByTestId('step-next')[0]).toBeEnabled());
  });

  it('re-quotes when another duration is chosen', async () => {
    vi.mocked(fetchServiceQuote).mockImplementation((_slug, _id, minutes) =>
      Promise.resolve(quote(minutes, minutes === 120 ? 100 : 50)),
    );
    renderWithIntl(<Harness />);
    await screen.findByTestId('duration-total');

    await userEvent.selectOptions(screen.getByTestId('duration-select'), '120');

    expect(await screen.findByText('Total: R$ 100,00')).toBeInTheDocument();
  });

  it('fails closed with a retry when the quote cannot be loaded', async () => {
    vi.mocked(fetchServiceQuote).mockRejectedValueOnce(new Error('down'));
    vi.mocked(fetchServiceQuote).mockResolvedValue(quote(60, 50));
    renderWithIntl(<Harness />);

    expect(await screen.findByTestId('duration-quote-error')).toBeInTheDocument();
    expect(screen.getAllByTestId('step-next')[0]).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByTestId('duration-total')).toBeInTheDocument();
  });

  it('shows a server refusal sent back to this step, without replacing it with a default', () => {
    renderWithIntl(<Harness error={{ message: 'Duração fora do limite' }} />);

    expect(screen.getByTestId('duration-error')).toHaveTextContent('Duração fora do limite');
    expect(screen.getByTestId('duration-select')).toHaveValue('');
    expect(fetchServiceQuote).not.toHaveBeenCalled();
  });
});
