// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { FileInput } from './file-input';

describe('FileInput', () => {
  it('renders a native file input that is visually hidden by default', () => {
    render(<FileInput aria-label="Photos" />);

    const input = screen.getByLabelText('Photos');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveClass('sr-only');
  });

  it('forwards native props and a ref', () => {
    const ref = createRef<HTMLInputElement>();
    render(<FileInput ref={ref} aria-label="Photos" accept="image/png" multiple data-testid="f" />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByTestId('f')).toHaveAttribute('accept', 'image/png');
    expect(screen.getByTestId('f')).toHaveAttribute('multiple');
  });

  it('calls onChange with the chosen file', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FileInput aria-label="Photos" onChange={onChange} />);

    await user.upload(
      screen.getByLabelText('Photos'),
      new File(['x'], 'a.png', { type: 'image/png' }),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('lets a caller reveal it through className', () => {
    render(<FileInput aria-label="Photos" className="block" />);

    expect(screen.getByLabelText('Photos')).toHaveClass('block', 'sr-only');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<FileInput aria-label="Photos" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
