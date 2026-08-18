// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ContactInfoFields } from './ContactInfoFields';

describe('ContactInfoFields', () => {
  it('renders the phone prefix', () => {
    renderWithIntl(
      <ContactInfoFields
        contactName=""
        contactEmail=""
        contactPhone=""
        phonePrefix="+55"
        fieldError={null}
        onContactNameChange={vi.fn()}
        onContactEmailChange={vi.fn()}
        onContactPhoneChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('phone-prefix')).toHaveTextContent('+55');
  });

  it('marks only the errored field as aria-invalid', () => {
    renderWithIntl(
      <ContactInfoFields
        contactName=""
        contactEmail=""
        contactPhone=""
        phonePrefix="+55"
        fieldError={{ field: 'email', message: 'Informe seu e-mail.' }}
        onContactNameChange={vi.fn()}
        onContactEmailChange={vi.fn()}
        onContactPhoneChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('input-name')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('input-email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('input-phone')).not.toHaveAttribute('aria-invalid');
  });

  it('calls onContactNameChange and onContactEmailChange when typing', async () => {
    const user = userEvent.setup();
    const onContactNameChange = vi.fn();
    const onContactEmailChange = vi.fn();
    renderWithIntl(
      <ContactInfoFields
        contactName=""
        contactEmail=""
        contactPhone=""
        phonePrefix="+55"
        fieldError={null}
        onContactNameChange={onContactNameChange}
        onContactEmailChange={onContactEmailChange}
        onContactPhoneChange={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId('input-name'), 'A');
    expect(onContactNameChange).toHaveBeenCalledWith('A');

    await user.type(screen.getByTestId('input-email'), 'a');
    expect(onContactEmailChange).toHaveBeenCalledWith('a');
  });

  it('calls onContactPhoneChange with the full E.164 phone when typing', async () => {
    const user = userEvent.setup();
    const onContactPhoneChange = vi.fn();
    renderWithIntl(
      <ContactInfoFields
        contactName=""
        contactEmail=""
        contactPhone=""
        phonePrefix="+55"
        fieldError={null}
        onContactNameChange={vi.fn()}
        onContactEmailChange={vi.fn()}
        onContactPhoneChange={onContactPhoneChange}
      />,
    );

    await user.click(screen.getByTestId('input-phone'));
    await user.paste('11912345678');

    expect(onContactPhoneChange).toHaveBeenCalledWith('+5511912345678');
  });
});
