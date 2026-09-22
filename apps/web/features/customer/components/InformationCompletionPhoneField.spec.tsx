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
});
