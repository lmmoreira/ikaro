// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteAddressSpec } from '@ikaro/types';
import {
  getHotsiteCustomerProfile,
  updateHotsiteCustomerProfile,
  UpdateHotsiteCustomerProfileError,
} from '@/lib/api/customers';
import { renderWithIntl } from '@/test-utils';
import { InformationCompletionPrompt } from './InformationCompletionPrompt';

vi.mock('@/lib/api/customers', () => ({
  getHotsiteCustomerProfile: vi.fn(),
  updateHotsiteCustomerProfile: vi.fn(),
  UpdateHotsiteCustomerProfileError: class extends Error {
    constructor(
      public readonly status: number,
      public readonly violations: { field: string; message: string }[] = [],
    ) {
      super('mock');
    }
  },
}));

const addressSpec: HotsiteAddressSpec = {
  postalLabel: 'CEP',
  postalPlaceholder: '00000-000',
  stateLabel: 'UF',
  requireNeighborhood: true,
  neighborhoodLabel: 'Bairro',
  streetLabel: 'Rua',
  numberLabel: 'Número',
  complementLabel: 'Complemento',
  cityLabel: 'Cidade',
  lookupService: 'none',
};

const fullAddress = {
  street: 'Rua das Acácias',
  number: '45',
  complement: '',
  neighborhood: 'Jardim América',
  city: 'Belo Horizonte',
  state: 'MG',
  zipCode: '30130-020',
};

const profileEmpty = {
  customerId: 'c-1',
  email: 'joao@example.com',
  name: 'João Silva',
  phone: null,
  defaultAddress: null,
};

const profileComplete = {
  ...profileEmpty,
  phone: '+5511999999999',
  defaultAddress: fullAddress,
};

async function fillAddress(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Rua'), fullAddress.street);
  await userEvent.type(screen.getByLabelText('Número'), fullAddress.number);
  await userEvent.type(screen.getByLabelText('Bairro'), fullAddress.neighborhood);
  await userEvent.type(screen.getByLabelText('Cidade'), fullAddress.city);
  await userEvent.type(screen.getByLabelText('UF'), fullAddress.state);
  await userEvent.type(screen.getByLabelText('CEP'), fullAddress.zipCode);
}

