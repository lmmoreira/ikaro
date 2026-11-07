// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '@/axe-helper';
import { describe, expect, it, vi } from 'vitest';
import { FilterChip } from './filter-chip';

describe('FilterChip', () => {
  it('exposes the selected state through aria-pressed', () => {
    render(
      <>
        <FilterChip selected>Ativos</FilterChip>
        <FilterChip selected={false}>Inativos</FilterChip>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Ativos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Inativos' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('fills the selected chip and leaves the other outlined', () => {
    render(
      <>
        <FilterChip selected>Ativos</FilterChip>
        <FilterChip selected={false}>Inativos</FilterChip>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Ativos' })).toHaveClass('bg-primary');
    expect(screen.getByRole('button', { name: 'Inativos' })).not.toHaveClass('bg-primary');
  });

  it('is a plain button that fires onClick and passes className and test ids through', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <FilterChip selected={false} onClick={onClick} className="mt-2" data-testid="chip">
        Todos
      </FilterChip>,
    );

    const chip = screen.getByTestId('chip');
    await user.click(chip);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(chip).toHaveAttribute('type', 'button');
    expect(chip).toHaveClass('mt-2');
  });

  it('has no axe violations', async () => {
    const { container } = render(<FilterChip selected>Todos</FilterChip>);

    expect(await axe(container)).toHaveNoViolations();
  });
});
