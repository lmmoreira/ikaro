// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HotsiteServiceDetailResponse, ServiceDetailPageSettings } from '@ikaro/types';
import { axe } from '@/axe-helper';
import { clearPublicEnv, renderWithIntl, stubPublicEnv } from '@/test-utils';
import { SERVICE_DETAIL_PAGE_DEFAULTS } from '@/features/platform/hotsite/service-detail';
import { ServiceDetailPage } from './ServiceDetailPage';

const SERVICE_ID = '00000000-0000-4000-8000-000000000001';

function makeService(
  overrides: Partial<HotsiteServiceDetailResponse> = {},
  profile: Partial<HotsiteServiceDetailResponse['profile']> = {},
): HotsiteServiceDetailResponse {
  return {
    id: SERVICE_ID,
    name: 'Massagem Relaxante',
    description: 'Óleos essenciais e pedras quentes.',
    price: { amount: 120, currency: 'BRL', formatted: 'R$ 120,00' },
    durationMinutes: 60,
    loyaltyPointsValue: 8,
    durationPolicy: 'FIXED',
    publicSlug: 'massagem-relaxante',
    profile: {
      coverImageUrl: 'tenants/t/hotsite/service-profile/u/cover.webp',
      galleryImageUrls: ['tenants/t/hotsite/service-profile/u/g1.webp', 'https://cdn.test/g2.webp'],
      longDescription: 'Uma pausa para o corpo.\n\n- Acolhimento\n- Alongamento',
      inclusions: ['Chá de boas-vindas', 'Toalhas'],
      preparationNotes: 'Chegue com 10 minutos de antecedência.',
      ...profile,
    },
    ...overrides,
  };
}

function renderPage(
  service: HotsiteServiceDetailResponse,
  settings: Partial<ServiceDetailPageSettings> = {},
) {
  return renderWithIntl(
    <ServiceDetailPage
      slug="vitta"
      service={service}
      settings={{ ...SERVICE_DETAIL_PAGE_DEFAULTS, ...settings }}
    />,
  );
}

