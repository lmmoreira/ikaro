'use client';

import { useTranslations } from 'next-intl';

export type ActionBanner = {
  readonly kind: 'publish' | 'unpublish';
  readonly status: 'success' | 'error';
  readonly message?: string;
};

interface HotsiteActionBannerProps {
  readonly banner: ActionBanner | null;
  readonly tenantSlug: string;
}

// The publish/unpublish result banner shared by the detailed (tabbed) editor and the visual
// editor, so both surfaces report an action the same way and keep the same test ids.
export function HotsiteActionBanner({
  banner,
  tenantSlug,
}: HotsiteActionBannerProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.hotsitePage');

  if (banner?.status === 'success') {
    return (
      <output
        data-testid="hotsite-action-success-banner"
        className="flex items-start gap-3.5 rounded-xl border border-green-300 bg-green-50 p-4"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
        >
          ✓
        </span>
        <span>
          <span className="block text-sm font-bold text-green-800">
            {t(banner.kind === 'publish' ? 'publishSuccessTitle' : 'unpublishSuccessTitle')}
          </span>
          <span className="mt-0.5 block text-sm text-green-700">
            {t(banner.kind === 'publish' ? 'publishSuccessBody' : 'unpublishSuccessBody', {
              slug: tenantSlug,
            })}
          </span>
        </span>
      </output>
    );
  }

  if (banner?.status === 'error') {
    return (
      <div
        role="alert"
        data-testid="hotsite-action-error-banner"
        className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-700"
      >
        {banner.message}
      </div>
    );
  }

  return null;
}
