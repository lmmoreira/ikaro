// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { HotsiteAdminContentResponse, HotsiteManifestResponse } from '@ikaro/types';
import { renderWithIntl, stubPublicEnv } from '@/test-utils';
import { fetchManifest } from '@/features/platform/api';
import { fetchServices } from '@/features/platform/hotsite/api/services';
import { generateHotsiteImageReadSignedUrl } from '@/features/platform/api/tenant-settings';
import { HotsitePreview } from './HotsitePreview';

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({ tenantId: 'tenant-a-id', tenantSlug: 'tenant-a' }),
}));
vi.mock('@/features/platform/api', () => ({ fetchManifest: vi.fn() }));
vi.mock('@/features/platform/hotsite/api/services', () => ({ fetchServices: vi.fn() }));
vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageReadSignedUrl: vi.fn(),
}));

const mockFetchManifest = vi.mocked(fetchManifest);
const mockFetchServices = vi.mocked(fetchServices);
const mockGenerateReadSignedUrl = vi.mocked(generateHotsiteImageReadSignedUrl);

function makeManifest(): HotsiteManifestResponse {
  return {
    tenant: { id: 'tenant-a-id', name: 'Tenant A', slug: 'tenant-a' },
    branding: {
      logoUrl: '',
      primaryColor: '#0055A4',
      secondaryColor: '#FFFFFF',
      backgroundColor: '#F5F5F5',
      textColor: '#111111',
      headingFontFamily: 'Inter',
      bodyFontFamily: 'Roboto',
      borderRadius: 'rounded',
      spacing: 'comfortable',
      shadowStyle: 'subtle',
      buttonStyle: 'filled',
    },
    layout: [],
    seo: { title: null, description: null },
    isPublished: true,
    business: { phone: null, email: null, address: null, socialLinks: null },
    localization: {
      language: 'pt-BR',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      phonePrefix: '+55',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: '1.234,56',
      firstDayOfWeek: 0,
      address: {
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
      },
    },
  };
}

function makeDraft(
  overrides: Partial<HotsiteAdminContentResponse> = {},
): HotsiteAdminContentResponse {
  return {
    branding: makeManifest().branding,
    layout: [
      {
        type: 'HERO',
        enabled: true,
        data: {
          variant: 'centered',
          title: 'Seu carro impecável',
          ctaLabel: 'Agendar agora',
          ctaTarget: 'booking-form',
        },
      },
    ],
    seo: { title: null, description: null },
    isPublished: false,
    updatedAt: '2026-07-08T00:00:00.000Z',
    ...overrides,
  };
}

const IMAGE_BASE_URL = 'http://localhost:4443/ikaro-local-public';