describe('ServiceDetailPage', () => {
  beforeEach(() => {
    stubPublicEnv({ NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL: 'https://cdn.test' });
  });

  afterEach(() => {
    clearPublicEnv();
  });

  it('renders every field of a full profile, with the images resolved against the public bucket', () => {
    const { container } = renderPage(makeService());

    expect(screen.getByRole('heading', { level: 1, name: 'Massagem Relaxante' })).toBeVisible();
    expect(screen.getByText('Óleos essenciais e pedras quentes.')).toBeVisible();
    expect(screen.getByTestId('service-price')).toHaveTextContent('R$ 120,00');
    expect(screen.getByTestId('service-duration')).toHaveTextContent('1h');
    expect(screen.getByTestId('service-points')).toHaveTextContent('+8 pontos de fidelidade');
    expect(screen.getByRole('heading', { level: 2, name: 'Sobre o serviço' })).toBeVisible();
    expect(screen.getByText('Acolhimento')).toBeVisible();
    expect(within(screen.getByTestId('service-inclusions')).getAllByRole('listitem')).toHaveLength(
      2,
    );
    expect(screen.getByTestId('service-preparation')).toHaveTextContent('Chegue com 10 minutos');
    expect(container.querySelector('[data-testid="service-cover"] img')).toHaveAttribute(
      'src',
      'https://cdn.test/tenants/t/hotsite/service-profile/u/cover.webp',
    );
    const gallery = Array.from(container.querySelectorAll('[data-testid="service-gallery"] img'));
    expect(gallery.map((img) => img.getAttribute('src'))).toEqual([
      'https://cdn.test/tenants/t/hotsite/service-profile/u/g1.webp',
      'https://cdn.test/g2.webp',
    ]);
  });

  it('renders only what exists — a bare profile has no empty headings or boxes', () => {
    renderPage(
      makeService(
        { description: null },
        {
          coverImageUrl: null,
          galleryImageUrls: [],
          longDescription: null,
          inclusions: [],
          preparationNotes: null,
        },
      ),
    );

    expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
    expect(screen.queryByTestId('service-cover')).not.toBeInTheDocument();
    expect(screen.queryByTestId('service-gallery')).not.toBeInTheDocument();
    expect(screen.queryByTestId('service-inclusions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('service-preparation')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  describe('detailPage settings', () => {
    it('heroStyle changes the cover shape', () => {
      const { rerender } = renderPage(makeService());
      expect(screen.getByTestId('service-cover')).toHaveClass('aspect-[16/7]');

      rerender(
        <ServiceDetailPage
          slug="vitta"
          service={makeService()}
          settings={{ ...SERVICE_DETAIL_PAGE_DEFAULTS, heroStyle: 'compact' }}
        />,
      );
      expect(screen.getByTestId('service-cover')).toHaveClass('aspect-[16/4]');
    });

    it('galleryLayout featured makes the first image span the row', () => {
      renderPage(makeService(), { galleryLayout: 'featured' });

      const items = within(screen.getByTestId('service-gallery')).getAllByRole('listitem');
      expect(screen.getByTestId('service-gallery')).toHaveAttribute('data-layout', 'featured');
      expect(items[0]).toHaveClass('col-span-2');
      expect(items[1]).not.toHaveClass('col-span-2');
    });

    it.each([
      ['showPrice', 'service-price'],
      ['showDuration', 'service-duration'],
      ['showLoyaltyPoints', 'service-points'],
    ] as const)('%s=false hides its chip', (setting, testId) => {
      renderPage(makeService(), { [setting]: false });

      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    });

    it('bookingCtaLabel replaces the default button text in both places', () => {
      renderPage(makeService(), { bookingCtaLabel: 'Quero agendar' });

      expect(screen.getAllByRole('link', { name: 'Quero agendar' })).toHaveLength(2);
      expect(screen.queryByRole('link', { name: 'Agendar este serviço' })).not.toBeInTheDocument();
    });

    it('shows no chip row at all when every chip is hidden', () => {
      renderPage(makeService({ loyaltyPointsValue: 0 }), {
        showPrice: false,
        showDuration: false,
      });

      expect(screen.queryByRole('list', { name: 'Massagem Relaxante' })).not.toBeInTheDocument();
    });
  });

  it('shows neither price nor duration for a customer-chosen duration (the booking flow quotes it)', () => {
    renderPage(makeService({ durationPolicy: 'CUSTOMER_SELECTED' }));

    expect(screen.queryByTestId('service-price')).not.toBeInTheDocument();
    expect(screen.queryByTestId('service-duration')).not.toBeInTheDocument();
    expect(screen.getByTestId('service-points')).toBeVisible();
  });

  it('hides the loyalty chip for a service worth no points', () => {
    renderPage(makeService({ loyaltyPointsValue: 0 }));

    expect(screen.queryByTestId('service-points')).not.toBeInTheDocument();
  });

  it('books with this exact service preselected and no date (a service-only deep link)', () => {
    renderPage(makeService());

    const cta = screen.getByTestId('service-book-cta');
    expect(cta).toHaveAttribute('href', `/vitta/booking?serviceId=${SERVICE_ID}`);
    expect(screen.getByRole('link', { name: /Voltar aos serviços/ })).toHaveAttribute(
      'href',
      '/vitta#service-list',
    );
    // No date or time control on this page — booking decides those steps.
    expect(document.querySelector('input[type="date"], input[type="time"]')).toBeNull();
  });

  it('renders the long description as restricted Markdown: no script, no image, no javascript: link', () => {
    const { container } = renderPage(
      makeService(
        {},
        {
          longDescription:
            '<script>alert(1)</script>\n\n![x](https://evil.test/p.png)\n\n[click](javascript:alert(1))',
        },
      ),
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[data-testid="service-gallery"] ~ img')).toBeNull();
    expect(container.querySelectorAll('img[src="https://evil.test/p.png"]')).toHaveLength(0);
    const link = container.querySelector('a[href^="javascript:"]');
    expect(link).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderPage(makeService());

    expect(await axe(container)).toHaveNoViolations();
  });
});
