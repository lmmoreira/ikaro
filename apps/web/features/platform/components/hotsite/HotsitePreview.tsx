'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  HotsiteAdminContentResponse,
  HotsiteBusinessInfoResponse,
  HotsiteServiceResponse,
} from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { useTenant } from '@/providers/tenant-provider';
import { fetchManifest } from '@/features/platform/api';
import { fetchServices } from '@/features/platform/hotsite/api/services';
import { applyBranding } from '@/features/platform/hotsite/apply-branding';
import { getActiveFontVariables } from '@/features/platform/hotsite/font-config';
import {
  buildHotsiteModuleRenderPlan,
  resolveHotsiteDisplayName,
} from '@/features/platform/hotsite/page-model';
import { HeroModule } from '@/shells/hotsite/components/HeroModule';
import { ServiceListModule } from '@/shells/hotsite/components/ServiceListModule';
import { GalleryModule } from '@/shells/hotsite/components/GalleryModule';
import { BookingCtaModule } from '@/shells/hotsite/components/BookingCtaModule';
import { TestimonialsModule } from '@/shells/hotsite/components/TestimonialsModule';
import { AboutModule } from '@/shells/hotsite/components/AboutModule';
import { ContactModule } from '@/shells/hotsite/components/ContactModule';
import { Footer } from '@/shells/hotsite/components/Footer';

interface HotsitePreviewProps {
  readonly draft: HotsiteAdminContentResponse;
  readonly onPublish: () => void;
  readonly isPublishing: boolean;
}

interface PreviewSupplementaryData {
  readonly business: HotsiteBusinessInfoResponse;
  readonly tenantName: string;
  readonly services: readonly HotsiteServiceResponse[];
}

// services/business/tenant name aren't part of the editable draft — they're read-only context
// sourced from the public manifest, fetched once when Preview opens (not on every draft edit).
function usePreviewSupplementaryData(
  tenantSlug: string,
  hasServiceList: boolean,
): { data: PreviewSupplementaryData | null; loadError: boolean } {
  const [data, setData] = useState<PreviewSupplementaryData | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const manifest = await fetchManifest(tenantSlug);
        const services = hasServiceList ? await fetchServices(tenantSlug) : [];
        if (cancelled) return;
        setData({
          business: manifest.business,
          tenantName: resolveHotsiteDisplayName({
            branding: manifest.branding,
            tenant: manifest.tenant,
          }),
          services,
        });
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, hasServiceList]);

  return { data, loadError };
}

export function HotsitePreview({
  draft,
  onPublish,
  isPublishing,
}: HotsitePreviewProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.previewView');
  const { tenantSlug } = useTenant();
  const alternateSectionBg = draft.branding.alternateSectionBg ?? false;
  const modulesWithVariant = buildHotsiteModuleRenderPlan(draft.layout, alternateSectionBg);
  const hasServiceList = modulesWithVariant.some(({ parsed }) => parsed.type === 'SERVICE_LIST');
  const { data, loadError } = usePreviewSupplementaryData(tenantSlug, hasServiceList);
  const tenantBrand = draft.branding.brandName
    ? { name: draft.branding.brandName, tagline: draft.branding.brandTagline }
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
              style={{ ...applyBranding(draft.branding), fontFamily: 'var(--ba-body-font)' }}
              className={getActiveFontVariables(
                draft.branding.headingFontFamily,
                draft.branding.bodyFontFamily,
              ).join(' ')}
            >
              {modulesWithVariant.map(({ parsed, bgVariant }, index) => {
                const key = `${parsed.type}-${index}`;

                if (parsed.type === 'HERO') {
                  return (
                    <HeroModule
                      key={key}
                      data={parsed.data}
                      slug={tenantSlug}
                      tenantBrand={tenantBrand}
                    />
                  );
                }
                if (parsed.type === 'SERVICE_LIST') {
                  return (
                    <ServiceListModule
                      key={key}
                      data={parsed.data}
                      slug={tenantSlug}
                      services={data.services}
                      bgVariant={bgVariant}
                    />
                  );
                }
                if (parsed.type === 'CONTACT') {
                  return (
                    <ContactModule
                      key={key}
                      data={parsed.data}
                      business={data.business}
                      slug={tenantSlug}
                      bgVariant={bgVariant}
                    />
                  );
                }
                if (parsed.type === 'BOOKING_CTA') {
                  return (
                    <BookingCtaModule
                      key={key}
                      data={parsed.data}
                      slug={tenantSlug}
                      tenantBrand={tenantBrand}
                    />
                  );
                }
                if (parsed.type === 'GALLERY') {
                  return (
                    <GalleryModule
                      key={key}
                      data={parsed.data}
                      slug={tenantSlug}
                      bgVariant={bgVariant}
                    />
                  );
                }
                if (parsed.type === 'TESTIMONIALS') {
                  return (
                    <TestimonialsModule
                      key={key}
                      data={parsed.data}
                      slug={tenantSlug}
                      bgVariant={bgVariant}
                    />
                  );
                }
                if (parsed.type === 'ABOUT') {
                  return (
                    <AboutModule
                      key={key}
                      data={parsed.data}
                      slug={tenantSlug}
                      bgVariant={bgVariant}
                    />
                  );
                }
                if (parsed.type === 'FOOTER') {
                  return (
                    <Footer
                      key={key}
                      data={parsed.data}
                      slug={tenantSlug}
                      tenantName={data.tenantName}
                      business={data.business}
                    />
                  );
                }
                return null;
              })}
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

      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
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
