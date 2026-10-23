'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/shared/components/ui/section-card';
import { SwitchField } from '@/shared/components/ui/switch-field';

interface ServicePublicPageSwitchCardProps {
  readonly published: boolean;
  readonly onPublishedChange: (published: boolean) => void;
  // The address of the page as it is live right now (saved + published), or null while there is
  // none: the link opens the public page and is disabled until then, even if the switch has just
  // been turned on, so it never leads to a page that does not exist yet.
  readonly liveHref: string | null;
  readonly serviceActive: boolean;
}

// The publish switch of a service's public page, like the hotsite's: on, the service has its own
// page and its card on the site says "Ver detalhes"; off, the page does not exist for visitors and
// the card only says "Agendar". The content below stays editable either way.
export function ServicePublicPageSwitchCard({
  published,
  onPublishedChange,
  liveHref,
  serviceActive,
}: ServicePublicPageSwitchCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <SectionCard title={t('tabPaginaPublica')}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="public-page-chip"
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}
        >
          {published ? t('publicPageChipPublished') : t('publicPageChipUnpublished')}
        </span>
      </div>

      <SwitchField
        checked={published}
        onChange={onPublishedChange}
        label={t('publicPageSwitchTitle')}
        hint={published ? t('publicPageSwitchOn') : t('publicPageSwitchOff')}
        testId="public-page-switch"
      />

      {!serviceActive && (
        <p
          role="note"
          data-testid="public-page-inactive-note"
          className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          {t('publicPageInactiveNote')}
        </p>
      )}

      {liveHref ? (
        <a
          href={liveHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="public-page-view-link"
          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
        >
          {t('publicPageViewLink')} <span aria-hidden="true">↗</span>
          <span className="sr-only">{t('publicPageViewLinkNewTab')}</span>
        </a>
      ) : (
        <span
          aria-disabled="true"
          data-testid="public-page-view-link-disabled"
          className="inline-flex items-center gap-1 text-sm font-semibold text-gray-400"
        >
          {t('publicPageViewLink')} <span aria-hidden="true">↗</span>
        </span>
      )}
    </SectionCard>
  );
}
