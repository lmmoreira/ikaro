import Link from 'next/link';
import type { useTranslations } from 'next-intl';
import type { PaginatedLoyaltyEntriesResponse } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/utils/cn';
import { appendReturnTo } from '@/features/booking/model/booking-navigation';
import {
  EmptyState,
  EntryIcon,
  LoyaltyHistoryRow,
  formatShortDateLabel,
} from './LoyaltyHistoryHelpers';

export function CustomerLoyaltyEntriesTab({
  entries,
  locale,
  formatDateLong,
  isLoadingEntries,
  loadMoreEntries,
  loadMoreEntriesError,
  returnToHref,
  t,
}: {
  readonly entries: PaginatedLoyaltyEntriesResponse;
  readonly locale: string;
  readonly formatDateLong: (date: Date) => string;
  readonly isLoadingEntries: boolean;
  readonly loadMoreEntries: () => Promise<void>;
  readonly loadMoreEntriesError: string | null;
  readonly returnToHref: string;
  readonly t: ReturnType<typeof useTranslations>;
}): React.JSX.Element {
  if (entries.items.length === 0) {
    return (
      <EmptyState
        icon={
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        }
        title={t('entriesEmptyTitle')}
        body={t('entriesEmptyBody')}
      />
    );
  }

  return (
    <>
      <div>
        {entries.items.map((entry) => (
          <LoyaltyHistoryRow
            key={entry.id}
            icon={<EntryIcon expired={!entry.isActive} />}
            title={
              <p
                data-testid="loyalty-entry-service-name"
                className="truncate text-sm font-semibold text-gray-900"
              >
                {entry.serviceName}{' '}
                <span
                  className={cn(
                    'ml-2 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold',
                    entry.isActive
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-500',
                  )}
                >
                  {entry.isActive ? t('entryActiveBadge') : t('entryExpiredBadge')}
                </span>
              </p>
            }
            meta={
              <>
                {formatDateLong(new Date(entry.earnedAt))} ·{' '}
                {t('entryExpiryLine', {
                  expiresAt: formatShortDateLabel(entry.expiresAt, locale),
                })}
              </>
            }
            link={
              entry.bookingId ? (
                <Link
                  href={appendReturnTo(`/dashboard/bookings/${entry.bookingId}`, returnToHref)}
                  className="mt-0.5 inline-flex truncate text-xs text-gray-400 transition-colors hover:text-blue-700"
                >
                  {t('redemptionBookingLabel', {
                    bookingId: entry.bookingId.slice(0, 8),
                  })}
                </Link>
              ) : undefined
            }
            points={
              <span className="shrink-0 text-sm font-semibold text-emerald-700">
                {t('earnedPointsBadge', { count: entry.points })}
              </span>
            }
          />
        ))}
      </div>

      <div className="mt-4 flex flex-col items-center gap-3">
        <p className="text-center text-xs text-gray-400">
          {t('showingEntries', {
            shown: entries.items.length,
            total: entries.total,
          })}
        </p>
        {loadMoreEntriesError && (
          <p role="alert" className="text-center text-xs font-medium text-red-600">
            {loadMoreEntriesError}
          </p>
        )}
        {entries.items.length < entries.total && (
          <Button
            type="button"
            variant="secondary"
            onClick={loadMoreEntries}
            disabled={isLoadingEntries}
          >
            {t('loadMoreEntries')}
          </Button>
        )}
      </div>
    </>
  );
}
