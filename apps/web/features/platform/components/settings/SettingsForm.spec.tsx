// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantSettingsResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { SettingsForm } from './SettingsForm';

const mockUpdateTenantSettings = vi.fn();
const mockRenameTenant = vi.fn();

vi.mock('@/features/platform/tenant-settings', () => ({
  updateTenantSettings: (...args: unknown[]) => mockUpdateTenantSettings(...args),
  renameTenant: (...args: unknown[]) => mockRenameTenant(...args),
}));

function buildTenant(): TenantSettingsResponse {
  return {
    tenantId: 'tenant-1',
    name: 'BeloAuto Demo',
    slug: 'beloauto',
    settings: {
      loyalty: {
        expiryDays: 180,
        enableNotifications: true,
        expiryWarningDays: 15,
        notificationMinPoints: 10,
        pointsPerCurrencyUnit: 10,
      },
      booking: {
        cancellationWindowHours: 48,
        autoApproveEnabled: false,
        minBookingAdvanceHours: 2,
        maxBookingAdvanceDays: 60,
        serviceBufferMinutes: 60,
        slotGranularityMinutes: 30,
      },
      businessHours: {
        timezone: 'America/Sao_Paulo',
        monday: { open: '08:00', close: '18:00' },
        tuesday: { open: '08:00', close: '18:00' },
        wednesday: { open: '08:00', close: '18:00' },
        thursday: { open: '08:00', close: '18:00' },
        friday: { open: '08:00', close: '18:00' },
        saturday: { open: '09:00', close: '13:00' },
        sunday: null,
      },
      localization: {
        countryCode: 'BR',
        currency: 'BRL',
        currencySymbol: 'R$',
        language: 'pt-BR',
        decimalPlaces: 2,
      },
      businessInfo: {
        phone: '31999999999',
        email: 'contato@beloauto.com.br',
        address: {
          street: 'Rua das Flores',
          number: '123',
          neighborhood: 'Centro',
          city: 'Belo Horizonte',
          state: 'MG',
          zipCode: '30000-000',
        },
        socialLinks: null,
      },
    },
  };
}

describe('SettingsForm', () => {
  beforeEach(() => {
    mockUpdateTenantSettings.mockReset().mockResolvedValue(buildTenant());
    mockRenameTenant.mockReset().mockResolvedValue({ tenantId: 'tenant-1', name: 'Novo Nome' });
  });

  it('pre-fills all five sections from the initial settings', () => {
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    expect(screen.getByLabelText('Nome do estabelecimento *')).toHaveValue('BeloAuto Demo');
    expect(screen.getByLabelText('Janela de cancelamento')).toHaveValue(48);
    expect(screen.getByLabelText('Buffer entre agendamentos')).toHaveValue(60);
    expect(screen.getByLabelText('Validade dos pontos de fidelidade')).toHaveValue(180);
    expect(screen.getByLabelText('Pontos por unidade monetária')).toHaveValue(10);
    expect(screen.getByLabelText('Fuso horário *')).toHaveValue('America/Sao_Paulo');
    expect(screen.getByLabelText('Telefone')).toHaveValue('31999999999');
    expect(screen.getByLabelText('E-mail')).toHaveValue('contato@beloauto.com.br');
    expect(screen.getByLabelText('Cidade')).toHaveValue('Belo Horizonte');
  });

  it('renders the slug as a disabled, visually distinct input', () => {
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    const slug = screen.getByLabelText('Slug (endereço do site)');
    expect(slug).toBeDisabled();
    expect(slug).toHaveValue('beloauto');
    expect(slug.className).toContain('bg-gray-100');
  });

  it('marks sunday as closed and disables its time inputs', () => {
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    expect(screen.getByLabelText('Fechado — Domingo')).toBeChecked();
    expect(screen.getByLabelText('Abre — Domingo')).toBeDisabled();
    expect(screen.getByLabelText('Abre — Segunda')).not.toBeDisabled();
  });

  it('shows an inline error on cancellationWindowHours > 720 and preserves other values', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    const field = screen.getByLabelText('Janela de cancelamento');
    await user.clear(field);
    await user.type(field, '721');
    await user.click(screen.getByTestId('settings-submit'));

    expect(screen.getByText('O valor máximo é 720 horas (30 dias).')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do estabelecimento *')).toHaveValue('BeloAuto Demo');
    expect(screen.getByLabelText('Buffer entre agendamentos')).toHaveValue(60);
    expect(mockUpdateTenantSettings).not.toHaveBeenCalled();
  });

  it('accepts pointsPerCurrencyUnit of 0 and sends it in the PATCH body', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    const field = screen.getByLabelText('Pontos por unidade monetária');
    await user.clear(field);
    await user.type(field, '0');
    await user.click(screen.getByTestId('settings-submit'));

    expect(mockUpdateTenantSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          loyalty: expect.objectContaining({ pointsPerCurrencyUnit: 0 }),
        }),
      }),
    );
  });

  it('rejects pointsPerCurrencyUnit above 10000 with the inline error', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    const field = screen.getByLabelText('Pontos por unidade monetária');
    await user.clear(field);
    await user.type(field, '10001');
    await user.click(screen.getByTestId('settings-submit'));

    expect(screen.getByText('Máximo 10000')).toBeInTheDocument();
    expect(mockUpdateTenantSettings).not.toHaveBeenCalled();
  });

  it('shows the success banner and stays on the page after a save', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    await user.click(screen.getByTestId('settings-submit'));

    expect(await screen.findByTestId('settings-saved-banner')).toBeInTheDocument();
    expect(screen.getByText('Configurações salvas!')).toBeInTheDocument();
    expect(mockRenameTenant).not.toHaveBeenCalled();
  });

  it('calls renameTenant only when the name changed', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    const name = screen.getByLabelText('Nome do estabelecimento *');
    await user.clear(name);
    await user.type(name, 'Novo Nome');
    await user.click(screen.getByTestId('settings-submit'));

    expect(await screen.findByTestId('settings-saved-banner')).toBeInTheDocument();
    expect(mockRenameTenant).toHaveBeenCalledWith({ name: 'Novo Nome' });
  });

  it('shows a generic submit error when the server rejects the save', async () => {
    mockUpdateTenantSettings.mockRejectedValueOnce(new Error('400'));
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    await user.click(screen.getByTestId('settings-submit'));

    expect(await screen.findByTestId('settings-submit-error')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-saved-banner')).not.toBeInTheDocument();
  });
});
