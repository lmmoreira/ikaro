// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BrandedFeedbackMessage } from './branded-feedback-message';

const FORBIDDEN_TENANT_COLOURS = [
  '--ba-primary',
  '--ba-secondary',
  '--ba-text',
  '--ba-background',
  '--ba-btn',
];
const ALLOWED_TENANT_TOKENS = new Set(['--ba-radius', '--ba-body-font', '--ba-heading-font']);

function tenantTokensIn(markup: string): string[] {
  return [...markup.matchAll(/--ba-[a-z-]+/g)].map((match) => match[0]);
}

describe('BrandedFeedbackMessage', () => {
  it('renders an error as an alert with its title, body and hint', () => {
    render(
      <BrandedFeedbackMessage title="Não foi possível enviar" hint="Tente de novo" testId="fb">
        Corrija o e-mail
      </BrandedFeedbackMessage>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-testid', 'fb');
    expect(alert).toHaveTextContent('Não foi possível enviar');
    expect(alert).toHaveTextContent('Corrija o e-mail');
    expect(alert).toHaveTextContent('Tente de novo');
  });

  it('renders a success as a status, not an alert', () => {
    render(<BrandedFeedbackMessage variant="success" title="Recebemos seu pedido" />);

    expect(screen.getByRole('status')).toHaveTextContent('Recebemos seu pedido');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not take focus by default and takes it with focusOnMount', () => {
    const { rerender } = render(<BrandedFeedbackMessage title="Falhou" />);
    expect(screen.getByRole('alert')).not.toHaveFocus();

    rerender(<BrandedFeedbackMessage title="Falhou" focusOnMount />);
    expect(screen.getByRole('alert')).toHaveFocus();
  });

  it('offers a retry only when asked to, with the given label, and fires it', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<BrandedFeedbackMessage title="Falhou" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<BrandedFeedbackMessage title="Falhou" onRetry={onRetry} retryLabel="Repetir" />);
    await userEvent.click(screen.getByRole('button', { name: 'Repetir' }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it.each(['error', 'success'] as const)(
    '%s: reads only the tenant radius and fonts, never a tenant colour token',
    (variant) => {
      const { container } = render(
        <BrandedFeedbackMessage variant={variant} title="Titulo" onRetry={() => {}} retryLabel="Ok">
          Corpo
        </BrandedFeedbackMessage>,
      );

      const tokens = tenantTokensIn(container.innerHTML);
      expect(tokens.length).toBeGreaterThan(0);
      for (const token of tokens) expect(ALLOWED_TENANT_TOKENS).toContain(token);
      for (const forbidden of FORBIDDEN_TENANT_COLOURS) {
        expect(container.innerHTML).not.toContain(forbidden);
      }
      expect(container.innerHTML).not.toMatch(
        /\b(bg|text|border)-(primary|secondary|destructive|muted|accent|foreground|background)\b/,
      );
    },
  );

  it.each(['error', 'success'] as const)(
    '%s: paints its own surface, colour and shadow as one fixed set',
    (variant) => {
      render(<BrandedFeedbackMessage variant={variant} title="Titulo" />);

      const box = screen.getByText('Titulo').parentElement as HTMLElement;
      expect(box).toHaveStyle({ backgroundColor: '#ffffff', borderLeftWidth: '4px' });
      expect(box.style.color).not.toBe('');
      expect(box.style.boxShadow).not.toBe('');
    },
  );
});
