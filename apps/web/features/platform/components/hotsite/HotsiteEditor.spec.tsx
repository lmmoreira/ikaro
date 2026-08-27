// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse, HotsiteManifestResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import {
  DashboardTopbarStatusProvider,
  useDashboardTopbarStatus,
} from '@/shells/dashboard/components/topbar-status-context';
import {
  updateHotsiteConfig,
  publishHotsite,
  unpublishHotsite,
  getLeadFormConfig,
} from '@/features/platform/api/tenant-settings';
import { fetchManifestClient } from '@/features/platform/api';
import { fetchServicesClient } from '@/features/platform/hotsite/api/services';
import { ApiError } from '@/shared/lib/api/errors';
import { HotsiteEditor } from './HotsiteEditor';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  getHotsiteConfig: vi.fn(),
  updateHotsiteConfig: vi.fn(),
  publishHotsite: vi.fn(),
  unpublishHotsite: vi.fn(),
  generateHotsiteImageSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
  featureBookingPhoto: vi.fn(),
  getLeadFormConfig: vi.fn(),
  updateLeadFormConfig: vi.fn(),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({ tenantId: 'tenant-a-id', tenantSlug: 'tenant-a' }),
}));

vi.mock('@/features/booking/api/booking', () => ({
  listBookings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
  getBooking: vi.fn(),
}));

// Only needed so the Preview view (opened either from the tabs or from module-config) can
// actually render its module content instead of getting stuck on its own load-error state — the
// existing pre-M18-S08 tests never inspected that content, only the always-rendered sidebar, so
// they don't depend on these resolving any particular way.
vi.mock('@/features/platform/api', () => ({ fetchManifestClient: vi.fn() }));
vi.mock('@/features/platform/hotsite/api/services', () => ({ fetchServicesClient: vi.fn() }));

const mockUpdateHotsiteConfig = vi.mocked(updateHotsiteConfig);
const mockPublishHotsite = vi.mocked(publishHotsite);
const mockUnpublishHotsite = vi.mocked(unpublishHotsite);
const mockFetchManifestClient = vi.mocked(fetchManifestClient);
const mockFetchServicesClient = vi.mocked(fetchServicesClient);
const mockGetLeadFormConfig = vi.mocked(getLeadFormConfig);

