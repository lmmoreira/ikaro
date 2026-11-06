// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { Radio } from './radio';

describe('Radio', () => {
  it('stays a native radio found by role', () => {
    render(<Radio aria-label="Option A" name="g" />);

    const radio = screen.getByRole('radio', { name: 'Option A' });
    expect(radio).toBeInstanceOf(HTMLInputElement);
    expect(radio).toHaveAttribute('type', 'radio');
  });

  it('selects on click and moves the selection within a group from the keyboard', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <Radio aria-label="A" name="g" value="a" onChange={onChange} />
        <Radio aria-label="B" name="g" value="b" onChange={onChange} />
      </>,
    );

    await user.click(screen.getByRole('radio', { name: 'A' }));
    expect(screen.getByRole('radio', { name: 'A' })).toBeChecked();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'B' })).toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('respects disabled, forwards a ref and merges className', () => {
    const ref = createRef<HTMLInputElement>();
    render(<Radio ref={ref} aria-label="A" name="g" disabled className="mt-1" />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByRole('radio')).toBeDisabled();
    expect(screen.getByRole('radio')).toHaveClass('mt-1');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Radio aria-label="A" name="g" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
