// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import type { HotsiteAdminContentResponse, HotsiteManifestResponse } from '@ikaro/types';
import {
  clearPublicEnv,
  renderWithIntl,
  stubPublicEnv,
  hotsiteServiceBookingDefaults,
} from '@/test-utils';
import { fetchManifestClient } from '@/features/platform/api';
import { fetchServicesClient } from '@/features/platform/hotsite/api/services';
import { generateHotsiteImageReadSignedUrl } from '@/features/platform/api/tenant-settings';
import { HotsitePreviewCanvas } from './HotsitePreviewCanvas';

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

describe('HotsitePreviewCanvas', () => {
  beforeEach(() => {
    mockFetchManifest.mockReset();
    mockFetchServices.mockReset();
    mockGenerateReadSignedUrl.mockReset();
    stubPublicEnv({ NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL: IMAGE_BASE_URL });
  });

  afterEach(() => {
    clearPublicEnv();
  });

  it('shows a loading state before supplementary data resolves', () => {
    mockFetchManifest.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<HotsitePreviewCanvas draft={makeDraft()} />);

    expect(screen.getByTestId('hotsite-preview-loading')).toBeInTheDocument();
  });

  it('renders the draft hero module once supplementary data resolves', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    renderWithIntl(<HotsitePreviewCanvas draft={makeDraft()} />);

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

    const { container } = renderWithIntl(<HotsitePreviewCanvas draft={draft} />);

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

    const { container } = renderWithIntl(<HotsitePreviewCanvas draft={draft} />);

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

    renderWithIntl(<HotsitePreviewCanvas draft={draft} />);

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-content')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mockGenerateReadSignedUrl).toHaveBeenCalledTimes(1);
    });
    expect(mockGenerateReadSignedUrl).toHaveBeenCalledWith(tmpPath);
  });

  // CodeRabbit review (PR #291): the batch previously used a single Promise.all with no
  // per-path isolation — one failing signed-URL request discarded every other path's already-
  // successful result, silently dropping resolved previews that should have kept working.
  it('still applies a successfully-resolved signed URL when a different tmp/ path in the same batch fails', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    const okPath = 'tmp/tenant-a-id/hero/019f420c-e46d-7f42-8524-4621e4642832/ok.png';
    const failingPath = 'tmp/tenant-a-id/branding/019f420c-e46d-7f42-8524-4621e4642833/fail.png';
    mockGenerateReadSignedUrl.mockImplementation((path: string) => {
      if (path === failingPath) return Promise.reject(new Error('signed-url request failed'));
      return Promise.resolve({
        signedUrl: 'https://storage.example.com/signed-read?sig=ok',
        expiresAt: '2026-06-15T12:00:00.000Z',
      });
    });
    const draft = makeDraft({
      branding: { ...makeManifest().branding, logoUrl: failingPath },
      layout: [
        {
          type: 'HERO',
          enabled: true,
          data: {
            variant: 'centered',
            title: 'Seu carro impecável',
            ctaLabel: 'Agendar agora',
            ctaTarget: 'booking-form',
            backgroundImageUrl: okPath,
          },
        },
      ],
    });

    const { container } = renderWithIntl(<HotsitePreviewCanvas draft={draft} />);

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-content')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        'https://storage.example.com/signed-read?sig=ok',
      );
    });
  });

  it('fetches services only when a SERVICE_LIST module is enabled', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    renderWithIntl(<HotsitePreviewCanvas draft={makeDraft()} />);

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
        ...hotsiteServiceBookingDefaults,
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

    renderWithIntl(<HotsitePreviewCanvas draft={draft} />);

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-content')).toBeInTheDocument();
    });
    expect(mockFetchServices).toHaveBeenCalledWith('tenant-a');
    expect(screen.getByText('Lavagem Completa')).toBeInTheDocument();
  });

  it('shows an error state when the manifest fetch fails', async () => {
    mockFetchManifest.mockRejectedValue(new Error('network error'));
    renderWithIntl(<HotsitePreviewCanvas draft={makeDraft()} />);

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-load-error')).toBeInTheDocument();
    });
  });

  // Without this, ChatbotWidget's `position: fixed` bubble button resolves against the real
  // browser viewport instead of this frame, pinning it to the dashboard shell's corner rather
  // than the small preview box (found via manual testing after M19-S12 first wired CHATBOT into
  // the preview render dispatcher).
  it('establishes a CSS containing block on the preview frame so a fixed-position descendant (the chatbot bubble) stays confined to it', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    renderWithIntl(<HotsitePreviewCanvas draft={makeDraft()} />);

    await waitFor(() => {
      expect(screen.getByTestId('hotsite-preview-content')).toBeInTheDocument();
    });
    const frame = screen.getByTestId('hotsite-preview-content').parentElement;
    expect(frame).toHaveStyle({ transform: 'translateZ(0)' });
  });

  // applyBranding() only defines --ba-* variables; without an explicit paint a light-on-dark
  // tenant renders its light text on the browser's default white (docs/ENGINEERING_RULES_FRONTEND.md
  // § Hotsite full-page components must explicitly paint --ba-background).
  it('paints --ba-background on the content root for a light-on-dark branding', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    const draft = makeDraft({
      branding: {
        ...makeManifest().branding,
        backgroundColor: '#0a0a0a',
        textColor: '#ffffff',
      },
    });
    renderWithIntl(<HotsitePreviewCanvas draft={draft} />);

    const content = await screen.findByTestId('hotsite-preview-content');

    expect(content).toHaveStyle({ backgroundColor: 'var(--ba-background)' });
    expect(content.style.getPropertyValue('--ba-background')).toBe('#0a0a0a');
    expect(content.style.getPropertyValue('--ba-text')).toBe('#ffffff');
  });

  it('renders the public modules with no selection wrapper when no selection is passed', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    renderWithIntl(<HotsitePreviewCanvas draft={makeDraft()} />);

    await screen.findByTestId('hotsite-preview-content');

    expect(screen.queryByTestId('preview-section')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-section-select')).not.toBeInTheDocument();
  });

  it('wraps each rendered module in a selectable section and reports the selection', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <HotsitePreviewCanvas draft={makeDraft()} selection={{ selectedType: null, onSelect }} />,
    );

    await user.click(await screen.findByTestId('preview-section-select'));

    expect(onSelect).toHaveBeenCalledWith('HERO');
  });

  it('marks only the selected module as selected', async () => {
    mockFetchManifest.mockResolvedValue(makeManifest());
    renderWithIntl(
      <HotsitePreviewCanvas
        draft={makeDraft()}
        selection={{ selectedType: 'HERO', onSelect: vi.fn() }}
      />,
    );

    const select = await screen.findByTestId('preview-section-select');

    expect(select).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('preview-section-badge')).toHaveTextContent('Selecionado · Hero');
  });

  describe('public top bar', () => {
    it('renders the signed-out bar as the first child of the content root, inside an inert wrapper', async () => {
      mockFetchManifest.mockResolvedValue(makeManifest());
      renderWithIntl(<HotsitePreviewCanvas draft={makeDraft()} />);

      const content = await screen.findByTestId('hotsite-preview-content');
      const wrapper = content.firstElementChild;

      expect(wrapper).toBe(screen.getByTestId('hotsite-preview-auth-bar'));
      expect(wrapper).toHaveAttribute('inert');
      expect(wrapper).toHaveClass('pointer-events-none');
      expect(wrapper).toContainElement(screen.getByTestId('hotsite-auth-bar'));
      expect(screen.getByTestId('hotsite-staff-link')).toHaveTextContent('Área da Equipe');
      expect(screen.getByTestId('hotsite-login-link')).toHaveTextContent('Entrar');
    });

    it('shows the draft logo in the bar, and the initial badge when there is none', async () => {
      mockFetchManifest.mockResolvedValue(makeManifest());
      const withLogo = makeDraft({
        branding: { ...makeManifest().branding, logoUrl: `${IMAGE_BASE_URL}/logo.png` },
      });
      const { unmount } = renderWithIntl(<HotsitePreviewCanvas draft={withLogo} />);

      await screen.findByTestId('hotsite-preview-content');
      expect(screen.getByTestId('hotsite-auth-bar').querySelector('img')).not.toBeNull();
      unmount();

      renderWithIntl(<HotsitePreviewCanvas draft={makeDraft()} />);
      await screen.findByTestId('hotsite-preview-content');
      expect(screen.getByTestId('hotsite-auth-bar').querySelector('img')).toBeNull();
      expect(screen.getByTestId('hotsite-auth-bar')).toHaveTextContent('T');
    });

    it('prefers the draft brand name over the saved tenant name for the mark', async () => {
      mockFetchManifest.mockResolvedValue(makeManifest());
      const draft = makeDraft({
        branding: { ...makeManifest().branding, brandName: 'Zeta Wash' },
      });
      renderWithIntl(<HotsitePreviewCanvas draft={draft} />);

      await screen.findByTestId('hotsite-preview-content');

      expect(screen.getByTestId('hotsite-auth-bar')).toHaveTextContent('Z');
    });

    it('never requests the session', async () => {
      mockFetchManifest.mockResolvedValue(makeManifest());
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      renderWithIntl(<HotsitePreviewCanvas draft={makeDraft()} />);

      await screen.findByTestId('hotsite-auth-bar');

      expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining('/api/session'));
      fetchSpy.mockRestore();
    });

    it('renders no selectable section for the bar and leaves the module render plan untouched', async () => {
      mockFetchManifest.mockResolvedValue(makeManifest());
      renderWithIntl(
        <HotsitePreviewCanvas
          draft={makeDraft()}
          selection={{ selectedType: null, onSelect: vi.fn() }}
        />,
      );

      const bar = await screen.findByTestId('hotsite-preview-auth-bar');

      expect(bar.querySelector('[data-testid="preview-section-select"]')).toBeNull();
      expect(bar.closest('[data-testid="preview-section"]')).toBeNull();
      expect(screen.getAllByTestId('preview-section')).toHaveLength(1);
    });
  });
});
