// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
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

function renderVisualEditor(initial: HotsiteAdminContentResponse = INITIAL) {
  return renderWithIntl(withQueryClient(<HotsiteEditor initial={initial} />));
}

function renderEditorWithTopbarProbe(initial: HotsiteAdminContentResponse = INITIAL) {
  return renderWithIntl(
    withQueryClient(
      <DashboardTopbarStatusProvider>
        <TopbarOverrideProbe />
        <HotsiteEditor initial={initial} />
      </DashboardTopbarStatusProvider>,
    ),
  );
}

function visualCommand(command: string): HTMLElement {
  const match = screen
    .getAllByTestId('visual-command')
    .find((element) => element.dataset.command === command);
  if (!match) throw new Error(`No visual command "${command}"`);
  return match;
}

// The editor now opens in the visual editor; every case below that exercises the retained tabbed
// editor (tabs, Preview, module-config drill-down, Manifesto) enters it through "Editar em detalhes".
function renderDetailedEditor(initial: HotsiteAdminContentResponse = INITIAL) {
  const rendered = renderVisualEditor(initial);
  fireEvent.click(visualCommand('detail'));
  return rendered;
}

function renderDetailedEditorWithTopbarProbe() {
  const rendered = renderEditorWithTopbarProbe();
  fireEvent.click(visualCommand('detail'));
  return rendered;
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
    renderDetailedEditor();

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
    renderDetailedEditor();

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
    renderDetailedEditor();

    await user.click(screen.getByRole('tab', { name: 'SEO' }));

    expect(screen.getByTestId('hotsite-seo-title')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-seo-description')).toBeInTheDocument();
  });

  it('renders Publicar alterações, Preview, and the unpublish action enabled by default', () => {
    renderDetailedEditor();

    expect(screen.getByTestId('hotsite-publish-desktop')).toBeEnabled();
    expect(screen.getByTestId('hotsite-publish-mobile')).toBeEnabled();
    expect(screen.getByTestId('hotsite-preview-desktop')).toBeEnabled();
    expect(screen.getByTestId('hotsite-preview-mobile')).toBeEnabled();
    expect(screen.getByTestId('hotsite-unpublish-button')).toBeEnabled();
  });

  describe('Visual editor (default view)', () => {
    const HERO_ENABLED: HotsiteAdminContentResponse = {
      ...INITIAL,
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
    };

    it('opens in the visual editor, not the tabbed editor', () => {
      renderVisualEditor();

      expect(screen.getByTestId('visual-editor')).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('goes to the tabbed editor via Editar em detalhes and back via the topbar without a reload', async () => {
      const user = userEvent.setup();
      renderEditorWithTopbarProbe();
      expect(screen.getByTestId('probe-onback')).toHaveTextContent('none');

      await user.click(visualCommand('detail'));
      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getByTestId('probe-back-label')).toHaveTextContent('Voltar à edição visual');

      await user.click(screen.getByTestId('probe-trigger-back'));
      expect(screen.getByTestId('visual-editor')).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.getByTestId('probe-onback')).toHaveTextContent('none');
    });

    it('keeps one shared draft across the visual -> detailed -> visual -> detailed round trip', async () => {
      const user = userEvent.setup();
      renderEditorWithTopbarProbe();
      await user.click(visualCommand('detail'));
      fireEvent.change(screen.getByTestId('hotsite-primary-color'), {
        target: { value: '#123456' },
      });

      await user.click(screen.getByTestId('probe-trigger-back'));
      await user.click(visualCommand('detail'));

      expect(screen.getByTestId('hotsite-primary-color')).toHaveValue('#123456');
    });

    it('keeps the selected section across the round trip through the detailed editor', async () => {
      const user = userEvent.setup();
      renderEditorWithTopbarProbe(HERO_ENABLED);

      await user.click(await screen.findByTestId('preview-section-select'));
      expect(screen.getByTestId('visual-preview-status')).toHaveTextContent('selecionado: Hero');

      await user.click(visualCommand('detail'));
      await user.click(screen.getByTestId('probe-trigger-back'));

      expect(screen.getByTestId('visual-preview-status')).toHaveTextContent('selecionado: Hero');
    });

    it('publishes from the visual editor, staying in it and showing the success banner', async () => {
      mockUpdateHotsiteConfig.mockResolvedValue({ ...INITIAL });
      mockPublishHotsite.mockResolvedValue({ isPublished: true });
      const user = userEvent.setup();
      renderVisualEditor();

      await user.click(visualCommand('publish'));

      await waitFor(() => {
        expect(screen.getByTestId('hotsite-action-success-banner')).toBeInTheDocument();
      });
      expect(mockUpdateHotsiteConfig).toHaveBeenCalledTimes(1);
      expect(mockPublishHotsite).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('visual-editor')).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('stays in the visual editor and shows the error banner when publishing fails', async () => {
      mockUpdateHotsiteConfig.mockRejectedValue(
        new ApiError(422, 'Invalid', { code: 'PLATFORM_HOTSITE_NO_ENABLED_MODULES' }),
      );
      const user = userEvent.setup();
      renderVisualEditor();

      await user.click(visualCommand('publish'));

      await waitFor(() => {
        expect(screen.getByTestId('hotsite-action-error-banner')).toBeInTheDocument();
      });
      expect(mockPublishHotsite).not.toHaveBeenCalled();
      expect(screen.getByTestId('visual-editor')).toBeInTheDocument();
    });
  });

  describe('Visual editor — Organize modules and the module inspector', () => {
    type User = ReturnType<typeof userEvent.setup>;

    async function openModule(user: User, type: string): Promise<void> {
      const configure = screen
        .getAllByTestId('layout-row-configure')
        .find((el) => el.dataset.moduleType === type);
      await user.click(configure!);
    }

    async function openContactAndEdit(user: User): Promise<void> {
      await openModule(user, 'CONTACT');
      await user.click(await screen.findByTestId('contact-show-address'));
    }

    it('lists every module in the draft order in the inspector, with no module open', () => {
      renderVisualEditor();

      const structure = screen.getByTestId('visual-structure');
      expect(structure).toBeInTheDocument();
      expect(screen.getAllByTestId('layout-row').map((row) => row.dataset.moduleType)).toEqual(
        expect.arrayContaining(['HERO', 'CONTACT', 'FOOTER']),
      );
      expect(visualCommand('structure')).toBeEnabled();
    });

    it('opens the real panel of a module from its Configure button, without a request or a screen change', async () => {
      const user = userEvent.setup();
      renderVisualEditor();

      await openModule(user, 'CONTACT');

      expect(await screen.findByTestId('contact-show-address')).toBeInTheDocument();
      expect(screen.getByTestId('visual-preview')).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('disables Publish with the hint while a module has unapplied edits, and re-enables it after Apply', async () => {
      const user = userEvent.setup();
      renderVisualEditor();
      expect(visualCommand('publish')).toBeEnabled();

      await openContactAndEdit(user);

      expect(visualCommand('publish')).toBeDisabled();
      expect(screen.getByTestId('visual-publish-mobile')).toBeDisabled();
      expect(screen.getByTestId('visual-publish-hint')).toHaveTextContent(
        'Aplique ou cancele primeiro',
      );

      await user.click(screen.getByTestId('visual-inspector-apply'));

      expect(visualCommand('publish')).toBeEnabled();
      expect(screen.queryByTestId('visual-publish-hint')).not.toBeInTheDocument();
    });

    it('Apply commits the edit into the shared draft and returns to the structure list', async () => {
      const user = userEvent.setup();
      renderVisualEditor();
      await openModule(user, 'CONTACT');
      const showAddress = await screen.findByTestId('contact-show-address');
      const before = showAddress.getAttribute('aria-checked');

      await user.click(showAddress);
      await user.click(screen.getByTestId('visual-inspector-apply'));

      expect(screen.getByTestId('visual-structure')).toBeInTheDocument();
      await openModule(user, 'CONTACT');
      expect(
        (await screen.findByTestId('contact-show-address')).getAttribute('aria-checked'),
      ).not.toBe(before);
    });

    it('publishes the applied edit, never the unapplied buffer', async () => {
      mockUpdateHotsiteConfig.mockResolvedValue({ ...INITIAL });
      mockPublishHotsite.mockResolvedValue({ isPublished: true });
      const user = userEvent.setup();
      renderVisualEditor();
      await openModule(user, 'CONTACT');
      const showAddress = await screen.findByTestId('contact-show-address');
      const initial = showAddress.getAttribute('aria-checked') === 'true';
      await user.click(showAddress);
      await user.click(screen.getByTestId('visual-inspector-apply'));

      await user.click(visualCommand('publish'));

      await waitFor(() => expect(mockUpdateHotsiteConfig).toHaveBeenCalledTimes(1));
      const contact = mockUpdateHotsiteConfig.mock.calls[0]![0].layout?.find(
        (module) => module.type === 'CONTACT',
      );
      expect((contact?.data as { showAddress?: boolean }).showAddress).toBe(!initial);
    });

    it('Cancel on a clean buffer returns to the structure list without asking', async () => {
      const user = userEvent.setup();
      renderVisualEditor();
      await openModule(user, 'CONTACT');
      await screen.findByTestId('contact-show-address');

      await user.click(screen.getByTestId('visual-inspector-cancel'));

      expect(screen.getByTestId('visual-structure')).toBeInTheDocument();
      expect(screen.queryByTestId('visual-module-discard-confirm')).not.toBeInTheDocument();
    });

    it('Cancel on a dirty buffer asks first, and Keep editing leaves the buffer and Publish blocked', async () => {
      const user = userEvent.setup();
      renderVisualEditor();
      await openContactAndEdit(user);

      await user.click(screen.getByTestId('visual-inspector-cancel'));
      expect(screen.getByTestId('visual-module-discard-confirm')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Continuar editando' }));

      expect(screen.getByTestId('contact-show-address')).toBeInTheDocument();
      expect(visualCommand('publish')).toBeDisabled();
    });

    it('Cancel then Discard drops the edits and leaves the shared draft as it was', async () => {
      const user = userEvent.setup();
      renderVisualEditor();
      await openModule(user, 'CONTACT');
      const showAddress = await screen.findByTestId('contact-show-address');
      const before = showAddress.getAttribute('aria-checked');
      await user.click(showAddress);

      await user.click(screen.getByTestId('visual-inspector-cancel'));
      await user.click(screen.getByTestId('visual-module-discard-confirm'));

      expect(screen.getByTestId('visual-structure')).toBeInTheDocument();
      await openModule(user, 'CONTACT');
      expect((await screen.findByTestId('contact-show-address')).getAttribute('aria-checked')).toBe(
        before,
      );
      expect(visualCommand('publish')).toBeEnabled();
    });

    it('never switches to another preview section from a dirty buffer without the decision', async () => {
      const user = userEvent.setup();
      renderVisualEditor({
        ...INITIAL,
        layout: [
          {
            type: 'HERO',
            enabled: true,
            data: {
              variant: 'centered',
              title: 'Seu carro',
              ctaLabel: 'Agendar',
              ctaTarget: 'booking-form',
            },
          },
        ],
      });
      await openContactAndEdit(user);

      const heroSelect = (await screen.findAllByTestId('preview-section-select')).find(
        (el) => el.dataset.moduleType === 'HERO',
      );
      await user.click(heroSelect!);

      expect(screen.getByTestId('visual-module-discard-confirm')).toBeInTheDocument();
      expect(screen.getByTestId('contact-show-address')).toBeInTheDocument();

      await user.click(screen.getByTestId('visual-module-discard-confirm'));
      expect(await screen.findByLabelText('Título *')).toBeInTheDocument();
      expect(screen.queryByTestId('contact-show-address')).not.toBeInTheDocument();
    });

    it('never enters the detailed editor from a dirty buffer without the decision', async () => {
      const user = userEvent.setup();
      renderVisualEditor();
      await openContactAndEdit(user);

      await user.click(visualCommand('detail'));

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(screen.getByTestId('visual-module-discard-confirm')).toBeInTheDocument();

      await user.click(screen.getByTestId('visual-module-discard-confirm'));
      expect(screen.getByRole('tablist')).toBeInTheDocument();
    });

    it('leaves a clean module open through the detailed round trip and reloads it from the draft', async () => {
      const user = userEvent.setup();
      renderEditorWithTopbarProbe();
      await openModule(user, 'CONTACT');
      await screen.findByTestId('contact-show-address');

      await user.click(visualCommand('detail'));
      await user.click(screen.getByTestId('probe-trigger-back'));

      expect(await screen.findByTestId('contact-show-address')).toBeInTheDocument();
      expect(visualCommand('publish')).toBeEnabled();
    });

    it('configures a disabled module, noting it is not in the preview', async () => {
      const user = userEvent.setup();
      renderVisualEditor();

      await openModule(user, 'CONTACT');

      expect(await screen.findByTestId('contact-show-address')).toBeInTheDocument();
      expect(screen.getByTestId('visual-inspector-disabled-note')).toBeInTheDocument();
    });

    it('shows no disabled note once the module is switched on from the list', async () => {
      const user = userEvent.setup();
      renderVisualEditor();
      await user.click(screen.getByTestId('layout-row-toggle-CONTACT'));

      await openModule(user, 'CONTACT');

      expect(await screen.findByTestId('contact-show-address')).toBeInTheDocument();
      expect(screen.queryByTestId('visual-inspector-disabled-note')).not.toBeInTheDocument();
    });

    it('LEAD_FORM Apply keeps audienceMode/questions out of layout[].data in the published payload', async () => {
      mockUpdateHotsiteConfig.mockResolvedValue({ ...INITIAL });
      mockPublishHotsite.mockResolvedValue({ isPublished: true });
      const user = userEvent.setup();
      renderVisualEditor();
      await openModule(user, 'LEAD_FORM');
      await screen.findByTestId('lead-form-config-panel');
      await user.click(
        screen
          .getAllByTestId('lead-form-audience-mode')
          .find((option) => option.dataset.value === 'CUSTOMER_ONLY')!,
      );
      await user.click(screen.getByTestId('visual-inspector-apply'));

      await user.click(visualCommand('publish'));

      await waitFor(() => expect(mockUpdateHotsiteConfig).toHaveBeenCalledTimes(1));
      const leadForm = mockUpdateHotsiteConfig.mock.calls[0]![0].layout?.find(
        (module) => module.type === 'LEAD_FORM',
      );
      expect(leadForm?.data).not.toHaveProperty('audienceMode');
      expect(leadForm?.data).not.toHaveProperty('questions');
    });

    it('an untouched LEAD_FORM is not dirty: Publish stays enabled and another section opens without a prompt', async () => {
      const user = userEvent.setup();
      renderVisualEditor({
        ...INITIAL,
        layout: [
          {
            type: 'HERO',
            enabled: true,
            data: {
              variant: 'centered',
              title: 'Seu carro',
              ctaLabel: 'Agendar',
              ctaTarget: 'booking-form',
            },
          },
        ],
      });
      await openModule(user, 'LEAD_FORM');
      await screen.findByTestId('lead-form-config-panel');

      expect(visualCommand('publish')).toBeEnabled();
      const heroSelect = (await screen.findAllByTestId('preview-section-select')).find(
        (el) => el.dataset.moduleType === 'HERO',
      );
      await user.click(heroSelect!);

      expect(screen.queryByTestId('visual-module-discard-confirm')).not.toBeInTheDocument();
      expect(await screen.findByLabelText('Título *')).toBeInTheDocument();
    });

    it('an invalid LEAD_FORM question blocks Apply and keeps the module open', async () => {
      const user = userEvent.setup();
      renderVisualEditor();
      await openModule(user, 'LEAD_FORM');
      await screen.findByTestId('lead-form-config-panel');
      await user.click(screen.getByRole('button', { name: '+ Adicionar pergunta' }));

      await user.click(screen.getByTestId('visual-inspector-apply'));

      expect(screen.getByTestId('lead-form-config-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('visual-structure')).not.toBeInTheDocument();
    });
  });

  describe('Visual editor — Branding and style and Sharing contexts', () => {
    type User = ReturnType<typeof userEvent.setup>;

    const HERO_ONLY: HotsiteAdminContentResponse = {
      ...INITIAL,
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
    };

    async function setPrimaryColor(user: User, value: string): Promise<void> {
      const input = screen.getByTestId('hotsite-primary-color');
      await user.clear(input);
      await user.type(input, value);
    }

    it('opens the real Branding fields in the inspector, with the page preview still showing', async () => {
      const user = userEvent.setup();
      renderVisualEditor();

      await user.click(visualCommand('branding'));

      expect(
        within(screen.getByTestId('visual-inspector')).getByTestId('hotsite-primary-color'),
      ).toHaveValue('#2563eb');
      expect(visualCommand('branding')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('visual-preview-status')).toBeInTheDocument();
    });

    it('applies a branding edit to the draft preview immediately', async () => {
      const user = userEvent.setup();
      renderVisualEditor(HERO_ONLY);
      await user.click(visualCommand('branding'));

      await setPrimaryColor(user, '#ff0000');

      const content = await screen.findByTestId('hotsite-preview-content');
      expect(content.style.getPropertyValue('--ba-primary')).toBe('#ff0000');
    });

    it('opens the real SEO fields and the sharing simulation, replacing the page preview', async () => {
      const user = userEvent.setup();
      renderVisualEditor();

      await user.click(visualCommand('sharing'));

      expect(
        within(screen.getByTestId('visual-inspector')).getByTestId('hotsite-seo-title'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('visual-sharing-preview')).toBeInTheDocument();
      expect(screen.queryByTestId('visual-preview-status')).not.toBeInTheDocument();
    });

    it('updates both sharing cards as the title is typed, and shows the tenant-language defaults while unset', async () => {
      const user = userEvent.setup();
      renderVisualEditor();
      await user.click(visualCommand('sharing'));

      expect(await screen.findByTestId('visual-sharing-google-title')).toHaveTextContent(
        'Tenant A — Agendamento Online',
      );

      await user.type(screen.getByTestId('hotsite-seo-title'), 'Meu título');

      expect(screen.getByTestId('visual-sharing-google-title')).toHaveTextContent('Meu título');
      expect(screen.getByTestId('visual-sharing-whatsapp-title')).toHaveTextContent('Meu título');
    });

    it('keeps the unsaved draft across Branding, Sharing, Organize modules and back', async () => {
      const user = userEvent.setup();
      renderVisualEditor();
      await user.click(visualCommand('branding'));
      await setPrimaryColor(user, '#ff0000');
      await user.click(visualCommand('sharing'));
      await user.type(screen.getByTestId('hotsite-seo-title'), 'Meu título');

      await user.click(visualCommand('structure'));
      await user.click(visualCommand('branding'));
      expect(screen.getByTestId('hotsite-primary-color')).toHaveValue('#ff0000');

      await user.click(visualCommand('sharing'));
      expect(screen.getByTestId('hotsite-seo-title')).toHaveValue('Meu título');
    });

    it('saves the branding and SEO edits when publishing from the visual editor', async () => {
      const user = userEvent.setup();
      mockUpdateHotsiteConfig.mockResolvedValue({ ...INITIAL, isPublished: false });
      mockPublishHotsite.mockResolvedValue({ isPublished: true });
      renderVisualEditor();
      await user.click(visualCommand('branding'));
      await setPrimaryColor(user, '#ff0000');
      await user.click(visualCommand('sharing'));
      await user.type(screen.getByTestId('hotsite-seo-title'), 'Meu título');

      await user.click(visualCommand('publish'));

      await waitFor(() => expect(mockUpdateHotsiteConfig).toHaveBeenCalledTimes(1));
      const saved = mockUpdateHotsiteConfig.mock.calls[0][0];
      expect(saved.branding?.primaryColor).toBe('#ff0000');
      expect(saved.seo?.title).toBe('Meu título');
    });

    // Full default ruleset, including colour contrast: these are dashboard components, not the
    // hotsite canvas.
    it.each(['branding', 'sharing'] as const)(
      'has no axe violations in the %s context',
      async (command) => {
        const user = userEvent.setup();
        const { container } = renderVisualEditor();
        await user.click(visualCommand(command));
        if (command === 'sharing') {
          await waitFor(() =>
            expect(screen.getByTestId('visual-sharing-google-title')).toHaveTextContent('Tenant A'),
          );
        } else {
          await screen.findByTestId('hotsite-primary-color');
        }

        expect(await axe(container)).toHaveNoViolations();
      },
    );

    it.each(['branding', 'sharing'] as const)(
      'never switches to %s from a dirty module buffer without the Apply-or-discard decision',
      async (command) => {
        const user = userEvent.setup();
        renderVisualEditor();
        const configure = screen
          .getAllByTestId('layout-row-configure')
          .find((el) => el.dataset.moduleType === 'CONTACT');
        await user.click(configure!);
        await user.click(await screen.findByTestId('contact-show-address'));

        await user.click(visualCommand(command));

        expect(screen.getByTestId('visual-module-discard-confirm')).toBeInTheDocument();
        expect(screen.getByTestId('contact-show-address')).toBeInTheDocument();
        expect(screen.queryByTestId('visual-sharing-preview')).not.toBeInTheDocument();
        expect(screen.queryByTestId('hotsite-primary-color')).not.toBeInTheDocument();

        await user.click(screen.getByTestId('visual-module-discard-confirm'));

        expect(visualCommand(command)).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByTestId('contact-show-address')).not.toBeInTheDocument();
      },
    );
  });

  describe('Preview view swap', () => {
    it('opens the preview view without changing the URL, and pushes a topbar back override', async () => {
      const user = userEvent.setup();
      renderDetailedEditorWithTopbarProbe();

      await user.click(screen.getByTestId('hotsite-preview-desktop'));

      expect(screen.getByTestId('probe-onback')).toHaveTextContent('set');
      expect(screen.getByTestId('probe-page-title')).toHaveTextContent('Preview');
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });

    it('returns to the tabs view via the topbar back override, clearing it', async () => {
      const user = userEvent.setup();
      renderDetailedEditorWithTopbarProbe();

      await user.click(screen.getByTestId('hotsite-preview-desktop'));
      await waitFor(() => expect(screen.getByTestId('probe-onback')).toHaveTextContent('set'));

      await user.click(screen.getByTestId('probe-trigger-back'));

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      // Back on the detailed tabs the topbar offers the way back to the visual editor instead.
      expect(screen.getByTestId('probe-page-title')).toHaveTextContent('Edição detalhada');
    });
  });

  describe('Publish flow', () => {
    it('strips resolved image URLs, saves the draft, publishes, and shows the success banner on the tabs view', async () => {
      mockUpdateHotsiteConfig.mockResolvedValue({ ...INITIAL });
      mockPublishHotsite.mockResolvedValue({ isPublished: true });
      const user = userEvent.setup();
      renderDetailedEditor();

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
      renderDetailedEditor();

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
    // tmp/ object no longer exists (see docs/API_CONTRACTS.md).
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
      renderDetailedEditor(draftWithTmpHero);

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
      renderDetailedEditor();

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
      renderDetailedEditor();

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
      renderDetailedEditor();

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
      renderDetailedEditor();

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
      renderDetailedEditor();

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
      renderDetailedEditor();

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
      renderDetailedEditor();

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
      renderDetailedEditor();

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
      renderDetailedEditor();

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
      renderDetailedEditor();

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
      renderDetailedEditor();

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
      renderDetailedEditorWithTopbarProbe();

      expect(screen.getByTestId('probe-page-title')).toHaveTextContent('Edição detalhada');

      await user.click(screen.getByRole('tab', { name: 'Layout' }));
      await user.click(
        screen
          .getAllByTestId('layout-row-configure')
          .find((el) => el.dataset.moduleType === 'HERO')!,
      );

      expect(screen.getByTestId('probe-onback')).toHaveTextContent('set');
      expect(screen.getByTestId('probe-page-title')).toHaveTextContent('Configurar: Hero');

      await user.click(screen.getByTestId('module-config-cancel-desktop'));

      expect(screen.getByTestId('probe-page-title')).toHaveTextContent('Edição detalhada');
    });

    it('opens every one of the other 7 module panels (each lazy-loaded via next/dynamic)', async () => {
      const user = userEvent.setup();
      renderDetailedEditor();

      await user.click(screen.getByRole('tab', { name: 'Layout' }));

      const panels: ReadonlyArray<{ type: string; testId: string }> = [
        { type: 'SERVICE_LIST', testId: 'service-list-show-prices' },
        { type: 'GALLERY', testId: 'gallery-open-picker' },
        { type: 'TESTIMONIALS', testId: 'testimonials-add' },
        // PillSelect (TD37-S23, Codex review PR #450) now shares one static data-testid per
        // group (disambiguated by a separate data-value attribute) — this smoke check only
        // needs to confirm the panel rendered something identifiable, not which option.
        { type: 'BOOKING_CTA', testId: 'booking-cta-variant' },
        { type: 'ABOUT', testId: 'about-image-position' },
        { type: 'CONTACT', testId: 'contact-show-address' },
        { type: 'FOOTER', testId: 'footer-show-whatsapp' },
      ];

      for (const panel of panels) {
        await user.click(
          screen
            .getAllByTestId('layout-row-configure')
            .find((el) => el.dataset.moduleType === panel.type)!,
        );
        // findAllByTestId (not findByTestId) — a PillSelect group's options now share one static
        // data-testid, so more than one match is expected for those two entries above.
        expect((await screen.findAllByTestId(panel.testId)).length).toBeGreaterThan(0);
        await user.click(screen.getByTestId('module-config-cancel-desktop'));
        expect(await screen.findByRole('tablist')).toBeInTheDocument();
      }
    });

    it('editing a Branding field through HotsiteEditor updates the draft (setBranding)', async () => {
      const user = userEvent.setup();
      renderDetailedEditor();

      const primaryColorInput = screen.getByTestId('hotsite-primary-color');
      await user.clear(primaryColorInput);
      await user.type(primaryColorInput, '#ff0000');

      expect(primaryColorInput).toHaveValue('#ff0000');
    });

    it("toggling a module through HotsiteEditor's Layout tab updates the draft (setLayout)", async () => {
      const user = userEvent.setup();
      renderDetailedEditor();

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
      renderDetailedEditor(draftWithHeroEnabled);

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
      renderDetailedEditorWithTopbarProbe();

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
      renderDetailedEditor();

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
      renderDetailedEditor();

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
      renderDetailedEditor();

      await openHeroConfig(user);
      await user.click(screen.getByTestId('module-config-cancel-desktop'));

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.queryByTestId('module-config-discard-confirm')).not.toBeInTheDocument();
    });

    it('Cancelar after an edit opens the dialog; confirming discards and returns to tabs', async () => {
      const user = userEvent.setup();
      renderDetailedEditor();

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
      renderDetailedEditor();

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
      renderDetailedEditorWithTopbarProbe();

      await openHeroConfig(user);
      await user.type(screen.getByLabelText('Título *'), 'Editado via topbar');

      await user.click(screen.getByTestId('probe-trigger-back'));

      expect(screen.getByTestId('module-config-discard-confirm')).toBeInTheDocument();
    });
  });

  describe('"Visitar site" link', () => {
    it('renders on the tabs view only, linking to the public hotsite in a new tab', async () => {
      const user = userEvent.setup();
      renderDetailedEditor();

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
