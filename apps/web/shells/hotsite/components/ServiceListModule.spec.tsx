// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { axe } from '@/axe-helper';
import { describe, expect, it } from 'vitest';
import type { HotsiteServiceResponse, ServiceListModuleData } from '@ikaro/types';
import { renderWithIntl, hotsiteServiceBookingDefaults } from '@/test-utils';
import { ServiceListModule } from './ServiceListModule';

function makeData(overrides?: Partial<ServiceListModuleData>): ServiceListModuleData {
  return {
    showPrices: true,
    showPoints: true,
    layout: 'grid',
    ...overrides,
  };
}

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

describe('ServiceListModule', () => {
  it('renders cards from the provided services', () => {
    renderWithIntl(
      <ServiceListModule data={makeData()} slug="tenant" services={[makeService()]} />,
    );

    expect(screen.getByRole('heading', { name: 'Lavagem Completa' })).toBeInTheDocument();
    expect(screen.getByText('Lavagem externa e interna')).toBeInTheDocument();
  });

  it('renders the default title when none is provided', () => {
    renderWithIntl(
      <ServiceListModule data={makeData()} slug="tenant" services={[makeService()]} />,
    );

    expect(screen.getByRole('heading', { name: 'Nossos Serviços' })).toBeInTheDocument();
  });

  it('renders a custom title when provided', () => {
    renderWithIntl(
      <ServiceListModule
        data={makeData({ title: 'Conheça nossos serviços' })}
        slug="tenant"
        services={[makeService()]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Conheça nossos serviços' })).toBeInTheDocument();
  });

  describe('showPrices', () => {
    it('renders the price badge when showPrices is true', () => {
      renderWithIntl(
        <ServiceListModule
          data={makeData({ showPrices: true })}
          slug="tenant"
          services={[makeService()]}
        />,
      );

      expect(screen.getByTestId('price-badge')).toHaveTextContent('R$ 150,00');
    });

    it('hides the price badge when showPrices is false', () => {
      renderWithIntl(
        <ServiceListModule
          data={makeData({ showPrices: false })}
          slug="tenant"
          services={[makeService()]}
        />,
      );

      expect(screen.queryByTestId('price-badge')).not.toBeInTheDocument();
    });
  });

  describe('showPoints', () => {
    it('renders the loyalty points badge when showPoints is true', () => {
      renderWithIntl(
        <ServiceListModule
          data={makeData({ showPoints: true })}
          slug="tenant"
          services={[makeService({ loyaltyPointsValue: 10 })]}
        />,
      );

      expect(screen.getByTestId('loyalty-points-badge')).toHaveTextContent('+10 pontos');
    });

    it('hides the loyalty points badge when showPoints is false', () => {
      renderWithIntl(
        <ServiceListModule
          data={makeData({ showPoints: false })}
          slug="tenant"
          services={[makeService()]}
        />,
      );

      expect(screen.queryByTestId('loyalty-points-badge')).not.toBeInTheDocument();
    });
  });

  describe('layout', () => {
    it('renders a responsive grid for layout: grid', () => {
      const { container } = renderWithIntl(
        <ServiceListModule
          data={makeData({ layout: 'grid' })}
          slug="tenant"
          services={[makeService()]}
        />,
      );

      const list = container.querySelector('ul');
      expect(list?.className).toContain('grid');
      expect(list?.className).toContain('lg:grid-cols-3');
    });

    it('renders a single-column list for layout: list', () => {
      const { container } = renderWithIntl(
        <ServiceListModule
          data={makeData({ layout: 'list' })}
          slug="tenant"
          services={[makeService()]}
        />,
      );

      const list = container.querySelector('ul');
      expect(list?.className).toContain('flex-col');
      expect(list?.className).not.toContain('grid');
    });
  });

  describe('empty state', () => {
    it('renders the pt-BR empty-state message when there are no services', () => {
      renderWithIntl(<ServiceListModule data={makeData()} slug="tenant" services={[]} />);

      expect(screen.getByText('Nenhum serviço disponível no momento')).toBeInTheDocument();
    });
  });

  it('renders the section with id="service-list"', () => {
    const { container } = renderWithIntl(
      <ServiceListModule data={makeData()} slug="tenant" services={[makeService()]} />,
    );

    expect(container.querySelector('section#service-list')).toBeInTheDocument();
  });

  describe('eyebrow', () => {
    it('renders eyebrow when provided', () => {
      renderWithIntl(
        <ServiceListModule
          data={makeData({ eyebrow: 'O que fazemos' })}
          slug="tenant"
          services={[makeService()]}
        />,
      );

      expect(screen.getByTestId('section-eyebrow')).toHaveTextContent('O que fazemos');
    });

    it('does not render eyebrow when absent', () => {
      const { container } = renderWithIntl(
        <ServiceListModule data={makeData()} slug="tenant" services={[makeService()]} />,
      );

      expect(container.querySelector('[data-testid="section-eyebrow"]')).not.toBeInTheDocument();
    });
  });

  it('has no axe violations', async () => {
    const { container } = renderWithIntl(
      <ServiceListModule data={makeData()} slug="tenant" services={[makeService()]} />,
    );

    expect(await axe(container)).toHaveNoViolations();
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
      },
    });

    it('shows its rate and duration range instead of the fixed price', () => {
      renderWithIntl(<ServiceListModule data={makeData()} slug="tenant" services={[perTime]} />);

      expect(screen.getByTestId('price-badge')).toHaveTextContent('R$ 50,00 / hora');
      expect(screen.getByText('1h a 8h')).toBeInTheDocument();
      expect(screen.queryByText('R$ 150,00')).not.toBeInTheDocument();
    });

    it('labels a non-hourly increment in minutes', () => {
      const halfHour = {
        ...perTime,
        bookingPolicy: { ...perTime.bookingPolicy, pricingIncrementMinutes: 30 },
      };
      renderWithIntl(<ServiceListModule data={makeData()} slug="tenant" services={[halfHour]} />);

      expect(screen.getByTestId('price-badge')).toHaveTextContent('R$ 50,00 / 30 min');
    });

    it('shows no duration text when the policy has no range', () => {
      const unbounded = {
        ...perTime,
        bookingPolicy: {
          ...perTime.bookingPolicy,
          durationMinMinutes: null,
          durationMaxMinutes: null,
        },
      };
      renderWithIntl(<ServiceListModule data={makeData()} slug="tenant" services={[unbounded]} />);

      expect(screen.queryByText(/a 8h/)).not.toBeInTheDocument();
      expect(screen.getByTestId('price-badge')).toHaveTextContent('R$ 50,00 / hora');
    });

    it('falls back to the fixed price when the increment amount is missing', () => {
      const fallback = {
        ...perTime,
        bookingPolicy: { ...perTime.bookingPolicy, pricePerIncrementAmount: null },
      };
      renderWithIntl(<ServiceListModule data={makeData()} slug="tenant" services={[fallback]} />);

      expect(screen.getByTestId('price-badge')).toHaveTextContent('R$ 150,00');
    });
  });
});
