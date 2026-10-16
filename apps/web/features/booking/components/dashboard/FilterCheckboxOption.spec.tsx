// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterCheckboxOption } from './FilterCheckboxOption';

describe('FilterCheckboxOption', () => {
  it('shows its label and checked state and reports a click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterCheckboxOption label="Hoje" checked onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox', { name: 'Hoje' });
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('shows the count of items it stands for, and nothing when it has none', () => {
    const { rerender } = render(
      <FilterCheckboxOption label="Hoje" checked onChange={vi.fn()} count={4} />,
    );
    expect(screen.getByText('4')).toBeInTheDocument();

    rerender(<FilterCheckboxOption label="Hoje" checked onChange={vi.fn()} />);
    expect(screen.queryByText('4')).not.toBeInTheDocument();
  });

  it('shows a zero count (an option with nothing in it still says so)', () => {
    render(<FilterCheckboxOption label="Recorrências" checked onChange={vi.fn()} count={0} />);

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('is not clickable while disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FilterCheckboxOption label="Sala 1" checked={false} disabled onChange={onChange} />);

    const checkbox = screen.getByRole('checkbox', { name: 'Sala 1' });
    expect(checkbox).toBeDisabled();

    await user.click(checkbox);
    expect(onChange).not.toHaveBeenCalled();
  });
});
