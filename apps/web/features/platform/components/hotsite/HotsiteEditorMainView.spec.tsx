// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { HotsiteEditorMainView } from './HotsiteEditorMainView';

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
