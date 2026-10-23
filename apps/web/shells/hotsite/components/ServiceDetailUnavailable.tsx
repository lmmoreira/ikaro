import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { sectionHeadingFont } from '@/features/platform/hotsite/module-styles';

interface ServiceDetailUnavailableProps {
  readonly slug: string;
}

// UC-109 A1 — the page of a service that is unpublished, inactive, unknown, or whose slug was never
// issued. It says the same thing for all of them (nothing reveals which), inheriting the tenant's
// branding from app/[slug]/layout.tsx, and offers the way back to the services.
export function ServiceDetailUnavailable({
  slug,
}: ServiceDetailUnavailableProps): React.JSX.Element {
  const t = useTranslations('hotsite.serviceDetail');

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
    >
      <h1
        data-testid="service-detail-unavailable"
        className="mb-3 text-3xl font-bold"
        style={{ ...sectionHeadingFont, color: 'var(--ba-primary)' }}
      >
        {t('notFoundTitle')}
      </h1>
      <p className="mb-6 text-lg opacity-75">{t('notFoundBody')}</p>
      <Link
        href={`/${slug}#service-list`}
        className="border-2 px-6 py-2.5 font-semibold transition-all hover:opacity-90"
        style={{
          backgroundColor: 'var(--ba-btn-bg)',
          color: 'var(--ba-btn-text)',
          borderColor: 'var(--ba-btn-border)',
          borderRadius: 'var(--ba-radius)',
        }}
      >
        {t('notFoundCta')}
      </Link>
    </main>
  );
}
