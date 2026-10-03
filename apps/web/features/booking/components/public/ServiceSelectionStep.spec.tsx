// @vitest-environment jsdom
import { renderWithIntl, hotsiteServiceBookingDefaults } from '@/test-utils';
import { BookingErrorCode } from '@ikaro/types';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteAddressSpec, HotsiteServiceResponse } from '@ikaro/types';
import { emptyAddress } from '@/features/booking/model/personal-info';
import { ServiceSelectionStep } from './ServiceSelectionStep';

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

function makeService(overrides?: Partial<HotsiteServiceResponse>): HotsiteServiceResponse {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Lavagem Completa',
    description: 'Lavagem externa e interna',
    price: { amount: 150, currency: 'BRL', formatted: 'R$ 150,00' },
    durationMinutes: 60,
    loyaltyPointsValue: 10,
    requiresPickupAddress: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...hotsiteServiceBookingDefaults,
    ...overrides,
  };
}

const defaultPickupProps = {
  requiresPickupAddress: false,
  pickupAddress: emptyAddress(),
  onPickupAddressChange: vi.fn(),
  addressSpec: BR_ADDRESS_SPEC,
  formStatus: 'idle' as const,
  unavailableServiceIds: [] as string[],
  submitError: null,
  onBack: vi.fn(),
};

