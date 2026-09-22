// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LeadFormPhoneField } from './LeadFormPhoneField';

function baseProps() {
  return {
    label: 'Telefone',
    value: '',
    phonePrefix: '+55',
    onChange: vi.fn(),
  };
}

describe('LeadFormPhoneField', () => {
  it('renders the fixed prefix adornment beside the input', () => {
    render(<LeadFormPhoneField {...baseProps()} />);
    expect(screen.getByTestId('lead-form-phone-prefix')).toHaveTextContent('+55');
  });

  it('displays a full E.164 value masked and stripped of the prefix', () => {
    render(<LeadFormPhoneField {...baseProps()} value="+5511977771234" />);
    expect(screen.getByTestId('lead-form-phone')).toHaveValue('(11) 97777-1234');
  });

  it('builds a full E.164 value from local digits typed by the user', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LeadFormPhoneField {...baseProps()} onChange={onChange} />);

    await user.type(screen.getByTestId('lead-form-phone'), '1');
    expect(onChange).toHaveBeenLastCalledWith('+551');
  });

  it('shows the error message when error is set', () => {
    render(<LeadFormPhoneField {...baseProps()} error="Informe seu telefone." />);
    expect(screen.getByTestId('lead-form-phone-error')).toHaveTextContent('Informe seu telefone.');
  });

  it('does not render an error element when error is undefined', () => {
    render(<LeadFormPhoneField {...baseProps()} />);
    expect(screen.queryByTestId('lead-form-phone-error')).not.toBeInTheDocument();
  });

  it('shows a country-specific placeholder derived from the phone prefix', () => {
    render(<LeadFormPhoneField {...baseProps()} phonePrefix="+1" />);
    expect(screen.getByTestId('lead-form-phone')).toHaveAttribute('placeholder', '(555) 123-4567');
  });
});
