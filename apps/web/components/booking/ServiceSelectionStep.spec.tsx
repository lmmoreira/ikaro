// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteAddressSpec, HotsiteServiceResponse } from '@ikaro/types';
import { emptyAddress } from '@/lib/booking/personal-info';
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
    ...overrides,
  };
}

const defaultPickupProps = {
  requiresPickupAddress: false,
  pickupAddress: emptyAddress(),
  onPickupAddressChange: vi.fn(),
  addressSpec: BR_ADDRESS_SPEC,
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
});
