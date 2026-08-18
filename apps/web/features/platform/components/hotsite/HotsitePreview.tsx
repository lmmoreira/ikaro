'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { useTenant } from '@/providers/tenant-provider';
import { applyBranding } from '@/features/platform/hotsite/apply-branding';
import { getActiveFontVariables } from '@/features/platform/hotsite/font-config';
import { buildHotsiteModuleRenderPlan } from '@/features/platform/hotsite/page-model';
import { resolveDraftImageUrls } from '@/features/platform/hotsite/resolve-draft-image-urls';
import { hotsiteImageBaseUrl } from '@/features/platform/hotsite/resolve-hotsite-image-url';
import { MOBILE_ACTION_BAR_CLEARANCE_CLASS } from '@/shells/dashboard/utils/mobile-action-bar';
import { usePreviewSupplementaryData, useTmpSignedUrls } from './useHotsitePreviewData';
import { renderHotsitePreviewModule } from './renderHotsitePreviewModule';

export interface HotsitePreviewProps {
  readonly draft: HotsiteAdminContentResponse;
  readonly onPublish: () => void;
  readonly isPublishing: boolean;
}

export function HotsitePreview({
  draft,
  onPublish,
  isPublishing,
}: HotsitePreviewProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.previewView');
  const { tenantSlug } = useTenant();
  // A field the admin just uploaded this session holds the raw storage path the upload flow
  // returned, not yet resolved to a public URL (resolution only happens server-side on the next
  // GET) — next/image's `src` requires an absolute URL, so resolve every image field before
  // rendering. Untouched fields already hold a resolved URL and pass through unchanged.
  const tmpSignedUrls = useTmpSignedUrls(draft.branding, draft.layout, draft.seo);
  const { branding, layout } = resolveDraftImageUrls(
    draft.branding,
    draft.layout,
    draft.seo,
    hotsiteImageBaseUrl(),
    tmpSignedUrls,
  );
  const alternateSectionBg = branding.alternateSectionBg ?? false;
  const modulesWithVariant = buildHotsiteModuleRenderPlan(layout, alternateSectionBg);
  const hasServiceList = modulesWithVariant.some(({ parsed }) => parsed.type === 'SERVICE_LIST');
  const { data, loadError } = usePreviewSupplementaryData(tenantSlug, hasServiceList);
  const tenantBrand = branding.brandName
    ? { name: branding.brandName, tagline: branding.brandTagline }
    : undefined;

  return (
    <div className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="overflow-hidden rounded-md border border-gray-200">
          {loadError && (
            <div
              role="alert"
              data-testid="hotsite-preview-load-error"
              className="p-4 text-sm text-red-700"
            >
              {t('loadError')}
            </div>
          )}
          {!data && !loadError && (
            <div
              data-testid="hotsite-preview-loading"
              className="p-8 text-center text-sm text-gray-500"
            >
              {t('loading')}
            </div>
          )}
          {data && (
            <div
              data-testid="hotsite-preview-content"
              style={{ ...applyBranding(branding), fontFamily: 'var(--ba-body-font)' }}
              className={getActiveFontVariables(
                branding.headingFontFamily,
                branding.bodyFontFamily,
              ).join(' ')}
            >
              {modulesWithVariant.map((moduleWithVariant, index) =>
                renderHotsitePreviewModule(moduleWithVariant, index, {
                  tenantSlug,
                  tenantBrand,
                  logoUrl: branding.logoUrl,
                  data,
                }),
              )}
            </div>
          )}
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <p className="text-sm leading-6 text-gray-500">{t('viewingDraftLabel')}</p>
              <Button
                type="button"
                className="w-full"
                onClick={onPublish}
                disabled={isPublishing}
                data-testid="hotsite-preview-publish-desktop"
              >
                {t('publishNow')}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div
        className={`fixed inset-x-0 ${MOBILE_ACTION_BAR_CLEARANCE_CLASS} z-20 flex gap-3 border-t border-gray-200 bg-white p-4 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden`}
      >
        <Button
          type="button"
          className="w-full"
          onClick={onPublish}
          disabled={isPublishing}
          data-testid="hotsite-preview-publish-mobile"
        >
          {t('publishNow')}
        </Button>
      </div>
    </div>
  );
}
