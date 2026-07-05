// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantSettingsResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { InMemoryAddressLookup } from '@/shared/lib/address/in-memory-address-lookup';
import { SettingsForm } from './SettingsForm';

// This form renders ~30-40 Radix Select instances (7 days × 2 time pickers × hour/minute
// selects, plus slot-granularity/timezone selects) — real browsers handle that instantly, but
// jsdom's simulation is heavy enough that a single interactive test can approach the default
// 10s timeout in isolation, and exceed a 20s timeout under full-suite parallel contention
// (observed: 23/23 pass in isolation, but a few time out when all ~165 spec files run
// concurrently). Raise it further here, for this file only, to give real headroom.
vi.setConfig({ testTimeout: 40000 });

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
        welcomeStaffScreenDays: 14,
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
        phone: '+5531999999999',
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
      notification: { fromEmail: null },
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
    expect(screen.getByLabelText('Telefone')).toHaveValue('(31) 99999-9999');
    expect(screen.getByTestId('settings-phone-prefix')).toHaveTextContent('+55');
    expect(screen.getByLabelText('E-mail')).toHaveValue('contato@beloauto.com.br');
    expect(screen.getByLabelText('Cidade')).toHaveValue('Belo Horizonte');
  });

  it('renders the localization section as read-only display values', () => {
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    expect(screen.getByText('País')).toBeInTheDocument();
    expect(screen.getByText('BR')).toBeInTheDocument();
    expect(screen.getByText('Moeda')).toBeInTheDocument();
    expect(screen.getByText('BRL')).toBeInTheDocument();
    expect(screen.getByText('Idioma')).toBeInTheDocument();
    expect(screen.getByText('pt-BR')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'País' })).not.toBeInTheDocument();
  });

  it('pre-fills the new booking, loyalty, notification, and social fields', () => {
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    expect(screen.getByRole('switch', { name: /Aprovação automática/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByLabelText('Antecedência mínima para agendar')).toHaveValue(2);
    expect(screen.getByLabelText('Horizonte máximo de agendamento')).toHaveValue(60);
    expect(screen.getByLabelText('Granularidade de Slot')).toHaveValue('30');
    expect(screen.getByLabelText('Janela da fila de atendimento')).toHaveValue(14);
    expect(
      screen.getByRole('switch', { name: /Notificações de expiração de pontos/ }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Aviso de expiração dos pontos')).toHaveValue(15);
    expect(screen.getByLabelText('Saldo mínimo para notificar')).toHaveValue(10);
    expect(screen.getByLabelText('E-mail de envio das notificações')).toHaveValue('');
    expect(screen.getByLabelText('WhatsApp')).toHaveValue('');
    expect(screen.getByLabelText('Instagram')).toHaveValue('');
    expect(screen.getByLabelText('Facebook')).toHaveValue('');
  });

  it('renders both the sticky desktop action pane and the mobile fixed submit bar', () => {
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    expect(screen.getByTestId('settings-submit-desktop')).toBeInTheDocument();
    expect(screen.getByTestId('settings-submit-mobile')).toBeInTheDocument();
    expect(screen.getByText(/As configurações afetam novos agendamentos/)).toBeInTheDocument();
  });

  it('renders the slug as a disabled, visually distinct input', () => {
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    const slug = screen.getByLabelText('Slug (endereço do site)');
    expect(slug).toBeDisabled();
    expect(slug).toHaveValue('beloauto');
    expect(slug.className).toContain('bg-gray-100');
  });

  it('marks sunday as closed and disables its time pickers', () => {
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    expect(screen.getByLabelText('Fechado — Domingo')).toBeChecked();
    expect(screen.getByLabelText('Abre — Hora — Domingo')).toBeDisabled();
    expect(screen.getByLabelText('Abre — Minuto — Domingo')).toBeDisabled();
    expect(screen.getByLabelText('Abre — Hora — Segunda')).not.toBeDisabled();
  });

  it('shows a "copy to weekdays" button only on Monday and applies its time to Tue-Fri', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    expect(screen.getByTestId('day-copy-monday')).toBeInTheDocument();
    expect(screen.queryByTestId('day-copy-tuesday')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Abre — Hora — Segunda'));
    await user.click(screen.getByRole('option', { name: '07' }));
    await user.click(screen.getByTestId('day-copy-monday'));

    expect(screen.getByLabelText('Abre — Hora — Terça')).toHaveTextContent('07');
    expect(screen.getByLabelText('Abre — Hora — Sexta')).toHaveTextContent('07');
    expect(screen.getByLabelText('Abre — Hora — Sábado')).not.toHaveTextContent('07');
  });

  it('shows an inline error on cancellationWindowHours > 720 and preserves other values', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    const field = screen.getByLabelText('Janela de cancelamento');
    await user.clear(field);
    await user.type(field, '721');
    await user.click(screen.getByTestId('settings-submit-desktop'));

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
    await user.click(screen.getByTestId('settings-submit-desktop'));

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
    await user.click(screen.getByTestId('settings-submit-desktop'));

    expect(screen.getByText('Máximo 10000')).toBeInTheDocument();
    expect(mockUpdateTenantSettings).not.toHaveBeenCalled();
  });

  it('shows the success banner and stays on the page after a save', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    await user.click(screen.getByTestId('settings-submit-desktop'));

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
    await user.click(screen.getByTestId('settings-submit-desktop'));

    expect(await screen.findByTestId('settings-saved-banner')).toBeInTheDocument();
    expect(mockRenameTenant).toHaveBeenCalledWith({ name: 'Novo Nome' });
  });

  it('shows a generic submit error when the server rejects the save', async () => {
    mockUpdateTenantSettings.mockRejectedValueOnce(new Error('400'));
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    await user.click(screen.getByTestId('settings-submit-desktop'));

    expect(await screen.findByTestId('settings-submit-error')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-saved-banner')).not.toBeInTheDocument();
  });

  it('saves successfully with the address left entirely blank (sent as null)', async () => {
    const tenant = buildTenant();
    const noAddressTenant: TenantSettingsResponse = {
      ...tenant,
      settings: {
        ...tenant.settings,
        businessInfo: { ...tenant.settings.businessInfo!, address: null },
      },
    };
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={noAddressTenant} />);

    await user.click(screen.getByTestId('settings-submit-desktop'));

    expect(await screen.findByTestId('settings-saved-banner')).toBeInTheDocument();
    expect(mockUpdateTenantSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          businessInfo: expect.objectContaining({ address: null }),
        }),
      }),
    );
  });

  it('shows an inline error and blocks submit when only part of the address is filled in', async () => {
    const tenant = buildTenant();
    const noAddressTenant: TenantSettingsResponse = {
      ...tenant,
      settings: {
        ...tenant.settings,
        businessInfo: { ...tenant.settings.businessInfo!, address: null },
      },
    };
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={noAddressTenant} />);

    await user.type(screen.getByLabelText('Cidade'), 'Belo Horizonte');
    await user.click(screen.getByTestId('settings-submit-desktop'));

    expect(screen.getByText('Informe a rua.')).toBeInTheDocument();
    expect(screen.getByText('Informe o CEP.')).toBeInTheDocument();
    expect(mockUpdateTenantSettings).not.toHaveBeenCalled();
  });

  it('masks the phone as digits-only-with-mask, keeping the +55 prefix as a fixed adornment', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    const phone = screen.getByLabelText('Telefone');
    await user.clear(phone);
    await user.type(phone, '31988887777');

    expect(phone).toHaveValue('(31) 98888-7777');
    expect(screen.getByTestId('settings-phone-prefix')).toHaveTextContent('+55');
  });

  it('sends the phone as full E.164 (prefix + digits) on save', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    const phone = screen.getByLabelText('Telefone');
    await user.clear(phone);
    await user.type(phone, '31988887777');
    await user.click(screen.getByTestId('settings-submit-desktop'));

    expect(mockUpdateTenantSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          businessInfo: expect.objectContaining({ phone: '+5531988887777' }),
        }),
      }),
    );
  });

  it('masks the CEP as 00000-000 while typing', async () => {
    const user = userEvent.setup();
    const lookup = new InMemoryAddressLookup({});
    renderWithIntl(<SettingsForm initial={buildTenant()} addressLookup={lookup} />);

    const zip = screen.getByLabelText('CEP');
    await user.clear(zip);
    await user.type(zip, '30130100');

    expect(zip).toHaveValue('30130-100');
  });

  it('auto-fills street/neighborhood/city/state once a full 8-digit CEP is typed', async () => {
    const lookup = new InMemoryAddressLookup({
      '30130100': {
        street: 'Avenida Afonso Pena',
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
      },
    });
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} addressLookup={lookup} />);

    const zip = screen.getByLabelText('CEP');
    await user.clear(zip);
    await user.type(zip, '30130100');

    expect(await screen.findByDisplayValue('Avenida Afonso Pena')).toBeInTheDocument();
    expect(lookup.calls).toEqual(['30130100']);
  });

  it('shows a not-found message when the CEP lookup returns nothing', async () => {
    const lookup = new InMemoryAddressLookup({});
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} addressLookup={lookup} />);

    const zip = screen.getByLabelText('CEP');
    await user.clear(zip);
    await user.type(zip, '99999999');

    expect(await screen.findByTestId('settings-address-zip-not-found')).toBeInTheDocument();
  });

  it('toggles autoApproveEnabled and sends it in the PATCH body', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    await user.click(screen.getByRole('switch', { name: /Aprovação automática/ }));
    await user.click(screen.getByTestId('settings-submit-desktop'));

    expect(mockUpdateTenantSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          booking: expect.objectContaining({ autoApproveEnabled: true }),
        }),
      }),
    );
  });

  it('accepts a blank notification.fromEmail as null and rejects an invalid one inline', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    await user.click(screen.getByTestId('settings-submit-desktop'));
    expect(await screen.findByTestId('settings-saved-banner')).toBeInTheDocument();
    expect(mockUpdateTenantSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          notification: { fromEmail: null },
        }),
      }),
    );

    await user.type(screen.getByLabelText('E-mail de envio das notificações'), 'not-an-email');
    await user.click(screen.getByTestId('settings-submit-desktop'));

    expect(screen.getByTestId('settings-notification-from-email-error')).toHaveTextContent(
      'E-mail inválido.',
    );
  });

  it('sends socialLinks as null when all three fields are blank, and masks whatsapp otherwise', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SettingsForm initial={buildTenant()} />);

    await user.click(screen.getByTestId('settings-submit-desktop'));
    expect(await screen.findByTestId('settings-saved-banner')).toBeInTheDocument();
    expect(mockUpdateTenantSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          businessInfo: expect.objectContaining({ socialLinks: null }),
        }),
      }),
    );

    const whatsapp = screen.getByLabelText('WhatsApp');
    await user.type(whatsapp, '31988887777');
    expect(whatsapp).toHaveValue('(31) 98888-7777');

    await user.click(screen.getByTestId('settings-submit-desktop'));
    expect(mockUpdateTenantSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          businessInfo: expect.objectContaining({
            socialLinks: { whatsapp: '+5531988887777', instagram: null, facebook: null },
          }),
        }),
      }),
    );
  });
});
