// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import {
  DashboardTopbarStatusProvider,
  useDashboardTopbarStatus,
} from '@/shells/dashboard/components/topbar-status-context';
import { HotsiteEditor } from './HotsiteEditor';

vi.mock('@/features/platform/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
  featureBookingPhoto: vi.fn(),
}));

vi.mock('@/features/booking/api/staff', () => ({
  listBookings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
  getBooking: vi.fn(),
}));

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
    </div>
  );
}

describe('HotsiteEditor', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('loads with 3 tabs, Branding active by default', () => {
    renderWithIntl(<HotsiteEditor initial={INITIAL} />);

    expect(screen.getByRole('tab', { name: 'Branding' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Layout' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'SEO' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('hotsite-primary-color')).toBeInTheDocument();
  });

  it('switches to Layout without triggering a network request, showing all 8 auto-materialized modules', async () => {
    const user = userEvent.setup();
    renderWithIntl(<HotsiteEditor initial={INITIAL} />);

    await user.click(screen.getByRole('tab', { name: 'Layout' }));

    expect(screen.getByRole('tab', { name: 'Layout' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('layout-tab-list')).toBeInTheDocument();
    expect(screen.getByTestId('layout-row-HERO')).toBeInTheDocument();
    expect(screen.getByTestId('layout-row-FOOTER')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('switches to SEO showing the coming-soon placeholder', async () => {
    const user = userEvent.setup();
    renderWithIntl(<HotsiteEditor initial={INITIAL} />);

    await user.click(screen.getByRole('tab', { name: 'SEO' }));

    expect(screen.getByTestId('hotsite-tab-placeholder')).toHaveAttribute('data-tab', 'seo');
  });

  it('renders Publicar alterações, Preview, and the unpublish action as disabled', () => {
    renderWithIntl(<HotsiteEditor initial={INITIAL} />);

    expect(screen.getByTestId('hotsite-publish-desktop')).toBeDisabled();
    expect(screen.getByTestId('hotsite-publish-mobile')).toBeDisabled();
    expect(screen.getByTestId('hotsite-preview-desktop')).toBeDisabled();
    expect(screen.getByTestId('hotsite-preview-mobile')).toBeDisabled();
    expect(screen.getByTestId('hotsite-unpublish-button')).toBeDisabled();
  });

  describe('"Configurar" view swap', () => {
    it('opens the module config shell for the clicked module, without changing the URL or making a network request', async () => {
      const user = userEvent.setup();
      renderWithIntl(<HotsiteEditor initial={INITIAL} />);

      await user.click(screen.getByRole('tab', { name: 'Layout' }));
      await user.click(screen.getByTestId('layout-row-configure-HERO'));

      expect(await screen.findByLabelText('Título *')).toBeInTheDocument();
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('"Aplicar" commits the edited field into the Layout tab\'s draft and returns to the tabs view', async () => {
      const user = userEvent.setup();
      renderWithIntl(<HotsiteEditor initial={INITIAL} />);

      await user.click(screen.getByRole('tab', { name: 'Layout' }));
      await user.click(screen.getByTestId('layout-row-configure-HERO'));
      const titleInput = await screen.findByLabelText('Título *');
      await user.clear(titleInput);
      await user.type(titleInput, 'Novo título');
      await user.click(screen.getByTestId('module-config-apply-desktop'));

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      await user.click(screen.getByTestId('layout-row-configure-HERO'));
      expect(await screen.findByDisplayValue('Novo título')).toBeInTheDocument();
    });

    it('"Cancelar" discards local edits and returns to the tabs view without mutating the draft', async () => {
      const user = userEvent.setup();
      renderWithIntl(<HotsiteEditor initial={INITIAL} />);

      await user.click(screen.getByRole('tab', { name: 'Layout' }));
      await user.click(screen.getByTestId('layout-row-configure-HERO'));
      const titleInput = await screen.findByLabelText('Título *');
      await user.type(titleInput, 'Descartado');
      await user.click(screen.getByTestId('module-config-cancel-desktop'));

      expect(screen.getByRole('tablist')).toBeInTheDocument();
      await user.click(screen.getByTestId('layout-row-configure-HERO'));
      expect(screen.queryByDisplayValue('Descartado')).not.toBeInTheDocument();
    });

    it('pushes an onBackOverride + page title into the shared dashboard Topbar context while configuring, and clears them on cancel', async () => {
      const user = userEvent.setup();
      renderWithIntl(
        <DashboardTopbarStatusProvider>
          <TopbarOverrideProbe />
          <HotsiteEditor initial={INITIAL} />
        </DashboardTopbarStatusProvider>,
      );

      expect(screen.getByTestId('probe-onback')).toHaveTextContent('none');

      await user.click(screen.getByRole('tab', { name: 'Layout' }));
      await user.click(screen.getByTestId('layout-row-configure-HERO'));

      expect(screen.getByTestId('probe-onback')).toHaveTextContent('set');
      expect(screen.getByTestId('probe-page-title')).toHaveTextContent('Configurar: Hero');

      await user.click(screen.getByTestId('module-config-cancel-desktop'));

      expect(screen.getByTestId('probe-onback')).toHaveTextContent('none');
      expect(screen.getByTestId('probe-page-title')).toHaveTextContent('none');
    });
  });
});