describe('HotsitePreview', () => {
  beforeEach(() => {
    mockFetchManifest.mockReset();
    mockFetchServices.mockReset();
    mockGenerateReadSignedUrl.mockReset();
    stubPublicEnv({ NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL: IMAGE_BASE_URL });
  });

  it('shows a loading state before supplementary data resolves', () => {
    mockFetchManifest.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<HotsitePreview draft={makeDraft()} onPublish={vi.fn()} isPublishing={false} />);

    expect(screen.getByTestId('hotsite-preview-loading')).toBeInTheDocument();
  });

  it('renders the draft hero module once supplementary data resolves', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    renderWithIntl(<HotsitePreview draft={makeDraft()} onPublish={vi.fn()} isPublishing={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-content')).toBeInTheDocument();
    });
    expect(screen.getByText('Seu carro impecável')).toBeInTheDocument();
  });

  it('resolves a freshly-uploaded (not-yet-saved) HERO background image into an absolute URL instead of passing the raw storage path to next/image', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    const rawPath =
      'tenants/tenant-a-id/hotsite/hero/019f420c-e46d-7f42-8524-4621e4642832/dfsda.png';
    const draft = makeDraft({
      layout: [
        {
          type: 'HERO',
          enabled: true,
          data: {
            variant: 'centered',
            title: 'Seu carro impecável',
            ctaLabel: 'Agendar agora',
            ctaTarget: 'booking-form',
            backgroundImageUrl: rawPath,
          },
        },
      ],
    });

    const { container } = renderWithIntl(
      <HotsitePreview draft={draft} onPublish={vi.fn()} isPublishing={false} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-content')).toBeInTheDocument();
    });
    // alt="" makes this a presentational image (removed from the accessibility tree by ARIA
    // rules), so it isn't reachable via getByRole('img') — query the DOM directly instead.
    const image = container.querySelector('img');
    expect(image).toHaveAttribute('src', `${IMAGE_BASE_URL}/${rawPath}`);
  });

  it('resolves a not-yet-promoted tmp/ HERO background image via a private read-signed-URL', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    mockGenerateReadSignedUrl.mockResolvedValue({
      signedUrl: 'https://storage.example.com/signed-read?sig=abc',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    const tmpPath = 'tmp/tenant-a-id/hero/019f420c-e46d-7f42-8524-4621e4642832/dfsda.png';
    const draft = makeDraft({
      layout: [
        {
          type: 'HERO',
          enabled: true,
          data: {
            variant: 'centered',
            title: 'Seu carro impecável',
            ctaLabel: 'Agendar agora',
            ctaTarget: 'booking-form',
            backgroundImageUrl: tmpPath,
          },
        },
      ],
    });

    const { container } = renderWithIntl(
      <HotsitePreview draft={draft} onPublish={vi.fn()} isPublishing={false} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-content')).toBeInTheDocument();
    });
    expect(mockGenerateReadSignedUrl).toHaveBeenCalledWith(tmpPath);
    await waitFor(() => {
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        'https://storage.example.com/signed-read?sig=abc',
      );
    });
  });

  it('requests a signed URL only once for a tmp/ path referenced by more than one field', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    mockGenerateReadSignedUrl.mockResolvedValue({
      signedUrl: 'https://storage.example.com/signed-read?sig=abc',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    const tmpPath = 'tmp/tenant-a-id/hero/019f420c-e46d-7f42-8524-4621e4642832/dfsda.png';
    const draft = makeDraft({
      branding: { ...makeManifest().branding, logoUrl: tmpPath },
      layout: [
        {
          type: 'HERO',
          enabled: true,
          data: {
            variant: 'centered',
            title: 'Seu carro impecável',
            ctaLabel: 'Agendar agora',
            ctaTarget: 'booking-form',
            backgroundImageUrl: tmpPath,
          },
        },
      ],
    });

    renderWithIntl(<HotsitePreview draft={draft} onPublish={vi.fn()} isPublishing={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-content')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockGenerateReadSignedUrl).toHaveBeenCalledTimes(1);
    });
    expect(mockGenerateReadSignedUrl).toHaveBeenCalledWith(tmpPath);
  });

  it('fetches services only when a SERVICE_LIST module is enabled', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    renderWithIntl(<HotsitePreview draft={makeDraft()} onPublish={vi.fn()} isPublishing={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-content')).toBeInTheDocument();
    });
    expect(mockFetchServices).not.toHaveBeenCalled();
  });

  it('fetches and renders services when a SERVICE_LIST module is enabled', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    mockFetchServices.mockResolvedValue([
      {
        id: 'service-1',
        name: 'Lavagem Completa',
        description: null,
        price: { amount: 8000, currency: 'BRL', formatted: 'R$ 80,00' },
        durationMinutes: 60,
        loyaltyPointsValue: 10,
        requiresPickupAddress: false,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const draft = makeDraft({
      layout: [
        ...makeDraft().layout,
        {
          type: 'SERVICE_LIST',
          enabled: true,
          data: { showPrices: true, showPoints: true, layout: 'grid' },
        },
      ],
    });

    renderWithIntl(<HotsitePreview draft={draft} onPublish={vi.fn()} isPublishing={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-content')).toBeInTheDocument();
    });
    expect(mockFetchServices).toHaveBeenCalledWith('tenant-a');
    expect(screen.getByText('Lavagem Completa')).toBeInTheDocument();
  });

  it('shows an error state when the manifest fetch fails', async () => {
    mockFetchManifest.mockRejectedValue(new Error('network error'));
    renderWithIntl(<HotsitePreview draft={makeDraft()} onPublish={vi.fn()} isPublishing={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-load-error')).toBeInTheDocument();
    });
  });

  it('calls onPublish when "Publicar agora" is clicked', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    const onPublish = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <HotsitePreview draft={makeDraft()} onPublish={onPublish} isPublishing={false} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-content')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('hotsite-preview-publish-desktop'));

    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('disables the publish buttons while isPublishing is true', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    renderWithIntl(<HotsitePreview draft={makeDraft()} onPublish={vi.fn()} isPublishing={true} />);

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-content')).toBeInTheDocument();
    });
    expect(screen.getByTestId('hotsite-preview-publish-desktop')).toBeDisabled();
    expect(screen.getByTestId('hotsite-preview-publish-mobile')).toBeDisabled();
  });
});
