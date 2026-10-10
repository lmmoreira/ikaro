'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface OccurrencePagerProps {
  readonly page: number;
  readonly totalPages: number;
  /** The URL of a given page of the same list. */
  readonly hrefForPage: (page: number) => string;
}

const LINK_CLASS =
  'rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-gray-50';
const OFF_CLASS =
  'rounded-lg border border-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-300';

/** "‹ Anterior · Página X de Y · Próxima ›" — plain links, so each page is one server render. */
export function OccurrencePager({
  page,
  totalPages,
  hrefForPage,
}: OccurrencePagerProps): React.JSX.Element | null {
  const t = useTranslations('customer.recurringSchedules');
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label={t('pagerLabel')}
      data-testid="occurrence-pager"
      className="flex items-center justify-between gap-3 py-3"
    >
      {page > 1 ? (
        <Link href={hrefForPage(page - 1)} data-testid="pager-previous" className={LINK_CLASS}>
          {t('pagerPrevious')}
        </Link>
      ) : (
        <span aria-disabled="true" data-testid="pager-previous" className={OFF_CLASS}>
          {t('pagerPrevious')}
        </span>
      )}
      <span className="text-xs text-gray-500">
        {t('pagerPosition', { page, pages: totalPages })}
      </span>
      {page < totalPages ? (
        <Link href={hrefForPage(page + 1)} data-testid="pager-next" className={LINK_CLASS}>
          {t('pagerNext')}
        </Link>
      ) : (
        <span aria-disabled="true" data-testid="pager-next" className={OFF_CLASS}>
          {t('pagerNext')}
        </span>
      )}
    </nav>
  );
}
