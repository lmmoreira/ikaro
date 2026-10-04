// @vitest-environment jsdom
import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchServiceQuote } from '@/features/booking/api/public';
import type { ChosenDuration } from '@/features/booking/model/basket-lines';
import { makeHotsiteService, renderWithIntl } from '@/test-utils';
import { VariableDurationStep } from './VariableDurationStep';

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

interface HarnessProps {
  readonly initial?: ChosenDuration | null;
  readonly error?: { message: string } | null;
  readonly onNext?: () => void;
  readonly onBack?: () => void;
}

// Holds the duration state the way useBookingSelections does, so the step runs end to end.
function Harness({ initial = null, error = null, onNext, onBack }: HarnessProps) {
  const [duration, setDuration] = useState<ChosenDuration | null>(initial);
  return (
    <VariableDurationStep
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
      onBack={onBack ?? vi.fn()}
      onNext={onNext ?? vi.fn()}
    />
  );
}

describe('VariableDurationStep', () => {
  beforeEach(() => vi.mocked(fetchServiceQuote).mockReset());

  it('lists the durations from min to max in steps and a range hint', async () => {
    vi.mocked(fetchServiceQuote).mockResolvedValue(quote(60, 50));
    renderWithIntl(<Harness />);

    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['1h', '1h 30min', '2h']);
    expect(screen.getByText(/De 1h a 2h, em blocos de 30 min\./)).toBeInTheDocument();
    await screen.findByTestId('duration-total');
  });

  it('opens on the minimum duration with its server-quoted total and enables Próximo', async () => {
    vi.mocked(fetchServiceQuote).mockResolvedValue(quote(60, 50));
    renderWithIntl(<Harness />);

    expect(screen.getByTestId('duration-select')).toHaveValue('60');
    expect(await screen.findByTestId('duration-total')).toHaveTextContent('Total: R$ 50,00');
    expect(screen.getByText('O preço fica registrado na reserva.')).toBeInTheDocument();
    expect(fetchServiceQuote).toHaveBeenCalledWith('vitta', 'svc-room', 60);
    await waitFor(() => expect(screen.getByTestId('step-next')).toBeEnabled());
  });

  it('shows the quote loading state and keeps Próximo disabled until it resolves', async () => {
    let resolve: (value: ReturnType<typeof quote>) => void = () => undefined;
    vi.mocked(fetchServiceQuote).mockReturnValue(new Promise((done) => (resolve = done)));
    renderWithIntl(<Harness />);

    expect(await screen.findByTestId('duration-quote-loading')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByTestId('step-next')).toBeDisabled();

    resolve(quote(60, 50));

    await waitFor(() => expect(screen.getByTestId('step-next')).toBeEnabled());
  });

  it('re-requests the quote when the duration changes', async () => {
    vi.mocked(fetchServiceQuote).mockImplementation(async (_slug, _id, minutes) =>
      quote(minutes, minutes === 60 ? 50 : 75),
    );
    const user = userEvent.setup();
    renderWithIntl(<Harness />);
    await screen.findByTestId('duration-total');

    await user.selectOptions(screen.getByTestId('duration-select'), '90');

    await waitFor(() =>
      expect(screen.getByTestId('duration-total')).toHaveTextContent('Total: R$ 75,00'),
    );
    expect(fetchServiceQuote).toHaveBeenLastCalledWith('vitta', 'svc-room', 90);
  });

  it('fails closed when the quote fails: error with retry, Próximo disabled, retry recovers', async () => {
    vi.mocked(fetchServiceQuote).mockRejectedValueOnce(new Error('boom'));
    vi.mocked(fetchServiceQuote).mockResolvedValueOnce(quote(60, 50));
    const user = userEvent.setup();
    renderWithIntl(<Harness />);

    expect(await screen.findByText('Não foi possível calcular o total.')).toBeInTheDocument();
    expect(screen.getByTestId('step-next')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(screen.getByTestId('step-next')).toBeEnabled());
  });

  it('does not preselect a duration while the step shows an out-of-range error', () => {
    renderWithIntl(<Harness error={{ message: 'A duração escolhida está fora do permitido.' }} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A duração escolhida está fora do permitido.',
    );
    expect(screen.getByTestId('duration-select')).toHaveValue('');
    expect(screen.getByTestId('step-next')).toBeDisabled();
    expect(fetchServiceQuote).not.toHaveBeenCalled();
  });

  it('shows no date, time or participant input', async () => {
    vi.mocked(fetchServiceQuote).mockResolvedValue(quote(60, 50));
    renderWithIntl(<Harness />);
    await screen.findByTestId('duration-total');

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/data|hora|participante/i)).not.toBeInTheDocument();
  });

  it('navigates with Voltar and Próximo', async () => {
    vi.mocked(fetchServiceQuote).mockResolvedValue(quote(60, 50));
    const onNext = vi.fn();
    const onBack = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<Harness onNext={onNext} onBack={onBack} />);
    await waitFor(() => expect(screen.getByTestId('step-next')).toBeEnabled());

    await user.click(screen.getByTestId('step-next'));
    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('says so when the service has no configured durations', () => {
    const incomplete = makeHotsiteService({
      bookingPolicy: {
        ...service.bookingPolicy,
        durationMinMinutes: null,
      },
    });
    renderWithIntl(
      <VariableDurationStep
        slug="vitta"
        service={incomplete}
        duration={null}
        error={null}
        onChooseDuration={vi.fn()}
        onQuoted={vi.fn()}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(screen.getByText('Não há durações disponíveis para este serviço.')).toBeInTheDocument();
    expect(screen.getByTestId('step-next')).toBeDisabled();
  });
});
