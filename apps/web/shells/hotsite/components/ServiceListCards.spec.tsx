// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HotsiteServiceResponse, ServiceListModuleData } from '@ikaro/types';
import { axe } from '@/axe-helper';
import { hotsiteServiceBookingDefaults, renderWithIntl } from '@/test-utils';
import { ServiceItems } from './ServiceListCards';

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

const SERVICES = [
  makeService(),
  makeService({ id: '00000000-0000-0000-0000-000000000002', name: 'Polimento', description: null }),
];

function renderItems(
  layout: ServiceListModuleData['layout'],
  showPrices = true,
  showPoints = true,
) {
  return renderWithIntl(
    <ServiceItems
      layout={layout}
      services={SERVICES}
      showPrices={showPrices}
      showPoints={showPoints}
      cardBg="var(--ba-secondary)"
    />,
  );
}

describe('ServiceItems', () => {
  it('grid renders a three-column card grid', () => {
    const { container } = renderItems('grid');

    expect(container.querySelector('ul')).toHaveClass('lg:grid-cols-3');
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2);
  });

  it('list renders a single narrow column', () => {
    const { container } = renderItems('list');

    expect(container.querySelector('ul')).toHaveClass('flex-col', 'max-w-2xl');
  });

  describe('numbered', () => {
    it('is an ordered, zero-padded menu with the name, description, duration and price', () => {
      const { container } = renderItems('numbered');

      expect(container.querySelector('ol')).toBeInTheDocument();
      expect(screen.getByText('01')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByText('02')).toBeInTheDocument();
      expect(screen.getByText('Lavagem externa e interna')).toBeInTheDocument();
      expect(screen.getAllByTestId('price-badge')[0]).toHaveTextContent('R$ 150,00');
    });

    it('hides the price and loyalty points when they are off', () => {
      renderItems('numbered', false, false);

      expect(screen.queryByTestId('price-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('loyalty-points-badge')).not.toBeInTheDocument();
    });

    it('separates duration and points with a dot only when there is a duration', () => {
      renderItems('numbered');

      expect(screen.getAllByTestId('loyalty-points-badge')[0].textContent).toMatch(/^ · /);
    });
  });

  describe('feature-cards', () => {
    it('renders one prominent card per service on the card surface', () => {
      renderItems('feature-cards');

      const cards = screen.getAllByTestId('feature-service-card');
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveStyle({ backgroundColor: 'var(--ba-secondary)' });
      expect(within(cards[0]).getByTestId('price-badge')).toHaveTextContent('R$ 150,00');
    });

    it('omits the description when a service has none', () => {
      renderItems('feature-cards');

      const cards = screen.getAllByTestId('feature-service-card');
      expect(cards[1].querySelector('p.leading-relaxed')).toBeNull();
    });
  });

  it.each(['grid', 'list', 'numbered', 'feature-cards'] as const)(
    '%s has no accessibility violations',
    async (layout) => {
      const { container } = renderItems(layout);

      expect(await axe(container)).toHaveNoViolations();
    },
  );
});
