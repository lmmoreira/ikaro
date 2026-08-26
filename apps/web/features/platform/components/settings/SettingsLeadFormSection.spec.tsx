// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import type { SettingsFormValues } from '@/features/platform/settings-form';
import { SettingsLeadFormSection } from './SettingsLeadFormSection';

function buildValues(overrides?: Partial<SettingsFormValues>): SettingsFormValues {
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
    retentionMonths: '6',
    maxSubmissionsPerDay: '100',
    maxSubmissionsPerIpPerDay: '3',
    ...overrides,
  };
}

describe('SettingsLeadFormSection', () => {
  it('renders all three fields with their current values', () => {
    renderWithIntl(
      <SettingsLeadFormSection values={buildValues()} fieldErrors={{}} onFieldChange={vi.fn()} />,
    );

    expect(screen.getByTestId('settings-lead-form-retention-months')).toHaveValue(6);
    expect(screen.getByTestId('settings-lead-form-max-submissions-per-day')).toHaveValue(100);
    expect(screen.getByTestId('settings-lead-form-max-submissions-per-ip-per-day')).toHaveValue(3);
  });

  it('calls onFieldChange with the right key for each field', () => {
    const onFieldChange = vi.fn();
    renderWithIntl(
      <SettingsLeadFormSection
        values={buildValues()}
        fieldErrors={{}}
        onFieldChange={onFieldChange}
      />,
    );

    fireEvent.change(screen.getByTestId('settings-lead-form-retention-months'), {
      target: { value: '12' },
    });
    expect(onFieldChange).toHaveBeenCalledWith('retentionMonths', '12');

    fireEvent.change(screen.getByTestId('settings-lead-form-max-submissions-per-day'), {
      target: { value: '200' },
    });
    expect(onFieldChange).toHaveBeenCalledWith('maxSubmissionsPerDay', '200');

    fireEvent.change(screen.getByTestId('settings-lead-form-max-submissions-per-ip-per-day'), {
      target: { value: '5' },
    });
    expect(onFieldChange).toHaveBeenCalledWith('maxSubmissionsPerIpPerDay', '5');
  });

  it('shows the inline error instead of the hint when present', () => {
    renderWithIntl(
      <SettingsLeadFormSection
        values={buildValues({ retentionMonths: '30' })}
        fieldErrors={{ retentionMonths: 'A retenção deve estar entre 1 e 24 meses.' }}
        onFieldChange={vi.fn()}
      />,
    );

    expect(screen.getByText('A retenção deve estar entre 1 e 24 meses.')).toBeInTheDocument();
  });

  it('only shows the error for the field that failed, others keep their hint', () => {
    renderWithIntl(
      <SettingsLeadFormSection
        values={buildValues()}
        fieldErrors={{
          maxSubmissionsPerDay: 'O limite diário de envios deve estar entre 1 e 1000.',
        }}
        onFieldChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText('O limite diário de envios deve estar entre 1 e 1000.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('settings-lead-form-retention-months-error'),
    ).not.toBeInTheDocument();
  });
});
