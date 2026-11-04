// @vitest-environment jsdom
import { renderWithIntl, hotsiteServiceBookingDefaults } from '@/test-utils';
import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AvailableSlot, HotsiteAddressSpec, HotsiteServiceResponse } from '@ikaro/types';
import type { StepError } from '@/features/booking/hooks/useBookingFlow';
import { emptyPersonalInfo, type PersonalInfoValue } from '@/features/booking/model/personal-info';
import { PersonalInfoStep } from './PersonalInfoStep';

const BR_ADDRESS_SPEC: HotsiteAddressSpec = {
  postalLabel: 'CEP',
  postalPlaceholder: '00000-000',
  stateLabel: 'UF',
  requireNeighborhood: true,
  neighborhoodLabel: 'Bairro',
  streetLabel: 'Rua',
  numberLabel: 'Número',
  complementLabel: 'Complemento',
  cityLabel: 'Cidade',
  lookupService: 'viacep',
};

vi.mock('@/features/booking/api/public', () => ({
  createAttachmentSignedUrl: vi.fn(),
}));

const service: HotsiteServiceResponse = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Lavagem Simples',
  description: '',
  price: { amount: 60, currency: 'BRL', formatted: 'R$ 60,00' },
  durationMinutes: 30,
  loyaltyPointsValue: 5,
  requiresPickupAddress: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...hotsiteServiceBookingDefaults,
};

const slot: AvailableSlot = {
  startsAt: '2026-06-18T13:00:00.000Z',
  appointmentEndsAt: '2026-06-18T14:00:00.000Z',
  endsAt: '2026-06-18T14:00:00.000Z',
};

function Wrapper({
  onNext = vi.fn(),
  onBack = vi.fn(),
  phonePrefix = '+55',
  addressSpec = BR_ADDRESS_SPEC,
  hideContactFields = false,
  submitError = null,
}: {
  readonly onNext?: () => void;
  readonly onBack?: () => void;
  readonly phonePrefix?: string;
  readonly addressSpec?: HotsiteAddressSpec;
  readonly hideContactFields?: boolean;
  readonly submitError?: StepError | null;
}) {
  const [value, setValue] = useState<PersonalInfoValue>(emptyPersonalInfo());
  return (
    <PersonalInfoStep
      slug="lavacar-beloauto"
      value={value}
      onChange={setValue}
      services={[service]}
      selectedServiceIds={[service.id]}
      selectedDate="2026-06-18"
      selectedSlot={slot}
      phonePrefix={phonePrefix}
      addressSpec={addressSpec}
      hideContactFields={hideContactFields}
      submitError={submitError}
      onNext={onNext}
      onBack={onBack}
    />
  );
}

