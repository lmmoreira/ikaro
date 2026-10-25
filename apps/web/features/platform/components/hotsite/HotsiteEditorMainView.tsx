'use client';

import { useTranslations } from 'next-intl';
import type {
  HotsiteAdminContentResponse,
  HotsiteBrandingResponse,
  HotsiteModuleType,
  HotsiteSeoResponse,
} from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { MOBILE_ACTION_BAR_CLEARANCE_CLASS } from '@/shells/dashboard/utils/mobile-action-bar';
import { BrandingTab } from '@/features/platform/components/hotsite/BrandingTab';
import { LayoutTab } from '@/features/platform/components/hotsite/LayoutTab';
import { SeoTab } from '@/features/platform/components/hotsite/SeoTab';
import { ManifestTab } from '@/features/platform/components/hotsite/ManifestTab';
import { HotsiteTemplateGallery } from '@/features/platform/components/hotsite/HotsiteTemplateGallery';
import type { HotsiteTemplatesController } from '@/features/platform/components/hotsite/useHotsiteTemplateApplication';
import {
  HotsiteActionBanner,
  type ActionBanner,
} from '@/features/platform/components/hotsite/HotsiteActionBanner';
import type { ManifestDraft } from '@/features/platform/hotsite/manifest-schema';

export type { ActionBanner };

export type EditorTab = 'templates' | 'branding' | 'layout' | 'seo' | 'manifest';

// 'manifest' stays last — it's the raw-JSON escape hatch for the other tabs combined, not a
// peer content section.
const TABS: readonly EditorTab[] = ['templates', 'branding', 'layout', 'seo', 'manifest'];

interface HotsiteEditorMainViewProps {
  readonly draft: HotsiteAdminContentResponse;
  readonly activeTab: EditorTab;
  readonly onActiveTabChange: (tab: EditorTab) => void;
  readonly actionBanner: ActionBanner | null;
  readonly tenantSlug: string;
  readonly isPublishing: boolean;
  readonly isUnpublishing: boolean;
  readonly templates: HotsiteTemplatesController;
  readonly onBrandingChange: (branding: HotsiteBrandingResponse) => void;
  readonly onLayoutChange: (layout: HotsiteAdminContentResponse['layout']) => void;
  readonly onSeoChange: (seo: HotsiteSeoResponse) => void;
  readonly onManifestApply: (next: ManifestDraft) => void;
  readonly onConfigureModule: (type: HotsiteModuleType) => void;
  readonly onUnpublish: () => void;
  readonly onPublish: () => void;
  readonly onOpenPreview: () => void;
}

// Extracted from HotsiteEditor (TD37-S5A) — the tabs/banners/aside/mobile-bar default view is a
// fully self-contained view, unrelated to the module-config and preview view-swap branches.
export function HotsiteEditorMainView({
  draft,
  activeTab,
  onActiveTabChange,
  actionBanner,
  tenantSlug,
  isPublishing,
  isUnpublishing,
  templates,
  onBrandingChange,
  onLayoutChange,
  onSeoChange,
  onManifestApply,
  onConfigureModule,
  onUnpublish,
  onPublish,
  onOpenPreview,
}: HotsiteEditorMainViewProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage');

  return (
    <div className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <HotsiteActionBanner banner={actionBanner} tenantSlug={tenantSlug} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-4 lg:space-y-6">
          <div className="flex gap-1 border-b border-gray-200" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`hotsite-tab-${tab}`}
                aria-controls={`hotsite-tabpanel-${tab}`}
                data-testid="hotsite-tab"
                data-tab={tab}
                aria-selected={activeTab === tab}
                onClick={() => onActiveTabChange(tab)}
                className={`rounded-t-md px-4 py-2.5 text-sm font-semibold transition-colors ${
                  activeTab === tab
                    ? '-mb-px border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {t(`tabs.${tab}`)}
              </button>
            ))}
          </div>

          {activeTab === 'templates' && (
            <div
              role="tabpanel"
              id="hotsite-tabpanel-templates"
              aria-labelledby="hotsite-tab-templates"
            >
              <HotsiteTemplateGallery controller={templates} />
            </div>
          )}
          {activeTab === 'branding' && (
            <div
              role="tabpanel"
              id="hotsite-tabpanel-branding"
              aria-labelledby="hotsite-tab-branding"
            >
              <BrandingTab value={draft.branding} onChange={onBrandingChange} />
            </div>
          )}
          {activeTab === 'layout' && (
            <div role="tabpanel" id="hotsite-tabpanel-layout" aria-labelledby="hotsite-tab-layout">
              <LayoutTab
                layout={draft.layout}
                onChange={onLayoutChange}
                onConfigure={onConfigureModule}
              />
            </div>
          )}
          {activeTab === 'seo' && (
            <div role="tabpanel" id="hotsite-tabpanel-seo" aria-labelledby="hotsite-tab-seo">
              <SeoTab value={draft.seo} onChange={onSeoChange} />
            </div>
          )}
          {activeTab === 'manifest' && (
            <div
              role="tabpanel"
              id="hotsite-tabpanel-manifest"
              aria-labelledby="hotsite-tab-manifest"
            >
              <ManifestTab
                value={{ branding: draft.branding, layout: draft.layout, seo: draft.seo }}
                onApply={onManifestApply}
              />
            </div>
          )}

          <div className="rounded-md border-2 border-dashed border-red-200 p-4">
            <p className="mb-2 text-sm font-bold text-red-800">{t('dangerZoneTitle')}</p>
            <Button
              type="button"
              variant="destructive"
              disabled={isUnpublishing}
              onClick={onUnpublish}
              data-testid="hotsite-unpublish-button"
            >
              {t('unpublish')}
            </Button>
          </div>
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <Button
                type="button"
                disabled={isPublishing}
                onClick={onPublish}
                className="w-full"
                data-testid="hotsite-publish-desktop"
              >
                {t('publish')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onOpenPreview}
                className="w-full"
                data-testid="hotsite-preview-desktop"
              >
                {t('preview')}
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full"
                data-testid="hotsite-view-live-site-desktop"
              >
                <a href={`/${tenantSlug}`} target="_blank" rel="noopener noreferrer">
                  {t('viewLiveSite')}
                </a>
              </Button>
              <hr className="border-t border-gray-200" />
              <p className="text-sm leading-6 text-gray-500">{t('unpublishedHint')}</p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div
        className={`fixed inset-x-0 ${MOBILE_ACTION_BAR_CLEARANCE_CLASS} z-20 flex gap-3 border-t border-gray-200 bg-white p-4 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden`}
      >
        <Button
          asChild
          variant="outline"
          className="flex-1"
          data-testid="hotsite-view-live-site-mobile"
        >
          <a href={`/${tenantSlug}`} target="_blank" rel="noopener noreferrer">
            {t('viewLiveSite')}
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onOpenPreview}
          className="flex-1"
          data-testid="hotsite-preview-mobile"
        >
          {t('preview')}
        </Button>
        <Button
          type="button"
          disabled={isPublishing}
          onClick={onPublish}
          className="flex-1"
          data-testid="hotsite-publish-mobile"
        >
          {t('publish')}
        </Button>
      </div>
    </div>
  );
}
