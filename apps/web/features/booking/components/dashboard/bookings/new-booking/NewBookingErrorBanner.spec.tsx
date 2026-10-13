// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewBookingErrorBanner } from './NewBookingErrorBanner';

describe('NewBookingErrorBanner', () => {
  it('shows the message as an alert, with its hint', () => {
    render(<NewBookingErrorBanner hint="Tente outra data">Horário ocupado</NewBookingErrorBanner>);

    expect(screen.getByRole('alert')).toHaveTextContent('Horário ocupado');
    expect(screen.getByText('Tente outra data')).toBeInTheDocument();
  });

  it('offers a retry only when asked to', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<NewBookingErrorBanner>Falhou</NewBookingErrorBanner>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(
      <NewBookingErrorBanner onRetry={onRetry} retryLabel="Tentar novamente">
        Falhou
      </NewBookingErrorBanner>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('moves focus to the alert when it should announce itself', () => {
    render(<NewBookingErrorBanner focusOnMount>Falhou</NewBookingErrorBanner>);

    expect(screen.getByRole('alert')).toHaveFocus();
  });
});
