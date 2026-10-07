// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorAlert } from './ErrorAlert';

describe('ErrorAlert', () => {
  it('renders the message as an alert', () => {
    render(<ErrorAlert>Algo deu errado</ErrorAlert>);

    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado');
  });

  it('renders the hint under the message', () => {
    render(<ErrorAlert hint="Tente de novo">Falhou</ErrorAlert>);

    expect(screen.getByRole('alert')).toHaveTextContent('Tente de novo');
  });

  it('reads the tenant radius by default and a fixed one for the dashboard variant', () => {
    const { rerender } = render(<ErrorAlert>Falhou</ErrorAlert>);
    expect(screen.getByRole('alert').getAttribute('style')).toContain('var(--ba-radius)');

    rerender(<ErrorAlert variant="dashboard">Falhou</ErrorAlert>);
    expect(screen.getByRole('alert').getAttribute('style')).not.toContain('--ba-');
    expect(screen.getByRole('alert')).toHaveStyle({ borderRadius: '0.75rem' });
  });

  it('does not take focus by default', () => {
    render(<ErrorAlert>Falhou</ErrorAlert>);

    expect(screen.getByRole('alert')).not.toHaveFocus();
  });

  it('moves focus to the alert when focusOnMount is set', () => {
    render(<ErrorAlert focusOnMount>Falhou</ErrorAlert>);

    expect(screen.getByRole('alert')).toHaveFocus();
  });

  it('calls onRetry from the retry button with the given label', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ErrorAlert onRetry={onRetry} retryLabel="Repetir">
        Falhou
      </ErrorAlert>,
    );

    await user.click(screen.getByRole('button', { name: 'Repetir' }));

    expect(onRetry).toHaveBeenCalled();
  });

  it('shows no retry button without onRetry', () => {
    render(<ErrorAlert>Falhou</ErrorAlert>);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
