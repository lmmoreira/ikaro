// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { countrySpec } from '@ikaro/i18n';
import { renderWithIntl } from '@/test-utils';
import type { SettingsFormValues } from '@/features/platform/settings-form';
import { SettingsContactSection } from './SettingsContactSection';

function buildValues(): SettingsFormValues {
  return {
    name: 'BeloAuto',
    cancellationWindowHours: '48',
    serviceBufferMinutes: '10',
    autoApproveEnabled: false,
    minBookingAdvanceHours: '2',
    maxBookingAdvanceDays: '60',
    slotGranularityMinutes: '30',
    welcomeStaffScreenDays: '14',
    loyaltyExpiryDays: '180',
    loyaltyExpiryWarningDays: '15',
    loyaltyEnableNotifications: true,
    loyaltyNotificationMinPoints: '10',
    pointsPerCurrencyUnit: '10',
    timezone: 'America/Sao_Paulo',
    days: {
      monday: { open: '08:00', close: '18:00', closed: false },
      tuesday: { open: '08:00', close: '18:00', closed: false },
      wednesday: { open: '08:00', close: '18:00', closed: false },
      thursday: { open: '08:00', close: '18:00', closed: false },
      friday: { open: '08:00', close: '18:00', closed: false },
      saturday: { open: '09:00', close: '13:00', closed: false },
      sunday: { open: '', close: '', closed: true },
    },
    phone: '31999999999',
    email: 'contato@beloauto.com.br',
    address: {
      street: 'Rua das Flores',
      number: '123',
      complement: '',
      neighborhood: 'Centro',
      city: 'Belo Horizonte',
      state: 'MG',
      zipCode: '30000-000',
    },
    notificationFromEmail: '',
    socialLinks: { whatsapp: '', instagram: '', facebook: '' },
    knowledgeText: '',
  };
}

function baseProps() {
  return {
    values: buildValues(),
    fieldErrors: {},
    addressSpec: countrySpec('BR').address,
    phonePrefix: '+55',
    isLookingUpZip: false,
    zipLookupFailed: false,
    onFieldChange: vi.fn(),
    onAddressFieldChange: vi.fn(),
    onSocialLinksFieldChange: vi.fn(),
    onZipCodeChange: vi.fn(),
  };
}

describe('SettingsContactSection', () => {
  it('renders the phone prefix and email fields', () => {
    const props = baseProps();
    renderWithIntl(<SettingsContactSection {...props} />);

    expect(screen.getByTestId('settings-phone-prefix')).toHaveTextContent('+55');
    expect(screen.getByTestId('settings-email')).toHaveValue('contato@beloauto.com.br');
  });

  it('calls onAddressFieldChange when the street field changes', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithIntl(<SettingsContactSection {...props} />);

    await user.type(screen.getByTestId('settings-address-street'), 'X');
    expect(props.onAddressFieldChange).toHaveBeenCalledWith('street', 'Rua das FloresX');
  });

  it('shows the zip lookup loading and not-found hints', () => {
    const { rerender } = renderWithIntl(<SettingsContactSection {...baseProps()} isLookingUpZip />);
    expect(screen.getByTestId('settings-address-zip-loading')).toBeInTheDocument();

    rerender(<SettingsContactSection {...baseProps()} zipLookupFailed />);
    expect(screen.getByTestId('settings-address-zip-not-found')).toBeInTheDocument();
  });

  it('calls onSocialLinksFieldChange for the WhatsApp field', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithIntl(<SettingsContactSection {...props} />);

    await user.type(screen.getByTestId('settings-social-whatsapp'), '1');
    expect(props.onSocialLinksFieldChange).toHaveBeenCalledWith('whatsapp', '1');
  });
});
