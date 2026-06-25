// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getHotsiteCustomerProfile,
  updateHotsiteCustomerProfile,
  UpdateHotsiteCustomerProfileError,
} from '@/lib/api/customers';
import { renderWithIntl } from '@/test-utils';
import { PhoneCompletionPrompt } from './PhoneCompletionPrompt';

vi.mock('@/lib/api/customers', () => ({
  getHotsiteCustomerProfile: vi.fn(),
  updateHotsiteCustomerProfile: vi.fn(),
  UpdateHotsiteCustomerProfileError: class extends Error {
    constructor(public readonly status: number) {
      super('mock');
    }
  },
}));

const profileWithoutPhone = {
  customerId: 'c-1',
  email: 'joao@example.com',
  name: 'João Silva',
  phone: null,
  defaultAddress: null,
};

const profileWithPhone = { ...profileWithoutPhone, phone: '+5511999999999' };

describe('PhoneCompletionPrompt', () => {
  afterEach(() => {
    vi.mocked(getHotsiteCustomerProfile).mockReset();
    vi.mocked(updateHotsiteCustomerProfile).mockReset();
  });

  it('renders nothing while the profile request is pending', () => {
    vi.mocked(getHotsiteCustomerProfile).mockReturnValue(new Promise(() => {}));

    renderWithIntl(<PhoneCompletionPrompt phonePrefix="+55" />);

    expect(screen.queryByTestId('phone-completion-prompt')).not.toBeInTheDocument();
  });

  it('renders nothing when unauthenticated', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);

    renderWithIntl(<PhoneCompletionPrompt phonePrefix="+55" />);

    await waitFor(() => expect(getHotsiteCustomerProfile).toHaveBeenCalled());
    expect(screen.queryByTestId('phone-completion-prompt')).not.toBeInTheDocument();
  });

  it('renders nothing when the customer already has a phone', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileWithPhone);

    renderWithIntl(<PhoneCompletionPrompt phonePrefix="+55" />);

    await waitFor(() => expect(getHotsiteCustomerProfile).toHaveBeenCalled());
    expect(screen.queryByTestId('phone-completion-prompt')).not.toBeInTheDocument();
  });

  it('renders the mandatory sheet (no dismiss option) when phone is missing', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileWithoutPhone);

    renderWithIntl(<PhoneCompletionPrompt phonePrefix="+55" />);

    expect(await screen.findByTestId('phone-completion-prompt')).toBeInTheDocument();
    expect(screen.getByTestId('phone-completion-prefix')).toHaveTextContent('+55');
    expect(screen.queryByText(/agora não/i)).not.toBeInTheDocument();
  });

  it('disables submit while the input has fewer than 10 digits', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileWithoutPhone);
    renderWithIntl(<PhoneCompletionPrompt phonePrefix="+55" />);
    await screen.findByTestId('phone-completion-prompt');

    const input = screen.getByTestId('phone-completion-input');
    await userEvent.type(input, '1199999');

    expect(screen.getByTestId('phone-completion-submit')).toBeDisabled();
  });

  it('enables submit at 10 digits and builds an E.164 phone with the prefix on submit', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileWithoutPhone);
    vi.mocked(updateHotsiteCustomerProfile).mockResolvedValue(profileWithPhone);
    renderWithIntl(<PhoneCompletionPrompt phonePrefix="+55" />);
    await screen.findByTestId('phone-completion-prompt');

    const input = screen.getByTestId('phone-completion-input');
    await userEvent.type(input, '1199999999');
    expect(screen.getByTestId('phone-completion-submit')).not.toBeDisabled();

    await userEvent.click(screen.getByTestId('phone-completion-submit'));

    await waitFor(() =>
      expect(updateHotsiteCustomerProfile).toHaveBeenCalledWith({ phone: '+551199999999' }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('phone-completion-prompt')).not.toBeInTheDocument(),
    );
  });

  it('shows the validation message on a 400 and keeps the sheet open', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileWithoutPhone);
    vi.mocked(updateHotsiteCustomerProfile).mockRejectedValue(
      new UpdateHotsiteCustomerProfileError(400),
    );
    renderWithIntl(<PhoneCompletionPrompt phonePrefix="+55" />);
    await screen.findByTestId('phone-completion-prompt');

    await userEvent.type(screen.getByTestId('phone-completion-input'), '1199999999');
    await userEvent.click(screen.getByTestId('phone-completion-submit'));

    expect(await screen.findByTestId('phone-completion-error')).toHaveTextContent(
      'Digite um número de telefone válido (10 ou 11 dígitos).',
    );
    expect(screen.getByTestId('phone-completion-prompt')).toBeInTheDocument();
  });

  it('shows a generic error message on a non-400 failure', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profileWithoutPhone);
    vi.mocked(updateHotsiteCustomerProfile).mockRejectedValue(
      new UpdateHotsiteCustomerProfileError(502),
    );
    renderWithIntl(<PhoneCompletionPrompt phonePrefix="+55" />);
    await screen.findByTestId('phone-completion-prompt');

    await userEvent.type(screen.getByTestId('phone-completion-input'), '1199999999');
    await userEvent.click(screen.getByTestId('phone-completion-submit'));

    expect(await screen.findByTestId('phone-completion-error')).toHaveTextContent(
      'Erro ao salvar. Tente novamente.',
    );
  });
});
