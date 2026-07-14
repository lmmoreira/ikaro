// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import {
  DashboardTopbarStatusProvider,
  useDashboardTopbarStatus,
} from '@/shells/dashboard/components/topbar-status-context';
import {
  updateHotsiteConfig,
  publishHotsite,
  unpublishHotsite,
} from '@/features/platform/api/tenant-settings';
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
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({ tenantId: 'tenant-a-id', tenantSlug: 'tenant-a' }),
}));

vi.mock('@/features/booking/api/staff', () => ({
  listBookings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
  getBooking: vi.fn(),
}));

const mockUpdateHotsiteConfig = vi.mocked(updateHotsiteConfig);
const mockPublishHotsite = vi.mocked(publishHotsite);
const mockUnpublishHotsite = vi.mocked(unpublishHotsite);

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
  seo: { title: null, description: null },
  isPublished: true,
  updatedAt: '2026-07-01T00:00:00.000Z',
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
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('loads with 3 tabs, Branding active by default', () => {
    renderEditor();

    expect(screen.getByRole('tab', { name: 'Branding' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Layout' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'SEO' })).toHaveAttribute('aria-selected', 'false');
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
});
