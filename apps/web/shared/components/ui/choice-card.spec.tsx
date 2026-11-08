// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { ChoiceCard } from './choice-card';

describe('ChoiceCard', () => {
  it('exposes the chosen state through aria-pressed and the blue look', () => {
    render(
      <>
        <ChoiceCard selected>Hora marcada</ChoiceCard>
        <ChoiceCard selected={false}>Sessão</ChoiceCard>
      </>,
    );

    const chosen = screen.getByRole('button', { name: 'Hora marcada' });
    const other = screen.getByRole('button', { name: 'Sessão' });
    expect(chosen).toHaveAttribute('aria-pressed', 'true');
    expect(chosen).toHaveClass('border-blue-500', 'bg-accent');
    expect(other).toHaveAttribute('aria-pressed', 'false');
    expect(other).not.toHaveClass('bg-accent');
  });

  it('is a plain button that fires onClick, takes a className and test ids, and respects disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ChoiceCard selected={false} onClick={onClick} className="p-3.5" data-testid="card">
        Fixo
      </ChoiceCard>,
    );

    const card = screen.getByTestId('card');
    await user.click(card);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(card).toHaveAttribute('type', 'button');
    expect(card).toHaveClass('p-3.5');
    expect(card).not.toHaveClass('p-4');

    rerender(
      <ChoiceCard selected={false} onClick={onClick} disabled data-testid="card">
        Fixo
      </ChoiceCard>,
    );
    await user.click(screen.getByTestId('card'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(<ChoiceCard selected>Hora marcada</ChoiceCard>);

    expect(await axe(container)).toHaveNoViolations();
  });
});
