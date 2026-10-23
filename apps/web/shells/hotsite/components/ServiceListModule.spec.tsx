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

const SECTION_TOKENS = {
  '--ba-section-bg': '#111111',
  '--ba-section-text': '#FFFFFF',
  '--ba-section-card-bg': '#222222',
  '--ba-section-divider': '#333333',
} as const;

describe('ServiceListModule layouts and presentation', () => {
  const services = [
    makeService({ id: '00000000-0000-0000-0000-000000000001', name: 'Lavagem Completa' }),
    makeService({ id: '00000000-0000-0000-0000-000000000002', name: 'Polimento' }),
  ];

  it('numbered renders an ordered, zero-padded price menu with each price', () => {
    renderWithIntl(
      <ServiceListModule
        data={makeData({ layout: 'numbered' })}
        slug="tenant"
        services={services}
      />,
    );

    const rows = screen.getAllByTestId('numbered-service');
    expect(rows).toHaveLength(2);
    expect(rows[0].parentElement?.tagName).toBe('OL');
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getAllByTestId('price-badge')).toHaveLength(2);
  });

  it('feature-cards renders one prominent card per service', () => {
    renderWithIntl(
      <ServiceListModule
        data={makeData({ layout: 'feature-cards' })}
        slug="tenant"
        services={services}
      />,
    );

    expect(screen.getAllByTestId('feature-service-card')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Polimento' })).toBeInTheDocument();
  });

  it.each(['numbered', 'feature-cards'] as const)(
    '%s honours showPrices and showPoints',
    (layout) => {
      renderWithIntl(
        <ServiceListModule
          data={makeData({ layout, showPrices: false, showPoints: false })}
          slug="tenant"
          services={services}
        />,
      );

      expect(screen.queryByTestId('price-badge')).not.toBeInTheDocument();
      expect(screen.queryByTestId('loyalty-points-badge')).not.toBeInTheDocument();
    },
  );

  it.each(['numbered', 'feature-cards'] as const)(
    '%s has no accessibility violations',
    async (layout) => {
      const { container } = renderWithIntl(
        <ServiceListModule data={makeData({ layout })} slug="tenant" services={services} />,
      );

      expect(await axe(container)).toHaveNoViolations();
    },
  );

  it('without presentation keeps the tenant surface; with a surface it uses the section tokens', () => {
    const { container, rerender } = renderWithIntl(
      <ServiceListModule data={makeData()} slug="tenant" services={services} />,
    );
    const plain = container.querySelector('section') as HTMLElement;
    expect(plain.style.backgroundColor).toBe('var(--ba-background)');

    rerender(
      <ServiceListModule
        data={makeData()}
        slug="tenant"
        services={services}
        presentation={{ surface: 'primary' }}
        sectionTokens={SECTION_TOKENS}
      />,
    );
    const surfaced = container.querySelector('section') as HTMLElement;
    expect(surfaced.style.backgroundColor).toBe('var(--ba-section-bg)');
  });
});

describe('ServiceListModule item action', () => {
  const services = [makeService({ id: '00000000-0000-0000-0000-0000000000aa' })];

  it('has no action when itemAction is omitted or none (today’s behaviour)', () => {
    renderWithIntl(<ServiceListModule data={makeData()} slug="tenant" services={services} />);
    expect(screen.queryByTestId('service-action')).not.toBeInTheDocument();

    renderWithIntl(
      <ServiceListModule
        data={makeData({ itemAction: 'none' })}
        slug="tenant"
        services={services}
      />,
    );
    expect(screen.queryByTestId('service-action')).not.toBeInTheDocument();
  });

  it('booking links each card to the service-first booking flow with that service preselected', () => {
    renderWithIntl(
      <ServiceListModule
        data={makeData({ itemAction: 'booking' })}
        slug="tenant"
        services={services}
      />,
    );

    const link = screen.getByTestId('service-action');
    expect(link).toHaveAttribute(
      'href',
      '/tenant/booking?serviceId=00000000-0000-0000-0000-0000000000aa',
    );
    expect(link).toHaveTextContent('Agendar');
  });

  it('booking uses the configured CTA label', () => {
    renderWithIntl(
      <ServiceListModule
        data={makeData({ itemAction: 'booking', itemCtaLabel: 'Reservar este serviço' })}
        slug="tenant"
        services={services}
      />,
    );

    expect(screen.getByTestId('service-action')).toHaveTextContent('Reservar este serviço');
  });

  describe("itemAction 'details' (TD56-S03)", () => {
    const published = makeService({
      id: '00000000-0000-0000-0000-0000000000bb',
      name: 'Massagem',
      publicSlug: 'massagem',
    });
    const unpublished = makeService({
      id: '00000000-0000-0000-0000-0000000000cc',
      name: 'Banho de Lua',
      publicSlug: null,
    });

    it('links a service with a published page to its own page, labelled "Ver detalhes"', () => {
      renderWithIntl(
        <ServiceListModule
          data={makeData({ itemAction: 'details' })}
          slug="tenant"
          services={[published]}
        />,
      );

      const link = screen.getByTestId('service-action');
      expect(link).toHaveAttribute('href', '/tenant/servicos/massagem');
      expect(link).toHaveAttribute('data-action', 'details');
      expect(link).toHaveTextContent('Ver detalhes');
    });

    it('falls back to the booking action for a service whose page is not published — never a dead link', () => {
      renderWithIntl(
        <ServiceListModule
          data={makeData({ itemAction: 'details' })}
          slug="tenant"
          services={[unpublished]}
        />,
      );

      const link = screen.getByTestId('service-action');
      expect(link).toHaveAttribute(
        'href',
        '/tenant/booking?serviceId=00000000-0000-0000-0000-0000000000cc',
      );
      expect(link).toHaveAttribute('data-action', 'booking');
      expect(link).toHaveTextContent('Agendar');
      expect(link.getAttribute('href')).not.toContain('/servicos/');
    });

    it('mixes both in one list, each card by its own service', () => {
      renderWithIntl(
        <ServiceListModule
          data={makeData({ itemAction: 'details' })}
          slug="tenant"
          services={[published, unpublished]}
        />,
      );

      const links = screen.getAllByTestId('service-action');
      expect(links.map((link) => link.getAttribute('data-action'))).toEqual(['details', 'booking']);
    });

    it('uses the configured CTA label for the details link, not for the booking fallback', () => {
      renderWithIntl(
        <ServiceListModule
          data={makeData({ itemAction: 'details', itemCtaLabel: 'Saiba mais' })}
          slug="tenant"
          services={[published, unpublished]}
        />,
      );

      const [detailsLink, bookingLink] = screen.getAllByTestId('service-action');
      expect(detailsLink).toHaveTextContent('Saiba mais');
      expect(bookingLink).toHaveTextContent('Agendar');
    });

    it.each(['grid', 'list', 'numbered', 'feature-cards'] as const)(
      '%s layout renders the details link',
      (layout) => {
        renderWithIntl(
          <ServiceListModule
            data={makeData({ itemAction: 'details', layout })}
            slug="tenant"
            services={[published]}
          />,
        );

        expect(screen.getByTestId('service-action')).toHaveAttribute(
          'href',
          '/tenant/servicos/massagem',
        );
      },
    );
  });
});
