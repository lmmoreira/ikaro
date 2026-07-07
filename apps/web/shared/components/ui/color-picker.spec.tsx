// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ColorPicker } from './color-picker';

describe('ColorPicker', () => {
  it('renders the label and current hex value', () => {
    render(
      <ColorPicker id="primary-color" label="Cor primária" value="#2563eb" onChange={vi.fn()} />,
    );

    expect(screen.getByText('Cor primária')).toBeInTheDocument();
    expect(screen.getByTestId('primary-color')).toHaveValue('#2563eb');
  });

  it('calls onChange when the hex text field is edited', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorPicker id="primary-color" label="Cor primária" value="" onChange={onChange} />);

    await user.type(screen.getByTestId('primary-color'), '#f');

    expect(onChange).toHaveBeenCalledWith('#');
    expect(onChange).toHaveBeenCalledWith('f');
  });

  it('opens the react-colorful gradient picker when the swatch is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ColorPicker id="primary-color" label="Cor primária" value="#2563eb" onChange={vi.fn()} />,
    );

    expect(screen.queryAllByRole('slider')).toHaveLength(0);

    await user.click(screen.getByTestId('primary-color-swatch'));

    // react-colorful's HexColorPicker renders a saturation slider + a hue slider
    expect(screen.getAllByRole('slider').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the inline error message and marks the field invalid', () => {
    render(
      <ColorPicker
        id="primary-color"
        label="Cor primária"
        value="azul claro"
        onChange={vi.fn()}
        error="Cor inválida. Use o formato hexadecimal, ex: #2563eb."
      />,
    );

    expect(
      screen.getByText('Cor inválida. Use o formato hexadecimal, ex: #2563eb.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('primary-color')).toHaveAttribute('aria-invalid', 'true');
  });
});
