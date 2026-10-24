// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { HotsiteEditorMainView } from './HotsiteEditorMainView';
import { makeTemplatesController } from './templates-controller.fixture';

vi.mock('@/features/platform/components/hotsite/BrandingTab', () => ({
  BrandingTab: () => <div data-testid="mock-branding-tab" />,
}));
vi.mock('@/features/platform/components/hotsite/LayoutTab', () => ({
  LayoutTab: () => <div data-testid="mock-layout-tab" />,
}));
vi.mock('@/features/platform/components/hotsite/SeoTab', () => ({
  SeoTab: () => <div data-testid="mock-seo-tab" />,
}));
vi.mock('@/features/platform/components/hotsite/ManifestTab', () => ({
  ManifestTab: () => <div data-testid="mock-manifest-tab" />,
}));

const DRAFT: HotsiteAdminContentResponse = {
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

function baseProps() {
  return {
    draft: DRAFT,
    activeTab: 'branding' as const,
    onActiveTabChange: vi.fn(),
    actionBanner: null,
    tenantSlug: 'tenant-a',
    isPublishing: false,
    isUnpublishing: false,
    templates: makeTemplatesController(),
    onBrandingChange: vi.fn(),
    onLayoutChange: vi.fn(),
    onSeoChange: vi.fn(),
    onManifestApply: vi.fn(),
    onConfigureModule: vi.fn(),
    onUnpublish: vi.fn(),
    onPublish: vi.fn(),
    onOpenPreview: vi.fn(),
  };
}

describe('HotsiteEditorMainView', () => {
  describe('Templates tab', () => {
    function tabOrder(): (string | undefined)[] {
      return screen.getAllByTestId('hotsite-tab').map((tab) => tab.dataset.tab);
    }

    it('is the first tab, and Manifest stays last', () => {
      renderWithIntl(<HotsiteEditorMainView {...baseProps()} />);

      expect(tabOrder()).toEqual(['templates', 'branding', 'layout', 'seo', 'manifest']);
    });

    it('renders the template gallery in its panel', () => {
      renderWithIntl(<HotsiteEditorMainView {...baseProps()} activeTab="templates" />);

      expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'hotsite-tabpanel-templates');
      expect(screen.getByTestId('template-gallery')).toBeInTheDocument();
      expect(screen.getAllByTestId('template-card')).toHaveLength(6);
      expect(screen.queryByTestId('mock-branding-tab')).not.toBeInTheDocument();
    });

    it('shows the same session state as the visual inspector: the applied card is selected', () => {
      renderWithIntl(
        <HotsiteEditorMainView
          {...baseProps()}
          activeTab="templates"
          templates={makeTemplatesController({ appliedTemplateId: 'origem' })}
        />,
      );

      const selected = screen
        .getAllByTestId('template-card')
        .filter((c) => c.dataset.selected === 'true');
      expect(selected.map((card) => card.dataset.templateId)).toEqual(['origem']);
    });

    it('switches to it through onActiveTabChange', async () => {
      const user = userEvent.setup();
      const props = baseProps();
      renderWithIntl(<HotsiteEditorMainView {...props} />);

      await user.click(
        screen.getAllByTestId('hotsite-tab').find((tab) => tab.dataset.tab === 'templates')!,
      );

      expect(props.onActiveTabChange).toHaveBeenCalledWith('templates');
    });
  });

  it('renders the active tab content and switches tabs via onActiveTabChange', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithIntl(<HotsiteEditorMainView {...props} />);

    expect(screen.getByTestId('mock-branding-tab')).toBeInTheDocument();
    const layoutTab = screen
      .getAllByTestId('hotsite-tab')
      .find((tab) => tab.dataset.tab === 'layout');
    await user.click(layoutTab!);
    expect(props.onActiveTabChange).toHaveBeenCalledWith('layout');
  });

  it('renders the success and error action banners', () => {
    const { rerender } = renderWithIntl(
      <HotsiteEditorMainView
        {...baseProps()}
        actionBanner={{ kind: 'publish', status: 'success' }}
      />,
    );
    expect(screen.getByTestId('hotsite-action-success-banner')).toBeInTheDocument();

    rerender(
      <HotsiteEditorMainView
        {...baseProps()}
        actionBanner={{ kind: 'publish', status: 'error', message: 'Falhou' }}
      />,
    );
    expect(screen.getByTestId('hotsite-action-error-banner')).toHaveTextContent('Falhou');
  });

  it('calls onPublish, onOpenPreview, and onUnpublish from their buttons', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithIntl(<HotsiteEditorMainView {...props} />);

    await user.click(screen.getByTestId('hotsite-publish-desktop'));
    expect(props.onPublish).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('hotsite-preview-desktop'));
    expect(props.onOpenPreview).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('hotsite-unpublish-button'));
    expect(props.onUnpublish).toHaveBeenCalledTimes(1);
  });
});
