'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { LeadFormSubmissionListItem } from '@ikaro/types';
import { Card } from '@/shared/components/ui/card';
import { getInitials } from '@/shared/utils/initials';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface LeadFormSubmissionsListProps {
  readonly items: readonly LeadFormSubmissionListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

function buildPageHref(page: number): string {
  return page <= 1 ? '/dashboard/leads' : `/dashboard/leads?page=${page}`;
}

// page.tsx re-fetches server-side via URL navigation (Link href="?page=N") — no client-side
// pagination state needed.
export function LeadFormSubmissionsList({
  items,
  page,
  pageSize,
  total,
}: LeadFormSubmissionsListProps): React.JSX.Element {
  const t = useTranslations('dashboard.leadsPage');
  const { formatDate, formatTime } = useFormatting();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (total === 0) {
    return (
      <Card className="mx-auto max-w-md space-y-3 p-8 text-center">
        <p className="text-base font-bold text-gray-900">{t('emptyTitle')}</p>
        <p className="text-sm text-gray-500">{t('emptyBody')}</p>
        <Link
          href="/dashboard/hotsite"
          className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {t('emptyCta')}
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500" data-testid="leads-total-count">
        {t('totalCount', { count: total })}
      </p>

      <Card className="overflow-hidden">
        <div className="divide-y divide-border">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/dashboard/leads/${item.id}`}
              data-testid="lead-submission-row"
              data-submission-id={item.id}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50"
            >
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600"
              >
                {getInitials(item.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{item.name}</p>
                <p className="truncate text-sm text-gray-500">
                  {item.email} · {item.phone}
                </p>
              </div>
              <p className="shrink-0 text-xs text-gray-400">
                {formatDate(new Date(item.submittedAt))}, {formatTime(new Date(item.submittedAt))}
              </p>
            </Link>
          ))}
        </div>
      </Card>

      {totalPages > 1 && (
        <nav
          className="flex items-center justify-center gap-2"
          aria-label={t('paginationAriaLabel')}
        >
          <Link
            href={buildPageHref(page - 1)}
            aria-disabled={page <= 1}
            aria-label={t('previousPage')}
            className={
              page <= 1
                ? 'pointer-events-none rounded-md border px-3 py-1.5 text-sm opacity-40'
                : 'rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50'
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNumber) => (
            <Link
              key={pageNumber}
              href={buildPageHref(pageNumber)}
              aria-current={pageNumber === page ? 'page' : undefined}
              className={
                pageNumber === page
                  ? 'rounded-md border border-blue-600 bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white'
                  : 'rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50'
              }
            >
              {pageNumber}
            </Link>
          ))}
          <Link
            href={buildPageHref(page + 1)}
            aria-disabled={page >= totalPages}
            aria-label={t('nextPage')}
            className={
              page >= totalPages
                ? 'pointer-events-none rounded-md border px-3 py-1.5 text-sm opacity-40'
                : 'rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50'
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </nav>
      )}
    </div>
  );
}
