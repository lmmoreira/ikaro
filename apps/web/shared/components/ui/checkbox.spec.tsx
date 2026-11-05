// @vitest-environment jsdom
import { createRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { Checkbox } from './checkbox';

function Controlled(): React.JSX.Element {
  const [checked, setChecked] = useState(false);
  return (
    <>
      <Checkbox
        id="required"
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
      />
      <label htmlFor="required">Required</label>
    </>
  );
}

describe('Checkbox', () => {
  it('stays a native checkbox found by role', () => {
    render(<Checkbox aria-label="Required" />);

    const checkbox = screen.getByRole('checkbox', { name: 'Required' });
    expect(checkbox).toBeInstanceOf(HTMLInputElement);
    expect(checkbox).toHaveAttribute('type', 'checkbox');
  });

  it('toggles on click and calls onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox aria-label="Required" onChange={onChange} />);

    await user.click(screen.getByRole('checkbox'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('toggles from the keyboard with the space bar', async () => {
    const user = userEvent.setup();
    render(<Controlled />);

    await user.tab();
    expect(screen.getByRole('checkbox')).toHaveFocus();
    await user.keyboard(' ');

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('reflects the controlled checked prop', () => {
    render(<Checkbox aria-label="Required" checked onChange={vi.fn()} />);

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('does not toggle when disabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Checkbox aria-label="Required" disabled onChange={onChange} />);

    await user.click(screen.getByRole('checkbox'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('forwards a ref and merges a custom className', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Checkbox ref={ref} aria-label="Required" className="mt-1" />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByRole('checkbox')).toHaveClass('mt-1', 'h-4', 'w-4');
  });

  it('has no accessibility violations when paired with its label', async () => {
    const { container } = render(<Controlled />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