describe('ServiceSelectionStep', () => {
  it('renders a card for each service with name, price and duration', () => {
    const service = makeService();
    renderWithIntl(
      <ServiceSelectionStep
        services={[service]}
        selectedServiceIds={[]}
        onToggleService={vi.fn()}
        onNext={vi.fn()}
        {...defaultPickupProps}
      />,
    );

    expect(screen.getByText('Lavagem Completa')).toBeInTheDocument();
    expect(screen.getByText('Lavagem externa e interna')).toBeInTheDocument();
    expect(screen.getByText('R$ 150,00')).toBeInTheDocument();
    expect(screen.getByText('1h')).toBeInTheDocument();
  });

  it('calls onToggleService when a service checkbox is clicked', async () => {
    const user = userEvent.setup();
    const onToggleService = vi.fn();
    const service = makeService();

    renderWithIntl(
      <ServiceSelectionStep
        services={[service]}
        selectedServiceIds={[]}
        onToggleService={onToggleService}
        onNext={vi.fn()}
        {...defaultPickupProps}
      />,
    );

    await user.click(screen.getByRole('checkbox'));

    expect(onToggleService).toHaveBeenCalledWith(service.id);
  });

  it('does not show a running total when nothing is selected', () => {
    renderWithIntl(
      <ServiceSelectionStep
        services={[makeService()]}
        selectedServiceIds={[]}
        onToggleService={vi.fn()}
        onNext={vi.fn()}
        {...defaultPickupProps}
      />,
    );

    expect(screen.queryByTestId('selection-total')).not.toBeInTheDocument();
  });

  it('shows a singular running total for one selected service', () => {
    const service = makeService();
    renderWithIntl(
      <ServiceSelectionStep
        services={[service]}
        selectedServiceIds={[service.id]}
        onToggleService={vi.fn()}
        onNext={vi.fn()}
        {...defaultPickupProps}
      />,
    );

    expect(screen.getByText('1 serviço — R$ 150,00 — 1h')).toBeInTheDocument();
  });

  it('shows a plural running total summing multiple selected services', () => {
    const serviceA = makeService({
      id: 'svc-a',
      price: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
      durationMinutes: 30,
    });
    const serviceB = makeService({
      id: 'svc-b',
      name: 'Enceramento',
      price: { amount: 50, currency: 'BRL', formatted: 'R$ 50,00' },
      durationMinutes: 30,
    });

    renderWithIntl(
      <ServiceSelectionStep
        services={[serviceA, serviceB]}
        selectedServiceIds={[serviceA.id, serviceB.id]}
        onToggleService={vi.fn()}
        onNext={vi.fn()}
        {...defaultPickupProps}
      />,
    );

    expect(screen.getByText('2 serviços — R$ 150,00 — 1h')).toBeInTheDocument();
  });

  it('disables the "Próximo" button when no service is selected', () => {
    renderWithIntl(
      <ServiceSelectionStep
        services={[makeService()]}
        selectedServiceIds={[]}
        onToggleService={vi.fn()}
        onNext={vi.fn()}
        {...defaultPickupProps}
      />,
    );

    expect(screen.getByRole('button', { name: 'Próximo' })).toBeDisabled();
  });

  it('enables the "Próximo" button and calls onNext when at least one service is selected', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const service = makeService();

    renderWithIntl(
      <ServiceSelectionStep
        services={[service]}
        selectedServiceIds={[service.id]}
        onToggleService={vi.fn()}
        onNext={onNext}
        {...defaultPickupProps}
      />,
    );

    const button = screen.getByRole('button', { name: 'Próximo' });
    expect(button).toBeEnabled();

    await user.click(button);

    expect(onNext).toHaveBeenCalled();
  });

  it('puts a data-service-id on each card', () => {
    const service = makeService();
    renderWithIntl(
      <ServiceSelectionStep
        services={[service]}
        selectedServiceIds={[]}
        onToggleService={vi.fn()}
        onNext={vi.fn()}
        {...defaultPickupProps}
      />,
    );

    expect(screen.getByTestId('service-card')).toHaveAttribute('data-service-id', service.id);
  });

  describe('a per-time service', () => {
    const perTime = makeService({
      id: 'per-time',
      name: 'Sala de reunião',
      bookingPolicy: {
        ...hotsiteServiceBookingDefaults.bookingPolicy,
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 60,
        durationMaxMinutes: 480,
        durationIncrementMinutes: 60,
        pricingPolicy: 'PER_TIME_INCREMENT',
        pricingIncrementMinutes: 60,
        pricePerIncrementAmount: 50,
        minimumChargeAmount: null,
      },
    });

    it('shows its rate and duration range instead of a fixed price', () => {
      renderWithIntl(
        <ServiceSelectionStep
          services={[perTime]}
          selectedServiceIds={[]}
          onToggleService={vi.fn()}
          onNext={vi.fn()}
          {...defaultPickupProps}
        />,
      );

      expect(screen.getByTestId('service-rate')).toHaveTextContent('R$ 50,00 / hora');
      expect(screen.getByTestId('service-duration-range')).toHaveTextContent('1h a 8h');
      expect(screen.queryByText('R$ 150,00')).not.toBeInTheDocument();
    });

    it('uses a per-increment label when the increment is not an hour', () => {
      const halfHour = {
        ...perTime,
        bookingPolicy: { ...perTime.bookingPolicy, pricingIncrementMinutes: 30 },
      };
      renderWithIntl(
        <ServiceSelectionStep
          services={[halfHour]}
          selectedServiceIds={[]}
          onToggleService={vi.fn()}
          onNext={vi.fn()}
          {...defaultPickupProps}
        />,
      );

      expect(screen.getByTestId('service-rate')).toHaveTextContent('R$ 50,00 / 30 min');
    });

    it('shows "a partir de" in the total and the final-total hint, mixing with a fixed service', () => {
      const fixed = makeService({ id: 'fixed', name: 'Corte' });
      renderWithIntl(
        <ServiceSelectionStep
          services={[perTime, fixed]}
          selectedServiceIds={['per-time', 'fixed']}
          onToggleService={vi.fn()}
          onNext={vi.fn()}
          {...defaultPickupProps}
        />,
      );

      expect(screen.getByTestId('selection-total')).toHaveTextContent(
        '2 serviços — a partir de R$ 200,00 — duração a escolher',
      );
      expect(
        screen.getByText('O total final aparece depois que você escolher a duração.'),
      ).toBeInTheDocument();
    });
  });

  it('shows "Carregando…" and disables Próximo while the form data loads', () => {
    const service = makeService();
    renderWithIntl(
      <ServiceSelectionStep
        services={[service]}
        selectedServiceIds={[service.id]}
        onToggleService={vi.fn()}
        onNext={vi.fn()}
        {...defaultPickupProps}
        formStatus="loading"
      />,
    );

    expect(screen.getByTestId('step-next')).toHaveTextContent('Carregando...');
    expect(screen.getByTestId('step-next')).toBeDisabled();
  });

  it('fails closed with a retry when the form data fetch failed', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const service = makeService();
    renderWithIntl(
      <ServiceSelectionStep
        services={[service]}
        selectedServiceIds={[service.id]}
        onToggleService={vi.fn()}
        onNext={onNext}
        {...defaultPickupProps}
        formStatus="error"
      />,
    );

    expect(screen.getByTestId('step1-form-error')).toHaveTextContent('Não foi possível continuar.');
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onNext).toHaveBeenCalled();
  });

  it('marks a service with no pickable resource and keeps Próximo disabled while it is selected', () => {
    const service = makeService();
    renderWithIntl(
      <ServiceSelectionStep
        services={[service]}
        selectedServiceIds={[service.id]}
        onToggleService={vi.fn()}
        onNext={vi.fn()}
        {...defaultPickupProps}
        formStatus="ready"
        unavailableServiceIds={[service.id]}
      />,
    );

    expect(screen.getByTestId('service-unavailable')).toHaveTextContent(
      'Este serviço não está disponível para reserva no momento.',
    );
    expect(screen.getByTestId('step-next')).toBeDisabled();
  });

  it('enables Próximo again once the unavailable service is unticked', () => {
    const unavailable = makeService({ id: 'bad', name: 'Massagem' });
    const ok = makeService({ id: 'ok', name: 'Corte' });
    renderWithIntl(
      <ServiceSelectionStep
        services={[unavailable, ok]}
        selectedServiceIds={['ok']}
        onToggleService={vi.fn()}
        onNext={vi.fn()}
        {...defaultPickupProps}
        formStatus="ready"
        unavailableServiceIds={['bad']}
      />,
    );

    expect(screen.getByTestId('step-next')).toBeEnabled();
  });

  it('shows the inline rejection and its hint for the multiple-variable-services code', () => {
    const service = makeService();
    renderWithIntl(
      <ServiceSelectionStep
        services={[service]}
        selectedServiceIds={[service.id]}
        onToggleService={vi.fn()}
        onNext={vi.fn()}
        {...defaultPickupProps}
        submitError={{
          message:
            'Só é possível incluir um serviço de duração variável ou com formulário na mesma reserva.',
          code: BookingErrorCode.INVALID_MULTIPLE_VARIABLE_SERVICES,
        }}
      />,
    );

    const alert = screen.getByTestId('step1-submit-error');
    expect(alert).toHaveTextContent('Só é possível incluir um serviço de duração variável');
    expect(alert).toHaveTextContent('Desmarque um deles para continuar.');
  });

  it('shows a plain inline rejection without the hint for any other code', () => {
    const service = makeService();
    renderWithIntl(
      <ServiceSelectionStep
        services={[service]}
        selectedServiceIds={[service.id]}
        onToggleService={vi.fn()}
        onNext={vi.fn()}
        {...defaultPickupProps}
        submitError={{ message: 'Este serviço não está ativo no momento.' }}
      />,
    );

    expect(screen.getByTestId('step1-submit-error')).not.toHaveTextContent('Desmarque');
  });
});
