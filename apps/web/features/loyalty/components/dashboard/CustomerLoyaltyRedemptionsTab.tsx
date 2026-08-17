import Link from 'next/link';
import type { useTranslations } from 'next-intl';
import type { PaginatedLoyaltyRedemptionsResponse } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { appendReturnTo } from '@/features/booking/model/booking-navigation';
import { EmptyState, LoyaltyHistoryRow } from './LoyaltyHistoryHelpers';

export function CustomerLoyaltyRedemptionsTab({
  redemptions,
  formatDateLong,
  isLoadingRedemptions,
  loadMoreRedemptions,
  loadMoreRedemptionsError,
  returnToHref,
  t,
}: {
  readonly redemptions: PaginatedLoyaltyRedemptionsResponse;
  readonly formatDateLong: (date: Date) => string;
  readonly isLoadingRedemptions: boolean;
  readonly loadMoreRedemptions: () => Promise<void>;
  readonly loadMoreRedemptionsError: string | null;
  readonly returnToHref: string;
  readonly t: ReturnType<typeof useTranslations>;
}): React.JSX.Element {
  if (redemptions.items.length === 0) {
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
            <circle cx="12" cy="12" r="10" />
            <path d="M9 12h6" />
          </svg>
        }
        title={t('redemptionsEmptyTitle')}
        body={t('redemptionsEmptyBody')}
      />
    );
  }

  return (
    <>
      <div>
        {redemptions.items.map((redemption) => (
          <LoyaltyHistoryRow
            key={redemption.id}
            icon={
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700"
                aria-hidden="true"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 8 2 12 6 16" />
                  <line x1="22" y1="12" x2="2" y2="12" />
                </svg>
              </div>
            }
            title={
              <p
                data-testid="loyalty-redemption-title"
                className="truncate text-sm font-semibold text-gray-900"
              >
                {redemption.notes?.trim() || t('redemptionDefaultTitle')}
              </p>
            }
            meta={formatDateLong(new Date(redemption.redeemedAt))}
            link={
              redemption.bookingId ? (
                <Link
                  href={appendReturnTo(`/dashboard/bookings/${redemption.bookingId}`, returnToHref)}
                  className="mt-0.5 inline-flex truncate text-xs text-gray-400 transition-colors hover:text-blue-700"
                >
                  {t('redemptionBookingLabel', {
                    bookingId: redemption.bookingId.slice(0, 8),
                  })}
                </Link>
              ) : undefined
            }
            points={
              <span className="shrink-0 text-sm font-semibold text-rose-700">
                {t('redeemedPointsBadge', { count: redemption.pointsRedeemed })}
              </span>
            }
          />
        ))}
      </div>

      <div className="mt-4 flex flex-col items-center gap-3">
        <p className="text-center text-xs text-gray-400">
          {t('showingRedemptions', {
            shown: redemptions.items.length,
            total: redemptions.total,
          })}
        </p>
        {loadMoreRedemptionsError && (
          <p role="alert" className="text-center text-xs font-medium text-red-600">
            {loadMoreRedemptionsError}
          </p>
        )}
        {redemptions.items.length < redemptions.total && (
          <Button
            type="button"
            variant="secondary"
            onClick={loadMoreRedemptions}
            disabled={isLoadingRedemptions}
          >
            {t('loadMoreRedemptions')}
          </Button>
        )}
      </div>
    </>
  );
}
