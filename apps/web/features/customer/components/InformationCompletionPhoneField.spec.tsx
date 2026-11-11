// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InformationCompletionPhoneField } from './InformationCompletionPhoneField';

describe('InformationCompletionPhoneField', () => {
  it('renders the label, prefix, and placeholder for a +55 prefix', () => {
    render(
      <InformationCompletionPhoneField
        phonePrefix="+55"
        localPhoneDigits=""
        onChangeLocalDigits={vi.fn()}
        label="Telefone"
      />,
    );

    expect(screen.getByText('Telefone')).toBeInTheDocument();
    expect(screen.getByTestId('information-completion-phone-prefix')).toHaveTextContent('+55');
    expect(screen.getByTestId('information-completion-phone-input')).toHaveAttribute(
      'placeholder',
      '(11) 91234-5678',
    );
  });

  it('formats already-entered local digits with the +55 mask', () => {
    render(
      <InformationCompletionPhoneField
        phonePrefix="+55"
        localPhoneDigits="11999999999"
        onChangeLocalDigits={vi.fn()}
        label="Telefone"
      />,
    );

    expect(screen.getByTestId('information-completion-phone-input')).toHaveValue('(11) 99999-9999');
  });

  it('calls onChangeLocalDigits with the full E.164 number as the user types', async () => {
    const user = userEvent.setup();
    const onChangeLocalDigits = vi.fn();
    render(
      <InformationCompletionPhoneField
        phonePrefix="+55"
        localPhoneDigits=""
        onChangeLocalDigits={onChangeLocalDigits}
        label="Telefone"
      />,
    );

    await user.type(screen.getByTestId('information-completion-phone-input'), '1');

    expect(onChangeLocalDigits).toHaveBeenLastCalledWith('+551');
  });

  it('is a required field', () => {
    render(
      <InformationCompletionPhoneField
        phonePrefix="+55"
        localPhoneDigits=""
        onChangeLocalDigits={vi.fn()}
        label="Telefone"
      />,
    );

    expect(screen.getByTestId('information-completion-phone-input')).toBeRequired();
  });

  it('marks the input and shows the message under it when there is an error', () => {
    render(
      <InformationCompletionPhoneField
        phonePrefix="+55"
        localPhoneDigits="119"
        onChangeLocalDigits={vi.fn()}
        label="Telefone"
        error="Digite um número de telefone válido (10 ou 11 dígitos)."
        errorId="phone-err"
        inputProps={{ 'aria-invalid': true, 'aria-describedby': 'phone-err' }}
      />,
    );

    const input = screen.getByTestId('information-completion-phone-input');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'phone-err');
    expect(screen.getByTestId('information-completion-phone-error')).toHaveTextContent(
      'Digite um número de telefone válido (10 ou 11 dígitos).',
    );
    expect(document.getElementById('phone-err')).not.toBeNull();
  });

  it('shows no message and no invalid mark without an error', () => {
    render(
      <InformationCompletionPhoneField
        phonePrefix="+55"
        localPhoneDigits=""
        onChangeLocalDigits={vi.fn()}
        label="Telefone"
      />,
    );

    expect(screen.queryByTestId('information-completion-phone-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('information-completion-phone-input')).not.toHaveAttribute(
      'aria-invalid',
    );
  });
});

describe('InformationCompletionPhoneField readable colours (TD51-S05)', () => {
  it('types in the derived secondary text colour, with a branded placeholder, in the input and prefix', () => {
    render(
      <InformationCompletionPhoneField
        phonePrefix="+55"
        localPhoneDigits=""
        onChangeLocalDigits={vi.fn()}
        label="Telefone"
      />,
    );

    const input = screen.getByTestId('information-completion-phone-input');
    expect(input.style.color).toBe('var(--ba-secondary-text)');
    expect(input.className).toContain('--ba-secondary-muted');
    expect(screen.getByTestId('information-completion-phone-prefix').style.color).toBe(
      'var(--ba-secondary-text)',
    );
  });
});
