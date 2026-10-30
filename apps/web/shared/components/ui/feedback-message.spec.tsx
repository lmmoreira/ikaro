// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FeedbackMessage } from './feedback-message';

describe('FeedbackMessage', () => {
  it('renders an error as an alert with its title, body and hint', () => {
    render(
      <FeedbackMessage title="Não foi possível salvar" hint="Tente outra data" testId="fb">
        Informe o mínimo
      </FeedbackMessage>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-testid', 'fb');
    expect(alert).toHaveTextContent('Não foi possível salvar');
    expect(alert).toHaveTextContent('Informe o mínimo');
    expect(screen.getByText('Tente outra data')).toBeInTheDocument();
  });

  it('renders a success as a status, not an alert', () => {
    render(<FeedbackMessage variant="success" title="Alterações salvas" />);

    expect(screen.getByRole('status')).toHaveTextContent('Alterações salvas');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers a retry only when asked to, and fires it', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<FeedbackMessage title="Falhou" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<FeedbackMessage title="Falhou" onRetry={onRetry} retryLabel="Tentar novamente" />);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('moves focus to the message only when it should announce itself', () => {
    const { rerender } = render(<FeedbackMessage title="Falhou" />);
    expect(screen.getByRole('alert')).not.toHaveFocus();

    rerender(<FeedbackMessage title="Falhou de novo" focusOnMount />);
    expect(screen.getByRole('alert')).toHaveFocus();
  });

  it('renders the inline size as a compact one-line box', () => {
    render(<FeedbackMessage variant="success" size="inline" title="Convite reenviado" />);

    expect(screen.getByRole('status').className).toContain('inline-block');
  });

  it('never reads a hotsite --ba-* token', () => {
    const { container } = render(
      <FeedbackMessage title="Falhou" hint="dica" onRetry={() => undefined} retryLabel="Tentar" />,
    );

    expect(container.innerHTML).not.toContain('--ba-');
  });
});
