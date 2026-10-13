// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BookingErrorCode } from '@ikaro/types';
import { BR_ADDRESS_SPEC, makeHotsiteService, renderWithIntl } from '@/test-utils';
import { emptyAddress } from '@/features/booking/model/personal-info';
import { NewBookingServicesStep } from './NewBookingServicesStep';

const WASH = makeHotsiteService({ id: 'wash', name: 'Lavagem Simples' });
const PICKUP = makeHotsiteService({
  id: 'pickup',
  name: 'Leva e traz',
  requiresPickupAddress: true,
});
const FILLED = {
  ...emptyAddress(),
  street: 'Rua A',
  number: '1',
  neighborhood: 'Centro',
  city: 'BH',
  state: 'MG',
  zipCode: '30000000',
};

function renderStep(overrides: Partial<React.ComponentProps<typeof NewBookingServicesStep>> = {}) {
  const props = {
    services: [WASH, PICKUP],
    selectedServiceIds: [] as string[],
    onToggleService: vi.fn(),
    requiresPickupAddress: false,
    pickupAddress: emptyAddress(),
    onPickupAddressChange: vi.fn(),
    addressSpec: BR_ADDRESS_SPEC,
    formStatus: 'idle' as const,
    unavailableServiceIds: [] as string[],
    submitError: null,
    summary: <p>Resumo</p>,
    onNext: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
  renderWithIntl(<NewBookingServicesStep {...props} />);
  return props;
}

describe('NewBookingServicesStep', () => {
  it('lists every bookable service and toggles one', async () => {
    const props = renderStep();

    expect(screen.getAllByTestId('service-card')).toHaveLength(2);
    await userEvent.click(screen.getAllByRole('checkbox')[0]!);

    expect(props.onToggleService).toHaveBeenCalledWith('wash');
  });

  it('cannot continue without a service', () => {
    renderStep();

    expect(screen.getAllByTestId('step-next')[0]).toBeDisabled();
  });

  it('continues with a service chosen', async () => {
    const props = renderStep({ selectedServiceIds: ['wash'] });

    await userEvent.click(screen.getAllByTestId('step-next')[0]!);

    expect(props.onNext).toHaveBeenCalledOnce();
  });

  it('shows no address fields unless a chosen service needs pickup', () => {
    renderStep({ selectedServiceIds: ['wash'] });

    expect(screen.queryByTestId('pickup-address-fields')).not.toBeInTheDocument();
  });

  it('asks for the pickup address and blocks continuing while it is incomplete', async () => {
    const props = renderStep({ selectedServiceIds: ['pickup'], requiresPickupAddress: true });

    expect(screen.getByTestId('pickup-address-fields')).toBeInTheDocument();
    await userEvent.click(screen.getAllByTestId('step-next')[0]!);

    expect(props.onNext).not.toHaveBeenCalled();
    expect(screen.getByTestId('step1-error')).toHaveTextContent('Informe o endereço de coleta');
  });

  it('continues once the pickup address is complete', async () => {
    const props = renderStep({
      selectedServiceIds: ['pickup'],
      requiresPickupAddress: true,
      pickupAddress: FILLED,
    });

    await userEvent.click(screen.getAllByTestId('step-next')[0]!);

    expect(props.onNext).toHaveBeenCalledOnce();
  });

  it('blocks a service nobody can be picked for', () => {
    renderStep({ selectedServiceIds: ['wash'], unavailableServiceIds: ['wash'] });

    expect(screen.getByTestId('service-unavailable')).toBeInTheDocument();
    expect(screen.getAllByTestId('step-next')[0]).toBeDisabled();
  });

  it('shows a server refusal sent back to this step, with the hint for two variable services', () => {
    renderStep({
      selectedServiceIds: ['wash'],
      submitError: {
        message: 'Só um serviço de duração variável',
        code: BookingErrorCode.INVALID_MULTIPLE_VARIABLE_SERVICES,
      },
    });

    expect(screen.getByTestId('step1-submit-error')).toHaveTextContent(
      'Só um serviço de duração variável',
    );
    expect(screen.getByText(/Desmarque um deles/)).toBeInTheDocument();
  });

  it('retries a failed form load and disables continuing while it loads', async () => {
    const props = renderStep({ selectedServiceIds: ['wash'], formStatus: 'error' });

    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(screen.getByTestId('step1-form-error')).toBeInTheDocument();
    expect(props.onNext).toHaveBeenCalledOnce();
  });

  it('goes back to the chooser', async () => {
    const props = renderStep();

    await userEvent.click(screen.getAllByTestId('step-back')[0]!);

    expect(props.onBack).toHaveBeenCalledOnce();
  });
});
