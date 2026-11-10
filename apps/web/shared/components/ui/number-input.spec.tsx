// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { NumberInput } from './number-input';

describe('NumberInput', () => {
  it('renders a number input with the unit after it', () => {
    render(<NumberInput unit="min" value={10} onChange={vi.fn()} aria-label="Buffer" />);

    const input = screen.getByRole('spinbutton', { name: 'Buffer' });
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveValue(10);
    expect(screen.getByText('min')).toHaveClass('right-3');
    expect(input).toHaveStyle({ paddingRight: 'calc(3ch + 1.75rem)' });
  });

  it('puts a prefix unit on the left and pads the left side instead', () => {
    render(<NumberInput unit="R$" unitPosition="prefix" onChange={vi.fn()} aria-label="Price" />);

    const input = screen.getByRole('spinbutton', { name: 'Price' });
    expect(screen.getByText('R$')).toHaveClass('left-3');
    expect(input).toHaveStyle({ paddingLeft: 'calc(2ch + 1.75rem)' });
    expect(input.style.paddingRight).toBe('');
  });

  it('forwards value props, the ref and calls onChange as the user types', async () => {
    const onChange = vi.fn();
    const ref = createRef<HTMLInputElement>();
    const user = userEvent.setup();
    render(
      <NumberInput
        ref={ref}
        unit="dias"
        id="days"
        data-testid="days-input"
        min={1}
        max={90}
        step={1}
        disabled={false}
        value=""
        onChange={onChange}
      />,
    );

    const input = screen.getByTestId('days-input');
    expect(input).toHaveAttribute('id', 'days');
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '90');
    expect(input).toHaveAttribute('step', '1');
    expect(ref.current).toBe(input);

    await user.type(input, '5');
    expect(onChange).toHaveBeenCalled();
  });

  it('applies wrapperClassName to the frame and className to the input', () => {
    render(
      <NumberInput
        unit="pts"
        wrapperClassName="max-w-56"
        className="font-semibold"
        onChange={vi.fn()}
        aria-label="Points"
      />,
    );

    const input = screen.getByRole('spinbutton', { name: 'Points' });
    expect(input).toHaveClass('font-semibold');
    expect(input.parentElement).toHaveClass('max-w-56');
    expect(input).not.toHaveClass('max-w-56');
  });

  it('describes the input by its unit and never replaces a caller aria-describedby', () => {
    render(
      <>
        <p id="hint">Hint text</p>
        <NumberInput unit="min" aria-describedby="hint" onChange={vi.fn()} aria-label="Buffer" />
      </>,
    );

    const input = screen.getByRole('spinbutton', { name: 'Buffer' });
    const unitId = screen.getByText('min').id;
    expect(unitId).not.toBe('');
    expect(input.getAttribute('aria-describedby')).toBe(`hint ${unitId}`);
    expect(input).toHaveAccessibleDescription('Hint text min');
  });

  it('describes the input by the unit alone when the caller passes no description', () => {
    render(<NumberInput unit="min" onChange={vi.fn()} aria-label="Buffer" />);

    expect(screen.getByRole('spinbutton', { name: 'Buffer' })).toHaveAccessibleDescription('min');
  });

  it('keeps aria-invalid on the input so the invalid border still paints', () => {
    render(<NumberInput unit="min" aria-invalid onChange={vi.fn()} aria-label="Buffer" />);

    expect(screen.getByRole('spinbutton', { name: 'Buffer' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('keeps a caller style and merges the unit padding into it', () => {
    render(<NumberInput unit="h" style={{ color: 'red' }} onChange={vi.fn()} aria-label="Hours" />);

    expect(screen.getByRole('spinbutton', { name: 'Hours' })).toHaveStyle({
      color: 'rgb(255, 0, 0)',
      paddingRight: 'calc(1ch + 1.75rem)',
    });
  });

  it('requires a unit at compile time', () => {
    // Never rendered: the assertion is the type error. Without a unit the component would throw.
    // @ts-expect-error a number input without a unit must not compile
    const bare = <NumberInput onChange={vi.fn()} aria-label="Bare" />;

    expect(bare).toBeDefined();
  });

  it('draws no unit and adds no description when the unit is empty', () => {
    render(<NumberInput unit="" onChange={vi.fn()} aria-label="Price" />);

    const input = screen.getByRole('spinbutton', { name: 'Price' });
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input.style.paddingRight).toBe('');
    expect(input.parentElement?.querySelector('span')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <div>
        <label htmlFor="buffer">Buffer</label>
        <NumberInput id="buffer" unit="min" value={5} onChange={vi.fn()} />
      </div>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
