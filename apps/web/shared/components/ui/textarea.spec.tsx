// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('renders a textarea forwarding value and placeholder', () => {
    render(<Textarea value="hello" placeholder="Type here" onChange={vi.fn()} />);

    const textarea = screen.getByPlaceholderText('Type here');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('hello');
  });

  it('calls onChange as the user types', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Textarea value="" onChange={onChange} />);

    await user.type(screen.getByRole('textbox'), 'a');

    expect(onChange).toHaveBeenCalled();
  });

  it('respects the disabled prop', () => {
    render(<Textarea value="" onChange={vi.fn()} disabled />);

    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('forwards a ref to the underlying textarea element', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} value="" onChange={vi.fn()} />);

    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('merges a custom className with the default styles', () => {
    render(<Textarea value="" onChange={vi.fn()} className="font-mono" />);

    expect(screen.getByRole('textbox')).toHaveClass('font-mono');
  });
});