const INITIAL: HotsiteAdminContentResponse = {
  branding: {
    primaryColor: '#2563eb',
    secondaryColor: '#eff6ff',
    backgroundColor: '#ffffff',
    textColor: '#111827',
    headingFontFamily: 'Inter',
    bodyFontFamily: 'Inter',
    logoUrl: '',
    borderRadius: 'rounded',
    buttonStyle: 'filled',
    spacing: 'comfortable',
    shadowStyle: 'subtle',
  },
  layout: [],
  seo: { title: null, description: null, ogImageUrl: '' },
  isPublished: true,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const MANIFEST: HotsiteManifestResponse = {
  tenant: { id: 'tenant-a-id', name: 'Tenant A', slug: 'tenant-a' },
  branding: INITIAL.branding,
  layout: [],
  seo: INITIAL.seo,
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
  booking: { maxBookingAdvanceDays: 90 },
};

function TopbarOverrideProbe(): React.JSX.Element {
  const status = useDashboardTopbarStatus();
  return (
    <div>
      <p data-testid="probe-page-title">{status?.pageTitleOverride ?? 'none'}</p>
      <p data-testid="probe-back-label">{status?.backLabelOverride ?? 'none'}</p>
      <p data-testid="probe-onback">{status?.onBackOverride ? 'set' : 'none'}</p>
      {status?.onBackOverride && (
        <button type="button" data-testid="probe-trigger-back" onClick={status.onBackOverride}>
          back
        </button>
      )}
    </div>
  );
}

function withQueryClient(children: React.ReactNode): React.ReactElement {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderEditor(initial: HotsiteAdminContentResponse = INITIAL) {
  return renderWithIntl(withQueryClient(<HotsiteEditor initial={initial} />));
}

describe('HotsiteEditor', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    mockUpdateHotsiteConfig.mockReset();
    mockPublishHotsite.mockReset();
    mockUnpublishHotsite.mockReset();
    mockFetchManifestClient.mockReset().mockResolvedValue(MANIFEST);
    mockFetchServicesClient.mockReset().mockResolvedValue([]);
    mockGetLeadFormConfig.mockReset().mockResolvedValue({
      title: '',
      ctaLabel: '',
      audienceMode: 'GUEST_AND_CUSTOMER',
      questions: [],
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('loads with 4 tabs, Branding active by default and Manifesto last', () => {
    renderEditor();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Branding', 'Layout', 'SEO', 'Manifesto']);
    expect(screen.getByRole('tab', { name: 'Branding' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Layout' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'SEO' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Manifesto' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByTestId('hotsite-primary-color')).toBeInTheDocument();
  });

  it('switches to Layout without triggering a network request, showing all 8 auto-materialized modules', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('tab', { name: 'Layout' }));

    expect(screen.getByRole('tab', { name: 'Layout' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('layout-tab-list')).toBeInTheDocument();
    const layoutRows = screen.getAllByTestId('layout-row');
    expect(layoutRows.find((el) => el.dataset.moduleType === 'HERO')).toBeInTheDocument();
    expect(layoutRows.find((el) => el.dataset.moduleType === 'FOOTER')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('switches to SEO showing the SeoTab fields bound to the draft', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('tab', { name: 'SEO' }));

    expect(screen.getByTestId('hotsite-seo-title')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-seo-description')).toBeInTheDocument();
  });

  it('renders Publicar alterações, Preview, and the unpublish action enabled by default', () => {
    renderEditor();

    expect(screen.getByTestId('hotsite-publish-desktop')).toBeEnabled();
    expect(screen.getByTestId('hotsite-publish-mobile')).toBeEnabled();
    expect(screen.getByTestId('hotsite-preview-desktop')).toBeEnabled();
    expect(screen.getByTestId('hotsite-preview-mobile')).toBeEnabled();
    expect(screen.getByTestId('hotsite-unpublish-button')).toBeEnabled();
  });

  describe('Preview view swap', () => {
    it('opens the preview view without changing the URL, and pushes a topbar back override', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        withQueryClient(
          <DashboardTopbarStatusProvider>
            <TopbarOverrideProbe />
            <HotsiteEditor initial={INITIAL} />
          </DashboardTopbarStatusProvider>,
        ),
      );

      await user.click(screen.getByTestId('hotsite-preview-desktop'));

      expect(screen.getByTestId('probe-onback')).toHaveTextContent('set');
      expect(screen.getByTestId('probe-page-title')).toHaveTextContent('Preview');
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('returns to the tabs view via the topbar back override, clearing it', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        withQueryClient(
          <DashboardTopbarStatusProvider>
            <TopbarOverrideProbe />
            <HotsiteEditor initial={INITIAL} />
          </DashboardTopbarStatusProvider>,
        ),
      );

      await user.click(screen.getByTestId('hotsite-preview-desktop'));
      await waitFor(() => expect(screen.getByTestId('probe-onback')).toHaveTextContent('set'));

      await user.click(screen.getByTestId('probe-trigger-back'));

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getByTestId('probe-onback')).toHaveTextContent('none');
    });
  });

  describe('Publish flow', () => {
    it('strips resolved image URLs, saves the draft, publishes, and shows the success banner on the tabs view', async () => {
      mockUpdateHotsiteConfig.mockResolvedValue({ ...INITIAL });
      mockPublishHotsite.mockResolvedValue({ isPublished: true });
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByTestId('hotsite-publish-desktop'));

      await waitFor(() => {
        expect(screen.getByTestId('hotsite-action-success-banner')).toBeInTheDocument();
      });
      expect(mockUpdateHotsiteConfig).toHaveBeenCalledTimes(1);
      expect(mockPublishHotsite).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('shows the specific translated message when the save fails with a known code', async () => {
      mockUpdateHotsiteConfig.mockRejectedValue(
        new ApiError(422, 'Invalid', { code: 'PLATFORM_HOTSITE_NO_ENABLED_MODULES' }),
      );
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByTestId('hotsite-publish-desktop'));

      await waitFor(() => {
        expect(screen.getByTestId('hotsite-action-error-banner')).toHaveTextContent(
          'É necessário ativar ao menos um módulo para publicar o site.',
        );
      });
      expect(mockPublishHotsite).not.toHaveBeenCalled();
    });

    // Regression test: after a save, the PATCH response reflects any tmp/ -> permanent path
    // promotion the backend just performed (and deleted the tmp/ object for). Before this fix,
    // `draft` never absorbed that response, so a *second* save resubmitted the stale tmp/
    // reference — which the backend then rejects with HotsiteImageNotUploadedError, because the
    // tmp/ object no longer exists (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md).
    it('refreshes the draft with the promoted path from the PATCH response, so a second save does not resubmit a dead tmp/ reference', async () => {
      const tmpPath = 'tmp/tenant-a-id/hero/u1/banner.png';
      const promotedPath = 'tenants/tenant-a-id/hotsite/hero/u1/banner.png';
      const heroModule = (backgroundImageUrl: string) => ({
        type: 'HERO' as const,
        enabled: true,
        data: {
          variant: 'centered',
          title: 'Título',
          ctaLabel: 'Agendar',
          ctaTarget: 'booking-form',
          backgroundImageUrl,
        },
      });
      const draftWithTmpHero: HotsiteAdminContentResponse = {
        ...INITIAL,
        layout: [heroModule(tmpPath)],
      };
      mockUpdateHotsiteConfig.mockResolvedValueOnce({
        ...draftWithTmpHero,
        layout: [heroModule(promotedPath)],
      });
      mockPublishHotsite.mockResolvedValue({ isPublished: true });
      const user = userEvent.setup();
      renderEditor(draftWithTmpHero);

      await user.click(screen.getByTestId('hotsite-publish-desktop'));
      await waitFor(() => {
        expect(screen.getByTestId('hotsite-action-success-banner')).toBeInTheDocument();
      });

      mockUpdateHotsiteConfig.mockResolvedValueOnce({
        ...draftWithTmpHero,
        layout: [heroModule(promotedPath)],
      });
      await user.click(screen.getByTestId('hotsite-publish-desktop'));

      await waitFor(() => {
        expect(mockUpdateHotsiteConfig).toHaveBeenCalledTimes(2);
      });
      const secondCallBody = mockUpdateHotsiteConfig.mock.calls[1]![0];
      const submittedHero = secondCallBody.layout?.find((m) => m.type === 'HERO');
      expect((submittedHero?.data as { backgroundImageUrl: string }).backgroundImageUrl).toBe(
        promotedPath,
      );
    });

    // Regression test: a stale "already live" success banner from a previous publish must not
    // survive further edits, or it reads as if brand-new unsaved changes are already published
    // too — reported after publishing once, then editing and applying a different module.
    it('clears the success banner as soon as the draft is edited again (e.g. applying a module config change)', async () => {
      mockUpdateHotsiteConfig.mockResolvedValue({ ...INITIAL });
      mockPublishHotsite.mockResolvedValue({ isPublished: true });
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByTestId('hotsite-publish-desktop'));
      await waitFor(() => {
        expect(screen.getByTestId('hotsite-action-success-banner')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('tab', { name: 'Layout' }));
      await user.click(
        screen
          .getAllByTestId('layout-row-configure')
          .find((el) => el.dataset.moduleType === 'HERO')!,
      );
      const titleInput = await screen.findByLabelText('Título *');
      await user.clear(titleInput);
      await user.type(titleInput, 'Novo título');
      await user.click(screen.getByTestId('module-config-apply-desktop'));

      expect(screen.queryByTestId('hotsite-action-success-banner')).not.toBeInTheDocument();
    });

    // Regression test: the banner only renders in the tabs view — a failed publish triggered
    // from Preview must switch back to tabs too, or the admin is stuck in Preview with no
    // visible error feedback at all.
    it('switches back to the tabs view to show the error banner when publish fails from Preview', async () => {
      mockUpdateHotsiteConfig.mockRejectedValue(new Error('network error'));
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByTestId('hotsite-preview-desktop'));
      // Preview is lazy-loaded via next/dynamic — give the chunk import more room than the
      // default 1s timeout so this doesn't flake under a loaded test runner.
      await user.click(
        await screen.findByTestId('hotsite-preview-publish-desktop', {}, { timeout: 5000 }),
      );

      await waitFor(() => {
        expect(screen.getByTestId('hotsite-action-error-banner')).toHaveTextContent(
          'Algo deu errado. Tente novamente.',
        );
      });
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });
  });

  describe('Unpublish flow', () => {
    it('unpublishes and shows the success banner without saving the draft first', async () => {
      mockUnpublishHotsite.mockResolvedValue({ isPublished: false });
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByTestId('hotsite-unpublish-button'));

      await waitFor(() => {
        expect(screen.getByTestId('hotsite-action-success-banner')).toBeInTheDocument();
      });
      expect(mockUnpublishHotsite).toHaveBeenCalledTimes(1);
      expect(mockUpdateHotsiteConfig).not.toHaveBeenCalled();
    });

    it('shows the specific translated message when unpublish fails with a known code', async () => {
      mockUnpublishHotsite.mockRejectedValue(
        new ApiError(404, 'Not found', { code: 'PLATFORM_TENANT_NOT_FOUND' }),
      );
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByTestId('hotsite-unpublish-button'));

      await waitFor(() => {
        expect(screen.getByTestId('hotsite-action-error-banner')).toHaveTextContent(
          'Estabelecimento não encontrado.',
        );
      });
    });
  });

  describe('Manifesto tab', () => {
    it('switches to Manifesto without a network request, seeded with the current draft as JSON', async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByRole('tab', { name: 'Manifesto' }));

      expect(screen.getByRole('tab', { name: 'Manifesto' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      const textarea = screen.getByTestId('hotsite-manifest-textarea') as HTMLTextAreaElement;
      expect(textarea.value).toContain('"primaryColor": "#2563eb"');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('Aplicar commits a valid JSON edit into the draft and clears a stale action banner', async () => {
      mockUpdateHotsiteConfig.mockResolvedValue({ ...INITIAL });
      mockPublishHotsite.mockResolvedValue({ isPublished: true });
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByTestId('hotsite-publish-desktop'));
      await waitFor(() => {
        expect(screen.getByTestId('hotsite-action-success-banner')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('tab', { name: 'Manifesto' }));
      const textarea = screen.getByTestId('hotsite-manifest-textarea') as HTMLTextAreaElement;
      const edited = JSON.parse(textarea.value) as { branding: { primaryColor: string } };
      edited.branding.primaryColor = '#00ff00';
      fireEvent.change(textarea, { target: { value: JSON.stringify(edited) } });
      await user.click(screen.getByTestId('hotsite-manifest-apply'));

      expect(screen.queryByTestId('hotsite-action-success-banner')).not.toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: 'Branding' }));
      expect(screen.getByTestId('hotsite-primary-color')).toHaveValue('#00ff00');
    });

    it('shows an inline error and leaves the draft unchanged when the JSON is invalid', async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByRole('tab', { name: 'Manifesto' }));
      const textarea = screen.getByTestId('hotsite-manifest-textarea');
      fireEvent.change(textarea, { target: { value: '{ not valid json' } });
      await user.click(screen.getByTestId('hotsite-manifest-apply'));

      expect(screen.getByTestId('hotsite-manifest-error')).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: 'Branding' }));
      expect(screen.getByTestId('hotsite-primary-color')).toHaveValue('#2563eb');
    });

    it('leaving the tab without Aplicar discards the pending edit; re-entering reseeds from the draft', async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByRole('tab', { name: 'Manifesto' }));
      const textarea = screen.getByTestId('hotsite-manifest-textarea');
      fireEvent.change(textarea, { target: { value: '{ not valid json' } });

      await user.click(screen.getByRole('tab', { name: 'Branding' }));
      expect(screen.getByTestId('hotsite-primary-color')).toHaveValue('#2563eb');

      await user.click(screen.getByRole('tab', { name: 'Manifesto' }));
      const reseeded = screen.getByTestId('hotsite-manifest-textarea') as HTMLTextAreaElement;
      expect(reseeded.value).toContain('"primaryColor": "#2563eb"');
    });
  });

  describe('"Configurar" view swap', () => {
    it('opens the module config shell for the clicked module, without changing the URL or making a network request', async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByRole('tab', { name: 'Layout' }));
      await user.click(
        screen
          .getAllByTestId('layout-row-configure')
          .find((el) => el.dataset.moduleType === 'HERO')!,
      );

      expect(await screen.findByLabelText('Título *')).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('"Aplicar" commits the edited field into the Layout tab\'s draft and returns to the tabs view', async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByRole('tab', { name: 'Layout' }));
      await user.click(
        screen
          .getAllByTestId('layout-row-configure')
          .find((el) => el.dataset.moduleType === 'HERO')!,
      );
      const titleInput = await screen.findByLabelText('Título *');
      await user.clear(titleInput);
      await user.type(titleInput, 'Novo título');
      await user.click(screen.getByTestId('module-config-apply-desktop'));

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      await user.click(
        screen
          .getAllByTestId('layout-row-configure')
          .find((el) => el.dataset.moduleType === 'HERO')!,
      );
      expect(await screen.findByDisplayValue('Novo título')).toBeInTheDocument();
    });

    it('"Cancelar" discards local edits and returns to the tabs view without mutating the draft', async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByRole('tab', { name: 'Layout' }));
      await user.click(
        screen
          .getAllByTestId('layout-row-configure')
          .find((el) => el.dataset.moduleType === 'HERO')!,
      );
      const titleInput = await screen.findByLabelText('Título *');
      await user.type(titleInput, 'Descartado');
      await user.click(screen.getByTestId('module-config-cancel-desktop'));
      await user.click(screen.getByTestId('module-config-discard-confirm'));

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      await user.click(
        screen
          .getAllByTestId('layout-row-configure')
          .find((el) => el.dataset.moduleType === 'HERO')!,
      );
      expect(screen.queryByDisplayValue('Descartado')).not.toBeInTheDocument();
    });

    it('pushes an onBackOverride + page title into the shared dashboard Topbar context while configuring, and clears them on cancel', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        withQueryClient(
          <DashboardTopbarStatusProvider>
            <TopbarOverrideProbe />
            <HotsiteEditor initial={INITIAL} />
          </DashboardTopbarStatusProvider>,
        ),
      );

      expect(screen.getByTestId('probe-onback')).toHaveTextContent('none');

      await user.click(screen.getByRole('tab', { name: 'Layout' }));
      await user.click(
        screen
          .getAllByTestId('layout-row-configure')
          .find((el) => el.dataset.moduleType === 'HERO')!,
      );

      expect(screen.getByTestId('probe-onback')).toHaveTextContent('set');
      expect(screen.getByTestId('probe-page-title')).toHaveTextContent('Configurar: Hero');

      await user.click(screen.getByTestId('module-config-cancel-desktop'));

      expect(screen.getByTestId('probe-onback')).toHaveTextContent('none');
      expect(screen.getByTestId('probe-page-title')).toHaveTextContent('none');
    });

    it('opens every one of the other 7 module panels (each lazy-loaded via next/dynamic)', async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByRole('tab', { name: 'Layout' }));

      const panels: ReadonlyArray<{ type: string; testId: string }> = [
        { type: 'SERVICE_LIST', testId: 'service-list-show-prices' },
        { type: 'GALLERY', testId: 'gallery-open-picker' },
        { type: 'TESTIMONIALS', testId: 'testimonials-add' },
        { type: 'BOOKING_CTA', testId: 'booking-cta-variant-centered' },
        { type: 'ABOUT', testId: 'about-image-position-left' },
        { type: 'CONTACT', testId: 'contact-show-address' },
        { type: 'FOOTER', testId: 'footer-show-whatsapp' },
      ];

      for (const panel of panels) {
        await user.click(
          screen
            .getAllByTestId('layout-row-configure')
            .find((el) => el.dataset.moduleType === panel.type)!,
        );
        expect(await screen.findByTestId(panel.testId)).toBeInTheDocument();
        await user.click(screen.getByTestId('module-config-cancel-desktop'));
        expect(await screen.findByRole('tablist')).toBeInTheDocument();
      }
    });

    it('editing a Branding field through HotsiteEditor updates the draft (setBranding)', async () => {
      const user = userEvent.setup();
      renderEditor();

      const primaryColorInput = screen.getByTestId('hotsite-primary-color');
      await user.clear(primaryColorInput);
      await user.type(primaryColorInput, '#ff0000');

      expect(primaryColorInput).toHaveValue('#ff0000');
    });

    it("toggling a module through HotsiteEditor's Layout tab updates the draft (setLayout)", async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByRole('tab', { name: 'Layout' }));
      const heroToggle = screen.getByTestId('layout-row-toggle-HERO');
      const initialChecked = heroToggle.getAttribute('aria-checked');

      await user.click(heroToggle);

      expect(heroToggle.getAttribute('aria-checked')).not.toBe(initialChecked);
    });
  });

  async function openHeroConfig(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole('tab', { name: 'Layout' }));
    await user.click(
      screen.getAllByTestId('layout-row-configure').find((el) => el.dataset.moduleType === 'HERO')!,
    );
    await screen.findByLabelText('Título *');
  }

  describe('Preview from module config', () => {
    it("shows the in-progress edit (not yet Aplicar'd) merged with the rest of the draft", async () => {
      // HERO must be `enabled: true` to actually render in the preview — the default
      // materialized layout starts every module disabled (materializeLayout), which is fine for
      // the other tests here (they inspect the config panel's own input, or the submitted
      // mutation body, never the rendered preview content).
      const draftWithHeroEnabled: HotsiteAdminContentResponse = {
        ...INITIAL,
        layout: [
          {
            type: 'HERO',
            enabled: true,
            data: {
              variant: 'centered',
              title: 'Título original',
              ctaLabel: 'Agendar',
              ctaTarget: 'booking-form',
            },
          },
        ],
      };
      const user = userEvent.setup();
      renderEditor(draftWithHeroEnabled);

      await openHeroConfig(user);
      const titleInput = screen.getByLabelText('Título *');
      await user.clear(titleInput);
      await user.type(titleInput, 'Título em progresso');
      await user.click(screen.getByTestId('module-config-preview-desktop'));

      expect(await screen.findByText('Título em progresso')).toBeInTheDocument();
      expect(screen.queryByLabelText('Título *')).not.toBeInTheDocument();
    });

    it('Back from that preview returns to the same module-config view with the edit intact', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        withQueryClient(
          <DashboardTopbarStatusProvider>
            <TopbarOverrideProbe />
            <HotsiteEditor initial={INITIAL} />
          </DashboardTopbarStatusProvider>,
        ),
      );

      await openHeroConfig(user);
      const titleInput = screen.getByLabelText('Título *');
      await user.clear(titleInput);
      await user.type(titleInput, 'Título em progresso');
      await user.click(screen.getByTestId('module-config-preview-desktop'));
      await waitFor(() => expect(screen.getByTestId('probe-onback')).toHaveTextContent('set'));

      await user.click(screen.getByTestId('probe-trigger-back'));

      expect(await screen.findByDisplayValue('Título em progresso')).toBeInTheDocument();
    });

    it('Publish from that preview submits the merged content in one call and shows the success banner on the tabs view', async () => {
      mockUpdateHotsiteConfig.mockResolvedValue({ ...INITIAL });
      mockPublishHotsite.mockResolvedValue({ isPublished: true });
      const user = userEvent.setup();
      renderEditor();

      await openHeroConfig(user);
      const titleInput = screen.getByLabelText('Título *');
      await user.clear(titleInput);
      await user.type(titleInput, 'Publicado direto');
      await user.click(screen.getByTestId('module-config-preview-desktop'));

      await user.click(
        await screen.findByTestId('hotsite-preview-publish-desktop', {}, { timeout: 5000 }),
      );

      await waitFor(() => {
        expect(screen.getByTestId('hotsite-action-success-banner')).toBeInTheDocument();
      });
      expect(mockUpdateHotsiteConfig).toHaveBeenCalledTimes(1);
      const submittedBody = mockUpdateHotsiteConfig.mock.calls[0]![0];
      const submittedHero = submittedBody.layout?.find((m) => m.type === 'HERO');
      expect((submittedHero?.data as { title: string }).title).toBe('Publicado direto');
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('blocks Publish from that preview when a lead-form question is invalid, and submits nothing', async () => {
      const user = userEvent.setup();
      renderEditor();

      await user.click(screen.getByRole('tab', { name: 'Layout' }));
      await user.click(
        screen
          .getAllByTestId('layout-row-configure')
          .find((el) => el.dataset.moduleType === 'LEAD_FORM')!,
      );
      await screen.findByTestId('lead-form-config-panel');

      // A freshly added question starts with an empty label, which
      // hasInvalidLeadFormQuestion rejects — no need to type anything to reach the invalid state.
      await user.click(screen.getByRole('button', { name: '+ Adicionar pergunta' }));
      await user.click(screen.getByTestId('module-config-preview-desktop'));
      await user.click(
        await screen.findByTestId('hotsite-preview-publish-desktop', {}, { timeout: 5000 }),
      );

      await waitFor(() => {
        expect(screen.getByTestId('hotsite-action-error-banner')).toHaveTextContent(
          'Corrija as perguntas inválidas antes de publicar.',
        );
      });
      expect(mockUpdateHotsiteConfig).not.toHaveBeenCalled();
      expect(mockPublishHotsite).not.toHaveBeenCalled();
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });
  });

  describe('Discard-confirm on Cancelar / topbar back', () => {
    it('Cancelar with no edit navigates straight to tabs, no dialog', async () => {
      const user = userEvent.setup();
      renderEditor();

      await openHeroConfig(user);
      await user.click(screen.getByTestId('module-config-cancel-desktop'));

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.queryByTestId('module-config-discard-confirm')).not.toBeInTheDocument();
    });

    it('Cancelar after an edit opens the dialog; confirming discards and returns to tabs', async () => {
      const user = userEvent.setup();
      renderEditor();

      await openHeroConfig(user);
      await user.type(screen.getByLabelText('Título *'), 'Editado');
      await user.click(screen.getByTestId('module-config-cancel-desktop'));

      expect(screen.getByTestId('module-config-discard-confirm')).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('module-config-discard-confirm'));

      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('"Continuar editando" closes the dialog and keeps the edit intact on the same module-config view', async () => {
      const user = userEvent.setup();
      renderEditor();

      await openHeroConfig(user);
      await user.type(screen.getByLabelText('Título *'), 'Editado');
      await user.click(screen.getByTestId('module-config-cancel-desktop'));

      await user.click(screen.getByRole('button', { name: 'Continuar editando' }));

      expect(screen.queryByTestId('module-config-discard-confirm')).not.toBeInTheDocument();
      expect(await screen.findByDisplayValue(/Editado/)).toBeInTheDocument();
    });

    // Regression test for the ref-based staleness fix (Part 7): the topbar back-arrow override
    // is only recreated when the module type changes, not on every keystroke — without the ref,
    // it would still be checking dirtiness against the value captured when the panel first
    // opened, missing an edit made afterward.
    it('the topbar back arrow, invoked after an edit made post-open, still detects the edit as dirty', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        withQueryClient(
          <DashboardTopbarStatusProvider>
            <TopbarOverrideProbe />
            <HotsiteEditor initial={INITIAL} />
          </DashboardTopbarStatusProvider>,
        ),
      );

      await openHeroConfig(user);
      await user.type(screen.getByLabelText('Título *'), 'Editado via topbar');

      await user.click(screen.getByTestId('probe-trigger-back'));

      expect(screen.getByTestId('module-config-discard-confirm')).toBeInTheDocument();
    });
  });

  describe('"Visitar site" link', () => {
    it('renders on the tabs view only, linking to the public hotsite in a new tab', async () => {
      const user = userEvent.setup();
      renderEditor();

      const desktopLink = screen.getByTestId('hotsite-view-live-site-desktop');
      expect(desktopLink.tagName).toBe('A');
      expect(desktopLink).toHaveAttribute('href', '/tenant-a');
      expect(desktopLink).toHaveAttribute('target', '_blank');
      expect(desktopLink).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.getByTestId('hotsite-view-live-site-mobile')).toHaveAttribute(
        'href',
        '/tenant-a',
      );

      await openHeroConfig(user);

      expect(screen.queryByTestId('hotsite-view-live-site-desktop')).not.toBeInTheDocument();
    });
  });
});
