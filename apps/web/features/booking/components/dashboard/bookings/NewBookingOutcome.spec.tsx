// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BookingResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { NewBookingCreatedOutcome, NewBookingFailureOutcome } from './NewBookingOutcome';

const BOOKING = { bookingId: 'b-42', status: 'APPROVED' } as BookingResponse;

describe('NewBookingCreatedOutcome', () => {
  it('says the booking exists, approved, and who is told', () => {
    renderWithIntl(
      <NewBookingCreatedOutcome
        booking={BOOKING}
        recipientName="Ana Costa"
        recap={<p>Recap</p>}
        whenText="segunda, 15 de junho · 09:00"
      />,
    );

    expect(screen.getByTestId('outcome-banner-title')).toHaveTextContent('Agendamento criado');
    expect(screen.getByText(/segunda, 15 de junho · 09:00/)).toBeInTheDocument();
    expect(screen.getByText(/Ana Costa recebe um e-mail/)).toBeInTheDocument();
    expect(screen.getByText('Recap')).toBeInTheDocument();
  });

  it('offers the booking, another one, and the agenda', () => {
    renderWithIntl(
      <NewBookingCreatedOutcome booking={BOOKING} recipientName="Ana" recap={null} whenText="x" />,
    );

    expect(screen.getAllByRole('link', { name: 'Ver agendamento' })[0]).toHaveAttribute(
      'href',
      '/dashboard/bookings/b-42',
    );
    expect(screen.getAllByRole('link', { name: 'Criar outro' })[0]).toHaveAttribute(
      'href',
      '/dashboard/bookings/new',
    );
    expect(screen.getAllByRole('link', { name: 'Voltar à agenda' })[0]).toHaveAttribute(
      'href',
      '/dashboard/bookings',
    );
  });
});

describe('NewBookingFailureOutcome', () => {
  function renderFailure(kind: React.ComponentProps<typeof NewBookingFailureOutcome>['kind']) {
    const onChooseDate = vi.fn();
    const onRetry = vi.fn();
    renderWithIntl(
      <NewBookingFailureOutcome
        kind={kind}
        recipientName="Ana Costa"
        message="Falha de rede"
        recap={<p>Recap</p>}
        onChooseDate={onChooseDate}
        onRetry={onRetry}
      />,
    );
    return { onChooseDate, onRetry };
  }

  it('sends a date outside the window back to choose another date', async () => {
    const { onChooseDate } = renderFailure('window');

    expect(screen.getByTestId('outcome-banner-title')).toHaveTextContent('Data fora do prazo');
    await userEvent.click(screen.getAllByTestId('outcome-choose-date')[0]!);

    expect(onChooseDate).toHaveBeenCalledOnce();
  });

  it.each([
    ['phone', 'Ana Costa não tem telefone cadastrado'],
    ['customerNotFound', 'Cliente não encontrado'],
  ] as const)('a %s failure offers another customer, not a retry', (kind, title) => {
    renderFailure(kind);

    expect(screen.getByTestId('outcome-banner-title')).toHaveTextContent(title);
    expect(screen.getAllByTestId('outcome-choose-customer')[0]).toHaveAttribute(
      'href',
      '/dashboard/bookings/new',
    );
    expect(screen.queryByTestId('outcome-retry')).not.toBeInTheDocument();
  });

  it('a generic failure shows its message and retries', async () => {
    const { onRetry } = renderFailure('generic');

    expect(screen.getByText('Falha de rede')).toBeInTheDocument();
    await userEvent.click(screen.getAllByTestId('outcome-retry')[0]!);

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('always offers the way back to the agenda, and keeps the recap', () => {
    renderFailure('generic');

    expect(screen.getAllByRole('link', { name: 'Voltar à agenda' })[0]).toHaveAttribute(
      'href',
      '/dashboard/bookings',
    );
    expect(screen.getByText('Recap')).toBeInTheDocument();
  });
});
