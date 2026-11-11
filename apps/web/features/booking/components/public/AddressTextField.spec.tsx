// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddressTextField } from './AddressTextField';

describe('AddressTextField', () => {
  it('renders the label associated with the input via htmlFor/id', () => {
    render(<AddressTextField id="street" label="Rua" value="" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Rua')).toBeInTheDocument();
  });

  it('renders the current value', () => {
    render(<AddressTextField id="street" label="Rua" value="Av. Paulista" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Rua')).toHaveValue('Av. Paulista');
  });

  it('calls onChange with the new value on input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AddressTextField id="street" label="Rua" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText('Rua'), 'X');

    expect(onChange).toHaveBeenCalledWith('X');
  });

  it('marks an invalid field with the branded outline and links it to its message', () => {
    render(
      <AddressTextField
        id="street"
        label="Rua"
        value=""
        onChange={vi.fn()}
        hasError
        describedBy="address-message"
      />,
    );

    const input = screen.getByLabelText('Rua');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'address-message');
    expect(input.className).toContain('border-red-600');
  });

  it('leaves a valid field unmarked even when given a message id', () => {
    render(
      <AddressTextField
        id="street"
        label="Rua"
        value=""
        onChange={vi.fn()}
        describedBy="address-message"
      />,
    );

    const input = screen.getByLabelText('Rua');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input.className).not.toContain('border-red-600');
  });

  it('hands the input to the form for focus', () => {
    const inputRef = vi.fn();
    render(
      <AddressTextField id="street" label="Rua" value="" onChange={vi.fn()} inputRef={inputRef} />,
    );

    expect(inputRef).toHaveBeenCalledWith(screen.getByLabelText('Rua'));
  });

  it('marks the field required when required is true', () => {
    render(<AddressTextField id="street" label="Rua" value="" onChange={vi.fn()} required />);

    expect(screen.getByLabelText('Rua')).toBeRequired();
  });

  it('applies maxLength and placeholder', () => {
    render(
      <AddressTextField
        id="zip"
        label="CEP"
        value=""
        onChange={vi.fn()}
        maxLength={8}
        placeholder="00000000"
        inputMode="numeric"
      />,
    );

    const input = screen.getByLabelText('CEP');
    expect(input).toHaveAttribute('maxlength', '8');
    expect(input).toHaveAttribute('placeholder', '00000000');
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  it('sets aria-invalid when hasError is true, and omits it otherwise', () => {
    const { rerender } = render(
      <AddressTextField id="street" label="Rua" value="" onChange={vi.fn()} hasError />,
    );
    expect(screen.getByLabelText('Rua')).toHaveAttribute('aria-invalid', 'true');

    rerender(<AddressTextField id="street" label="Rua" value="" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Rua')).not.toHaveAttribute('aria-invalid');
  });
});

describe('AddressTextField readable colours (TD51-S05)', () => {
  it('types in the derived secondary text colour and styles its placeholder with the derived token', () => {
    render(<AddressTextField id="street" label="Rua" value="" onChange={vi.fn()} />);

    const input = screen.getByLabelText('Rua');
    expect(input.style.color).toBe('var(--ba-secondary-text)');
    expect(input.style.backgroundColor).toBe('var(--ba-secondary)');
    expect(input.className).toContain('--ba-secondary-muted');
  });
});
