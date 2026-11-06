// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { Input } from './input';

describe('Input', () => {
  it('renders a text input forwarding value and placeholder', () => {
    render(<Input value="hello" placeholder="Type here" onChange={vi.fn()} />);

    const input = screen.getByPlaceholderText('Type here');
    expect(input).toHaveValue('hello');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('lets the caller choose another type', () => {
    render(<Input type="number" value={3} onChange={vi.fn()} aria-label="Quantity" />);

    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveAttribute('type', 'number');
  });

  it('calls onChange as the user types', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Input value="" onChange={onChange} />);

    await user.type(screen.getByRole('textbox'), 'a');

    expect(onChange).toHaveBeenCalled();
  });

  it('respects the disabled prop', () => {
    render(<Input value="" onChange={vi.fn()} disabled />);

    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('forwards a ref to the underlying input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} value="" onChange={vi.fn()} />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('merges a custom className, letting it override the default width', () => {
    render(<Input value="" onChange={vi.fn()} className="w-32 font-mono" />);

    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('w-32', 'font-mono');
    expect(input).not.toHaveClass('w-full');
  });

  it('passes aria-invalid and aria-describedby through for the styling hook and screen readers', () => {
    render(
      <>
        <Input value="" onChange={vi.fn()} aria-invalid aria-describedby="err" aria-label="Name" />
        <p id="err">Required</p>
      </>,
    );

    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Required');
  });

  it('styles aria-invalid with the red border and background', () => {
    render(<Input value="" onChange={vi.fn()} aria-invalid aria-label="Name" />);

    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveClass(
      'aria-[invalid=true]:border-red-500',
      'aria-[invalid=true]:bg-red-50',
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Input value="" onChange={vi.fn()} aria-label="Name" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
