// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import type { SettingsFormValues } from '@/features/platform/settings-form';
import { SettingsBookingSection } from './SettingsBookingSection';

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
  };
}

describe('SettingsBookingSection', () => {
  it('renders the booking fields and calls onFieldChange for a text field', () => {
    const onFieldChange = vi.fn();
    renderWithIntl(
      <SettingsBookingSection
        values={buildValues()}
        fieldErrors={{}}
        onFieldChange={onFieldChange}
      />,
    );

    const cancellationInput = screen.getByTestId('settings-cancellation-window');
    expect(cancellationInput).toHaveValue(48);

    // The field's displayed value is driven by a static prop in this test (no parent state
    // update), so a real controlled-input reset happens between user.clear() and user.type()
    // keystrokes — a single fireEvent.change is the reliable way to assert one resulting value.
    fireEvent.change(cancellationInput, { target: { value: '5' } });
    expect(onFieldChange).toHaveBeenCalledWith('cancellationWindowHours', '5');
  });

  it('toggles the auto-approve switch via onFieldChange', async () => {
    const user = userEvent.setup();
    const onFieldChange = vi.fn();
    renderWithIntl(
      <SettingsBookingSection
        values={buildValues()}
        fieldErrors={{}}
        onFieldChange={onFieldChange}
      />,
    );

    await user.click(screen.getByTestId('settings-auto-approve-switch'));
    expect(onFieldChange).toHaveBeenCalledWith('autoApproveEnabled', true);
  });

  it('renders a field error message when present', () => {
    renderWithIntl(
      <SettingsBookingSection
        values={buildValues()}
        fieldErrors={{ cancellationWindowHours: 'Valor inválido' }}
        onFieldChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Valor inválido')).toBeInTheDocument();
  });
});
