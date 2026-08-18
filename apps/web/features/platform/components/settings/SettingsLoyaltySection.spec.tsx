// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import type { SettingsFormValues } from '@/features/platform/settings-form';
import { SettingsLoyaltySection } from './SettingsLoyaltySection';

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

describe('SettingsLoyaltySection', () => {
  it('renders loyalty fields and calls onFieldChange for the points-per-unit input', async () => {
    const user = userEvent.setup();
    const onFieldChange = vi.fn();
    renderWithIntl(
      <SettingsLoyaltySection
        values={buildValues()}
        fieldErrors={{}}
        onFieldChange={onFieldChange}
      />,
    );

    expect(screen.getByTestId('settings-loyalty-expiry')).toHaveValue(180);
    await user.type(screen.getByTestId('settings-points-per-unit-input'), '5');
    expect(onFieldChange).toHaveBeenCalledWith('pointsPerCurrencyUnit', expect.any(String));
  });

  it('toggles the loyalty-notifications switch via onFieldChange', async () => {
    const user = userEvent.setup();
    const onFieldChange = vi.fn();
    renderWithIntl(
      <SettingsLoyaltySection
        values={buildValues()}
        fieldErrors={{}}
        onFieldChange={onFieldChange}
      />,
    );

    await user.click(screen.getByTestId('settings-loyalty-notifications-switch'));
    expect(onFieldChange).toHaveBeenCalledWith('loyaltyEnableNotifications', false);
  });

  it('renders field errors when present', () => {
    renderWithIntl(
      <SettingsLoyaltySection
        values={buildValues()}
        fieldErrors={{ pointsPerCurrencyUnit: 'Inválido' }}
        onFieldChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Inválido')).toBeInTheDocument();
  });
});
