'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteSeoResponse } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { resolveDraftImageUrl } from '@/features/platform/hotsite/resolve-draft-image-urls';
import { buildPublicHotsiteUrl } from '@/features/platform/hotsite/site-origin';
import { useSharingDefaults, useTmpSignedUrlMap } from './useHotsitePreviewData';

interface HotsiteSharingPreviewProps {
  readonly seo: HotsiteSeoResponse;
  readonly tenantSlug: string;
}

interface CopyProps {
  readonly value: string | null;
  readonly loadError: boolean;
}

// An unset field shows the public site's own fallback copy once it has loaded; until then (or if it
// cannot load) it says so instead of showing a made-up default.
function Copy({ value, loadError }: CopyProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.visual.sharing');
  if (value !== null) return <>{value}</>;
  return (
    <span className="italic text-gray-400">
      {loadError ? t('defaultsUnavailable') : t('loading')}
    </span>
  );
}

// The origin comes from a runtime env string nothing validates, so a malformed one must not take
// the whole Sharing context down: the card just shows the text as it is.
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// A simulation of how the hotsite may look in a Google result and as a WhatsApp link card. It is
// derived from the draft's SEO fields as the manager types and never writes anything back. Neither
// card promises what Google, WhatsApp or any other channel will really render.
export function HotsiteSharingPreview({
  seo,
  tenantSlug,
}: HotsiteSharingPreviewProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.visual.sharing');
  // The manifest is only needed for the fallback copy: with both fields set there is nothing to
  // fall back to, so switching back to Sharing then costs no request.
  const needsDefaults = seo.title === null || seo.description === null;
  const { defaults, loadError } = useSharingDefaults(tenantSlug, needsDefaults);
  const tmpSignedUrls = useTmpSignedUrlMap([seo.ogImageUrl]);
  const imageUrl = resolveDraftImageUrl(seo.ogImageUrl, tmpSignedUrls);
  const title = seo.title ?? defaults?.title ?? null;
  const description = seo.description ?? defaults?.description ?? null;
  const url = buildPublicHotsiteUrl(tenantSlug);
  const host = hostOf(url);

  return (
    <section aria-labelledby="hotsite-sharing-heading" data-testid="visual-sharing-preview">
      <h2 id="hotsite-sharing-heading" className="text-base font-semibold text-gray-900">
        {t('heading')}
      </h2>
      <p data-testid="visual-sharing-disclaimer" className="mt-1 mb-4 text-sm text-gray-500">
        {t('disclaimer')}
      </p>

      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-1 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('googleLabel')}
            </h3>
            <div data-testid="visual-sharing-google" className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-gray-600">{url}</p>
                <p
                  data-testid="visual-sharing-google-title"
                  className="text-lg leading-snug text-blue-700"
                >
                  <Copy value={title} loadError={loadError} />
                </p>
                <p
                  data-testid="visual-sharing-google-description"
                  className="text-sm text-gray-600"
                >
                  <Copy value={description} loadError={loadError} />
                </p>
              </div>
              {imageUrl && (
                // A result's optional thumbnail; with no sharing image set the result has none.
                /* eslint-disable-next-line @next/next/no-img-element -- may be a signed storage URL */
                <img
                  src={imageUrl}
                  alt={t('imageAlt')}
                  data-testid="visual-sharing-google-image"
                  className="h-16 w-24 shrink-0 rounded-md object-cover"
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('whatsappLabel')}
            </h3>
            <div
              data-testid="visual-sharing-whatsapp"
              className="max-w-sm overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
            >
              {imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- may be a signed storage URL */
                <img
                  src={imageUrl}
                  alt={t('imageAlt')}
                  data-testid="visual-sharing-image"
                  className="aspect-[1200/630] w-full object-cover"
                />
              ) : (
                <div
                  data-testid="visual-sharing-no-image"
                  className="flex aspect-[1200/630] w-full items-center justify-center bg-gray-200 px-4 text-center text-sm text-gray-500"
                >
                  {t('noImage')}
                </div>
              )}
              <div className="space-y-0.5 p-3">
                <p
                  data-testid="visual-sharing-whatsapp-title"
                  className="text-sm font-semibold text-gray-900"
                >
                  <Copy value={title} loadError={loadError} />
                </p>
                <p
                  data-testid="visual-sharing-whatsapp-description"
                  className="text-xs text-gray-600"
                >
                  <Copy value={description} loadError={loadError} />
                </p>
                <p className="text-xs text-gray-400">{host}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
