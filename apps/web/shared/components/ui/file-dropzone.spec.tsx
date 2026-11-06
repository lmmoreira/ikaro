// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { FileDropzone } from './file-dropzone';

describe('FileDropzone', () => {
  it('renders the title, the hint and the preview inside the card', () => {
    render(
      <FileDropzone
        title="Click to add"
        hint="JPG or PNG"
        preview={<span data-testid="preview">preview</span>}
      />,
    );

    expect(screen.getByText('Click to add')).toBeInTheDocument();
    expect(screen.getByText('JPG or PNG')).toBeInTheDocument();
    expect(screen.getByTestId('preview')).toBeInTheDocument();
  });

  it('omits the hint when none is given', () => {
    render(<FileDropzone title="Click to add" />);

    expect(screen.queryByText('JPG or PNG')).not.toBeInTheDocument();
  });

  it('forwards the input props and test id to the hidden file input inside the label', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FileDropzone
        title="Click to add"
        accept="image/png"
        multiple
        data-testid="drop-input"
        onChange={onChange}
      />,
    );

    const input = screen.getByTestId('drop-input');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'image/png');
    expect(input).toHaveClass('sr-only');
    expect(input.closest('label')).not.toBeNull();

    await user.upload(input, new File(['x'], 'a.png', { type: 'image/png' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('marks the input and the card invalid', () => {
    render(<FileDropzone title="Click to add" invalid data-testid="drop-input" />);

    const input = screen.getByTestId('drop-input');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.closest('label')).toHaveClass('ring-red-600');
  });

  it('merges a className onto the card', () => {
    render(<FileDropzone title="Click to add" className="mt-3" data-testid="drop-input" />);

    expect(screen.getByTestId('drop-input').closest('label')).toHaveClass('mt-3');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<FileDropzone title="Click to add" hint="JPG or PNG" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
