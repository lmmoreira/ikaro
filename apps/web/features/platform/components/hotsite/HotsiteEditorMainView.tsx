'use client';

import { useTranslations } from 'next-intl';
import type {
  HotsiteAdminContentResponse,
  HotsiteBrandingResponse,
  HotsiteModuleType,
  HotsiteSeoResponse,
} from '@ikaro/types';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { MOBILE_ACTION_BAR_CLEARANCE_CLASS } from '@/shells/dashboard/utils/mobile-action-bar';
import { BrandingTab } from '@/features/platform/components/hotsite/BrandingTab';
import { LayoutTab } from '@/features/platform/components/hotsite/LayoutTab';
import { SeoTab } from '@/features/platform/components/hotsite/SeoTab';
import { ManifestTab } from '@/features/platform/components/hotsite/ManifestTab';
import { HotsiteTemplateGalleryTab } from '@/features/platform/components/hotsite/HotsiteTemplateGallery';
import type { HotsiteTemplatesController } from '@/features/platform/components/hotsite/useHotsiteTemplateApplication';
import {
  useHotsiteActionFeedback,
  type ActionBanner,
} from '@/features/platform/components/hotsite/useHotsiteActionFeedback';
import type { ManifestDraft } from '@/features/platform/hotsite/manifest-schema';

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
  const feedback = useHotsiteActionFeedback(actionBanner, tenantSlug);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onActiveTabChange(value as EditorTab)}
      className="space-y-4 pb-28 lg:space-y-6 lg:pb-0"
    >
      <TabsList>
        {TABS.map((tab) => (
          <TabsTrigger key={tab} value={tab} data-testid="hotsite-tab" data-tab={tab}>
            {t(`tabs.${tab}`)}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-4 lg:space-y-6">
          <TabsContent value="templates">
            <HotsiteTemplateGalleryTab controller={templates} />
          </TabsContent>
          <TabsContent value="branding">
            <BrandingTab value={draft.branding} onChange={onBrandingChange} />
          </TabsContent>
          <TabsContent value="layout">
            <LayoutTab
              layout={draft.layout}
              onChange={onLayoutChange}
              onConfigure={onConfigureModule}
            />
          </TabsContent>
          <TabsContent value="seo">
            <SeoTab value={draft.seo} onChange={onSeoChange} />
          </TabsContent>
          <TabsContent value="manifest">
            <ManifestTab
              value={{ branding: draft.branding, layout: draft.layout, seo: draft.seo }}
              onApply={onManifestApply}
            />
          </TabsContent>

          <Card className="border-red-200">
            <CardContent className="space-y-3 p-5 lg:p-6">
              <p className="text-sm font-semibold text-red-800">{t('dangerZoneTitle')}</p>
              <Button
                type="button"
                variant="destructive"
                disabled={isUnpublishing}
                onClick={onUnpublish}
                data-testid="hotsite-unpublish-button"
              >
                {t('unpublish')}
              </Button>
            </CardContent>
          </Card>
        </div>

        <ActionPane
          feedback={feedback}
          mobileOffsetClassName={MOBILE_ACTION_BAR_CLEARANCE_CLASS}
          actions={
            <>
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
            </>
          }
          mobileActions={
            <div className="flex gap-3">
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
          }
        />
      </div>
    </Tabs>
  );
}