describe('InformationCompletionPrompt', () => {
  const originalBffUrl = process.env.NEXT_PUBLIC_BFF_URL;

  afterEach(() => {
    vi.mocked(getHotsiteCustomerProfile).mockReset();
    vi.mocked(updateHotsiteCustomerProfile).mockReset();
    if (originalBffUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BFF_URL;
    } else {
      process.env.NEXT_PUBLIC_BFF_URL = originalBffUrl;
    }
  });

  it('renders nothing while the profile request is pending', () => {
    vi.mocked(getHotsiteCustomerProfile).mockReturnValue(new Promise(() => {}));

    renderWithIntl(
      <InformationCompletionPrompt
        slug="lavacar-beloauto"
        phonePrefix="+55"
        addressSpec={addressSpec}
      />,
    );

    expect(screen.queryByTestId('information-completion-prompt')).not.toBeInTheDocument();
  });

  it('renders nothing when unauthenticated', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);

    renderWithIntl(
      <InformationCompletionPrompt
        slug="lavacar-beloauto"
        phonePrefix="+55"
        addressSpec={addressSpec}
      />,
    );

    await waitFor(() => expect(getHotsiteCustomerProfile).toHaveBeenCalled());
    expect(screen.queryByTestId('information-completion-prompt')).not.toBeInTheDocument();
  });

  it('renders nothing when both phone and address are already set', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileComplete);

    renderWithIntl(
      <InformationCompletionPrompt
        slug="lavacar-beloauto"
        phonePrefix="+55"
        addressSpec={addressSpec}
      />,
    );

    await waitFor(() => expect(getHotsiteCustomerProfile).toHaveBeenCalled());
    expect(screen.queryByTestId('information-completion-prompt')).not.toBeInTheDocument();
  });

  it('renders the mandatory prompt (no dismiss option) when both are missing', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileEmpty);

    renderWithIntl(
      <InformationCompletionPrompt
        slug="lavacar-beloauto"
        phonePrefix="+55"
        addressSpec={addressSpec}
      />,
    );

    expect(await screen.findByTestId('information-completion-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('information-completion-phone-prefix')).toHaveTextContent('+55');
    expect(screen.queryByText(/agora não/i)).not.toBeInTheDocument();
  });

  it('offers a sign-out link as the escape hatch for a customer who does not want to fill it in', async () => {
    process.env.NEXT_PUBLIC_BFF_URL = 'http://bff-test:3002/v1';
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileEmpty);

    renderWithIntl(
      <InformationCompletionPrompt
        slug="lavacar-beloauto"
        phonePrefix="+55"
        addressSpec={addressSpec}
      />,
    );

    const logoutLink = await screen.findByTestId('information-completion-logout');
    expect(logoutLink).toHaveAttribute(
      'href',
      'http://bff-test:3002/v1/auth/logout?tenantSlug=lavacar-beloauto',
    );
  });

  it('renders the prompt and pre-fills phone when only address is missing', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue({
      ...profileEmpty,
      phone: '+5511999999999',
    });

    renderWithIntl(
      <InformationCompletionPrompt
        slug="lavacar-beloauto"
        phonePrefix="+55"
        addressSpec={addressSpec}
      />,
    );

    expect(await screen.findByTestId('information-completion-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('information-completion-phone-input')).toHaveValue('(11) 99999-9999');
  });

  it('shows the phone error and does not submit when phone is invalid', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileEmpty);
    renderWithIntl(
      <InformationCompletionPrompt
        slug="lavacar-beloauto"
        phonePrefix="+55"
        addressSpec={addressSpec}
      />,
    );
    await screen.findByTestId('information-completion-prompt');

    await userEvent.type(screen.getByTestId('information-completion-phone-input'), '1199999');
    await userEvent.click(screen.getByTestId('information-completion-submit'));

    expect(await screen.findByTestId('information-completion-error')).toHaveTextContent(
      'Digite um número de telefone válido (10 ou 11 dígitos).',
    );
    expect(updateHotsiteCustomerProfile).not.toHaveBeenCalled();
  });

  it('highlights address fields and does not submit when phone is valid but address is incomplete', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileEmpty);
    renderWithIntl(
      <InformationCompletionPrompt
        slug="lavacar-beloauto"
        phonePrefix="+55"
        addressSpec={addressSpec}
      />,
    );
    await screen.findByTestId('information-completion-prompt');

    await userEvent.type(screen.getByTestId('information-completion-phone-input'), '1199999999');
    await userEvent.click(screen.getByTestId('information-completion-submit'));

    expect(screen.getByLabelText('Rua')).toHaveAttribute('aria-invalid', 'true');
    expect(updateHotsiteCustomerProfile).not.toHaveBeenCalled();
  });

  it('submits phone + address together once both are valid', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileEmpty);
    vi.mocked(updateHotsiteCustomerProfile).mockResolvedValue(profileComplete);
    renderWithIntl(
      <InformationCompletionPrompt
        slug="lavacar-beloauto"
        phonePrefix="+55"
        addressSpec={addressSpec}
      />,
    );
    await screen.findByTestId('information-completion-prompt');

    await userEvent.type(screen.getByTestId('information-completion-phone-input'), '1199999999');
    await fillAddress();
    await userEvent.click(screen.getByTestId('information-completion-submit'));

    await waitFor(() =>
      expect(updateHotsiteCustomerProfile).toHaveBeenCalledWith('lavacar-beloauto', {
        phone: '+551199999999',
        defaultAddress: fullAddress,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('information-completion-prompt')).not.toBeInTheDocument(),
    );
  }, 15000);

  it('shows the address error and re-highlights fields on a defaultAddress violation', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileEmpty);
    vi.mocked(updateHotsiteCustomerProfile).mockRejectedValue(
      new UpdateHotsiteCustomerProfileError(400, [
        { field: 'defaultAddress.zipCode', message: 'invalid' },
      ]),
    );
    renderWithIntl(
      <InformationCompletionPrompt
        slug="lavacar-beloauto"
        phonePrefix="+55"
        addressSpec={addressSpec}
      />,
    );
    await screen.findByTestId('information-completion-prompt');

    await userEvent.type(screen.getByTestId('information-completion-phone-input'), '1199999999');
    await fillAddress();
    await userEvent.click(screen.getByTestId('information-completion-submit'));

    expect(await screen.findByTestId('information-completion-error')).toHaveTextContent(
      'Verifique os dados do endereço e tente novamente.',
    );
  }, 15000);

  it('shows the address error on a 400 with no violations array (e.g. a backend Address VO rejection)', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileEmpty);
    vi.mocked(updateHotsiteCustomerProfile).mockRejectedValue(
      new UpdateHotsiteCustomerProfileError(400),
    );
    renderWithIntl(
      <InformationCompletionPrompt
        slug="lavacar-beloauto"
        phonePrefix="+55"
        addressSpec={addressSpec}
      />,
    );
    await screen.findByTestId('information-completion-prompt');

    await userEvent.type(screen.getByTestId('information-completion-phone-input'), '1199999999');
    await fillAddress();
    await userEvent.click(screen.getByTestId('information-completion-submit'));

    expect(await screen.findByTestId('information-completion-error')).toHaveTextContent(
      'Verifique os dados do endereço e tente novamente.',
    );
    expect(screen.getByLabelText('Rua')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a generic error message on a non-violation failure', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileEmpty);
    vi.mocked(updateHotsiteCustomerProfile).mockRejectedValue(
      new UpdateHotsiteCustomerProfileError(502),
    );
    renderWithIntl(
      <InformationCompletionPrompt
        slug="lavacar-beloauto"
        phonePrefix="+55"
        addressSpec={addressSpec}
      />,
    );
    await screen.findByTestId('information-completion-prompt');

    await userEvent.type(screen.getByTestId('information-completion-phone-input'), '1199999999');
    await fillAddress();
    await userEvent.click(screen.getByTestId('information-completion-submit'));

    expect(await screen.findByTestId('information-completion-error')).toHaveTextContent(
      'Erro ao salvar. Tente novamente.',
    );
  });
});