describe('PersonalInfoStep', () => {
  it('renders the contact fields', () => {
    renderWithIntl(<Wrapper />);

    expect(screen.getByLabelText('Nome')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Telefone')).toBeInTheDocument();
  });

  it('hides contact fields and the optional address toggle for authenticated customers', () => {
    renderWithIntl(<Wrapper hideContactFields />);

    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Telefone')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toggle-contact-address')).not.toBeInTheDocument();
  });

  it('lets authenticated customers advance without validation', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderWithIntl(<Wrapper hideContactFields onNext={onNext} />);

    await user.click(screen.getByRole('button', { name: 'Próximo' }));

    expect(onNext).toHaveBeenCalled();
  });

  it('keeps the contact address section collapsed until toggled', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(<Wrapper />);

    expect(container.querySelector('#contact-address-street')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Endereço de contato (opcional)' }));

    expect(container.querySelector('#contact-address-street')).toBeInTheDocument();
  });

  it('shows a validation error and does not call onNext when required fields are empty', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderWithIntl(<Wrapper onNext={onNext} />);

    await user.click(screen.getByRole('button', { name: 'Próximo' }));

    expect(screen.getByTestId('personal-info-error')).toHaveTextContent('Informe seu nome.');
    expect(onNext).not.toHaveBeenCalled();
  });

  it('shows a validation error when the email is invalid', async () => {
    const user = userEvent.setup();
    renderWithIntl(<Wrapper />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('E-mail'), 'not-an-email');
    await user.type(screen.getByLabelText('Telefone'), '11999999999');
    await user.click(screen.getByRole('button', { name: 'Próximo' }));

    expect(screen.getByTestId('personal-info-error')).toHaveTextContent(
      'Informe um e-mail válido.',
    );
  });

  it('calls onNext when all required fields are filled', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderWithIntl(<Wrapper onNext={onNext} />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('E-mail'), 'maria@example.com');
    await user.type(screen.getByLabelText('Telefone'), '11999999999');
    await user.click(screen.getByRole('button', { name: 'Próximo' }));

    expect(onNext).toHaveBeenCalled();
  });

  it('calls onBack when "Voltar" is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderWithIntl(<Wrapper onBack={onBack} />);

    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(onBack).toHaveBeenCalled();
  });

  it('renders the optional photo upload field', () => {
    renderWithIntl(<Wrapper />);

    expect(screen.getByLabelText('Fotos do veículo (opcional)')).toBeInTheDocument();
  });

  it('shows the tenant-specific country prefix and stores the phone as E.164', async () => {
    const user = userEvent.setup();
    renderWithIntl(<Wrapper phonePrefix="+1" />);

    expect(screen.getByText('+1')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Telefone'), '4155552671');

    expect(screen.getByLabelText('Telefone')).toHaveValue('(415) 555-2671');
  });

  it('does not duplicate the country code when a full E.164 number is pasted', async () => {
    const user = userEvent.setup();
    renderWithIntl(<Wrapper phonePrefix="+55" />);

    const input = screen.getByLabelText('Telefone');
    await user.click(input);
    await user.paste('+5511912345678');

    expect(input).toHaveValue('(11) 91234-5678');
  });

  it('clearing the phone field leaves it empty rather than just the prefix', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderWithIntl(<Wrapper onNext={onNext} phonePrefix="+55" />);

    await user.type(screen.getByLabelText('Nome'), 'Maria Silva');
    await user.type(screen.getByLabelText('E-mail'), 'maria@example.com');
    await user.type(screen.getByLabelText('Telefone'), '11999999999');
    await user.clear(screen.getByLabelText('Telefone'));
    await user.click(screen.getByRole('button', { name: 'Próximo' }));

    expect(screen.getByTestId('personal-info-error')).toHaveTextContent('Informe seu telefone.');
    expect(onNext).not.toHaveBeenCalled();
  });

  it('renders the order review card with the selected service and date/time', () => {
    renderWithIntl(<Wrapper />);

    expect(screen.getByText('Revisar pedido')).toBeInTheDocument();
    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
    expect(screen.getByText('R$ 60,00 — 30 min')).toBeInTheDocument();
    expect(screen.getByText('Quinta-feira, 18 de junho · 10:00 – 11:00')).toBeInTheDocument();
  });

  describe('feedback', () => {
    it('shows the validation message as a branded alert under the buttons and links the invalid input to it', async () => {
      const user = userEvent.setup();
      renderWithIntl(<Wrapper />);

      await user.click(screen.getByRole('button', { name: 'Próximo' }));

      const message = screen.getByTestId('personal-info-error');
      expect(within(message).getByRole('alert')).toHaveTextContent('Informe seu nome.');
      expect(
        screen.getByTestId('step-next').compareDocumentPosition(message) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      const name = screen.getByTestId('input-name');
      expect(name).toHaveAttribute('aria-invalid', 'true');
      expect(name).toHaveAttribute('aria-describedby', message.id);
      expect(name.className).toContain('border-red-600');
      expect(name).toHaveFocus();
    });

    it('focuses the first invalid contact field and clears the marks once it is edited', async () => {
      const user = userEvent.setup();
      renderWithIntl(<Wrapper />);
      await user.type(screen.getByTestId('input-name'), 'Maria Silva');

      await user.click(screen.getByRole('button', { name: 'Próximo' }));
      expect(screen.getByTestId('input-email')).toHaveFocus();
      expect(screen.getByTestId('input-email')).toHaveAttribute('aria-invalid', 'true');

      await user.type(screen.getByTestId('input-email'), 'm');
      expect(screen.queryByTestId('personal-info-error')).not.toBeInTheDocument();
      expect(screen.getByTestId('input-email')).not.toHaveAttribute('aria-invalid');
    });

    it('shows a server rejection of the step as a branded alert', () => {
      renderWithIntl(<Wrapper submitError={{ message: 'Não foi possível concluir.' }} />);

      const message = screen.getByTestId('step3-submit-error');
      expect(within(message).getByRole('alert')).toHaveTextContent('Não foi possível concluir.');
      expect(within(message).getByRole('alert')).toHaveFocus();
    });

    it('opens, marks and focuses the contact address when the server rejects contactAddress', () => {
      renderWithIntl(
        <Wrapper
          submitError={{ message: 'O endereço informado é inválido.', field: 'contactAddress' }}
        />,
      );

      const zip = document.getElementById('contact-address-zip-code');
      expect(zip).toHaveAttribute('aria-invalid', 'true');
      expect(zip).toHaveAttribute('aria-describedby', screen.getByTestId('step3-submit-error').id);
      expect(zip).toHaveFocus();
    });
  });
});
