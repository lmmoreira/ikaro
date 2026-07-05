// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SwitchField } from './switch-field';

describe('SwitchField', () => {
  it('renders the label, hint, and reflects the checked state', () => {
    render(
      <SwitchField
        checked
        onChange={vi.fn()}
        label="Aprovação automática"
        hint="Aprova agendamentos sem revisão manual."
      />,
    );

    expect(screen.getByText('Aprovação automática')).toBeInTheDocument();
    expect(screen.getByText('Aprova agendamentos sem revisão manual.')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with the toggled value when clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SwitchField checked={false} onChange={onChange} label="Ativo" />);

    await user.click(screen.getByRole('switch'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders without a hint when none is provided', () => {
    render(<SwitchField checked={false} onChange={vi.fn()} label="Ativo" />);

    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });
});
