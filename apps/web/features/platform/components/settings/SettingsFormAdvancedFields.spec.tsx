// @vitest-environment jsdom
import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { countrySpec } from '@ikaro/i18n';
import { renderWithIntl } from '@/test-utils';
import { settingsFeedback } from './settings-field-feedback.fixture';
import { PhoneField, PostalCodeField, addressSpecFieldLabel } from './SettingsFormAdvancedFields';

// PhoneField's displayed value is derived (formatPhoneForDisplay) from its `value` prop on every
// render — a static vi.fn() onChange never feeds a new value back in, so React resets the DOM
// input back to the formatted empty string after each keystroke. A small stateful wrapper (same
// pattern as BrandingTab.spec.tsx's ControlledBrandingTab) is required for user.type to
// accumulate digits realistically.
function ControlledPhoneField({
  onChange,
}: {
  readonly onChange: (localDigits: string) => void;
}): React.JSX.Element {
  const [value, setValue] = useState('');
  return (
    <PhoneField
      id="settings-phone"
      name="phone"
      feedback={settingsFeedback()}
      prefixTestId="settings-phone-prefix"
      label="Telefone"
      value={value}
      phonePrefix="+55"
      onChange={(localDigits) => {
        setValue(localDigits);
        onChange(localDigits);
      }}
    />
  );
}

describe('PhoneField', () => {
  it('renders the fixed prefix and calls onChange with sanitized local digits', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<ControlledPhoneField onChange={onChange} />);

    expect(screen.getByTestId('settings-phone-prefix')).toHaveTextContent('+55');
    await user.type(screen.getByTestId('settings-phone'), '3199999999');
    expect(onChange).toHaveBeenLastCalledWith('3199999999');
  });
});

describe('PostalCodeField', () => {
  it('shows the searching hint while looking up and the not-found hint on failure', () => {
    const { rerender } = renderWithIntl(
      <PostalCodeField
        feedback={settingsFeedback()}
        label="CEP"
        value=""
        postalPlaceholder="00000-000"
        isLookingUp
        lookupFailed={false}
        searchingLabel="Buscando..."
        notFoundLabel="Não encontrado"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('settings-address-zip-loading')).toHaveTextContent('Buscando...');

    rerender(
      <PostalCodeField
        feedback={settingsFeedback()}
        label="CEP"
        value=""
        postalPlaceholder="00000-000"
        isLookingUp={false}
        lookupFailed
        searchingLabel="Buscando..."
        notFoundLabel="Não encontrado"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('settings-address-zip-not-found')).toHaveTextContent(
      'Não encontrado',
    );
  });

  it('calls onChange with the raw typed value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <PostalCodeField
        feedback={settingsFeedback()}
        label="CEP"
        value=""
        postalPlaceholder="00000-000"
        isLookingUp={false}
        lookupFailed={false}
        searchingLabel="Buscando..."
        notFoundLabel="Não encontrado"
        onChange={onChange}
      />,
    );

    await user.type(screen.getByTestId('settings-address-zip'), '3');
    expect(onChange).toHaveBeenCalledWith('3');
  });
});

describe('addressSpecFieldLabel', () => {
  it('returns the matching label for each address field', () => {
    const spec = countrySpec('BR').address;
    expect(addressSpecFieldLabel(spec, 'street')).toBe(spec.streetLabel);
    expect(addressSpecFieldLabel(spec, 'number')).toBe(spec.numberLabel);
    expect(addressSpecFieldLabel(spec, 'complement')).toBe(spec.complementLabel);
    expect(addressSpecFieldLabel(spec, 'city')).toBe(spec.cityLabel);
    expect(addressSpecFieldLabel(spec, 'state')).toBe(spec.stateLabel);
    expect(addressSpecFieldLabel(spec, 'zipCode')).toBe(spec.postalLabel);
  });
});

describe('field errors', () => {
  it('PhoneField marks the input invalid and describes it with its message', () => {
    renderWithIntl(
      <PhoneField
        id="settings-phone"
        name="phone"
        feedback={settingsFeedback({ phone: 'Telefone inválido.' })}
        prefixTestId="settings-phone-prefix"
        label="Telefone"
        value=""
        phonePrefix="+55"
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByTestId('settings-phone');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'phone-error');
    expect(screen.getByText('Telefone inválido.')).toHaveAttribute('id', 'phone-error');
  });

  it('PostalCodeField marks the input invalid and shows its message', () => {
    renderWithIntl(
      <PostalCodeField
        feedback={settingsFeedback({ addressZipCode: 'Informe o CEP.' })}
        label="CEP"
        value=""
        postalPlaceholder="00000-000"
        isLookingUp={false}
        lookupFailed={false}
        searchingLabel="Buscando"
        notFoundLabel="Não encontrado"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('settings-address-zip')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Informe o CEP.')).toBeInTheDocument();
  });
});
