// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import type { HotsiteAdminContentResponse, HotsiteManifestResponse } from '@ikaro/types';
import { clearPublicEnv, renderWithIntl, stubPublicEnv } from '@/test-utils';
import { fetchManifestClient } from '@/features/platform/api';
import { fetchServicesClient } from '@/features/platform/hotsite/api/services';
import { generateHotsiteImageReadSignedUrl } from '@/features/platform/api/tenant-settings';
import { HotsitePreview } from './HotsitePreview';

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({ tenantId: 'tenant-a-id', tenantSlug: 'tenant-a' }),
}));
vi.mock('@/features/platform/api', () => ({ fetchManifestClient: vi.fn() }));
vi.mock('@/features/platform/hotsite/api/services', () => ({ fetchServicesClient: vi.fn() }));
vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageReadSignedUrl: vi.fn(),
}));

const mockFetchManifest = vi.mocked(fetchManifestClient);
const mockFetchServices = vi.mocked(fetchServicesClient);
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
    seo: { title: null, description: null, ogImageUrl: '' },
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
    booking: {
      maxBookingAdvanceDays: 90,
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
    seo: { title: null, description: null, ogImageUrl: '' },
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

  afterEach(() => {
    clearPublicEnv();
  });

  // The draft canvas itself (loading, error, image resolution, services, containing block) is
  // covered by HotsitePreviewCanvas.spec.tsx; this wrapper only adds the publish chrome.
  it('renders the shared draft canvas with no editor selection wrapper', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    renderWithIntl(<HotsitePreview draft={makeDraft()} onPublish={vi.fn()} isPublishing={false} />);

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-content')).toBeInTheDocument();
    });
    expect(screen.getByText('Seu carro impecável')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-section-select')).not.toBeInTheDocument();
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
