'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type {
  CustomerProfileResponse,
  EnrichedLoyaltyBalanceResponse,
  PaginatedLoyaltyEntriesResponse,
  PaginatedLoyaltyRedemptionsResponse,
} from '@ikaro/types';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { cn } from '@/shared/utils/cn';
import { getInitials } from '@/shared/utils/initials';
import {
  getCustomerLoyaltyEntries,
  getCustomerLoyaltyRedemptions,
} from '@/features/loyalty/dashboard-api';
import { appendReturnTo } from '@/features/booking/model/booking-navigation';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

interface CustomerLoyaltyPageProps {
  readonly customer: CustomerProfileResponse;
  readonly balance: EnrichedLoyaltyBalanceResponse;
  readonly entries: PaginatedLoyaltyEntriesResponse;
  readonly redemptions: PaginatedLoyaltyRedemptionsResponse;
  readonly initialActiveTab?: 'entries' | 'redemptions';
}

function formatShortDateLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));
}

function HistoryTabs({
  activeTab,
  onChange,
  entriesLabel,
  redemptionsLabel,
}: {
  readonly activeTab: 'entries' | 'redemptions';
  readonly onChange: (tab: 'entries' | 'redemptions') => void;
  readonly entriesLabel: string;
  readonly redemptionsLabel: string;
}): React.JSX.Element {
  return (
    <div className="mb-4 flex border-b-2 border-gray-200">
      <button
        type="button"
        onClick={() => onChange('entries')}
        className={cn(
          'mb-[-2px] border-b-2 px-4 pb-3 pt-2 text-sm font-semibold transition-colors',
          activeTab === 'entries'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-400',
        )}
      >
        {entriesLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange('redemptions')}
        className={cn(
          'mb-[-2px] border-b-2 px-4 pb-3 pt-2 text-sm font-semibold transition-colors',
          activeTab === 'redemptions'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-400',
        )}
      >
        {redemptionsLabel}
      </button>
    </div>
  );
}

function EntryIcon({ expired }: { readonly expired: boolean }): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        expired ? 'bg-gray-100 text-gray-400' : 'bg-emerald-100 text-emerald-700',
      )}
      aria-hidden="true"
    >
      {expired ? (
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
      ) : (
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
          <polyline points="18 8 22 12 18 16" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly body: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        {icon}
      </div>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">{body}</p>
    </div>
  );
}

function LoyaltyHistoryRow({
  icon,
  title,
  meta,
  link,
  points,
}: {
  readonly icon: React.ReactNode;
  readonly title: React.ReactNode;
  readonly meta: React.ReactNode;
  readonly link?: React.ReactNode;
  readonly points: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-gray-200 py-3.5 last:border-b-0">
      {icon}
      <div className="min-w-0 flex-1">
        {title}
        <div className="mt-0.5 text-xs text-gray-500">{meta}</div>
        {link}
      </div>
      {points}
    </div>
  );
}

function renderEntriesTabContent({
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

function renderRedemptionsTabContent({
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

export function CustomerLoyaltyPage({
  customer,
  balance,
  entries: initialEntries,
  redemptions: initialRedemptions,
  initialActiveTab = 'entries',
}: CustomerLoyaltyPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.loyaltyPage');
  const dashboardT = useTranslations('dashboard');
  const { formatMoney, formatDateLong } = useFormatting();
  const locale = useLocale();
  const resolvedLocale = useResolvedLocale();
  const topbarStatus = useDashboardTopbarStatus();
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;
  const setPageTitleOverride = topbarStatus?.setPageTitleOverride;
  const [activeTab, setActiveTab] = useState<'entries' | 'redemptions'>(initialActiveTab);
  const [entries, setEntries] = useState(initialEntries);
  const [redemptions, setRedemptions] = useState(initialRedemptions);
  const [isLoadingEntries, setIsLoadingEntries] = useState(false);
  const [isLoadingRedemptions, setIsLoadingRedemptions] = useState(false);
  const [loadMoreEntriesError, setLoadMoreEntriesError] = useState<string | null>(null);
  const [loadMoreRedemptionsError, setLoadMoreRedemptionsError] = useState<string | null>(null);

  useEffect(() => {
    setBackHrefOverride?.('/dashboard/loyalty');
    setBackLabelOverride?.(dashboardT('nav.loyalty'));
    setPageTitleOverride?.(customer.name);

    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
      setPageTitleOverride?.(null);
    };
  }, [customer.name, dashboardT, setBackHrefOverride, setBackLabelOverride, setPageTitleOverride]);

  const initialPoints = balance.currentPoints;
  const hasPoints = initialPoints > 0;
  const totalValue = useMemo(
    () => (balance.conversionRate > 0 ? initialPoints / balance.conversionRate : 0),
    [balance.conversionRate, initialPoints],
  );
  const nextExpiryLabel = balance.nextExpiryDate
    ? formatDateLong(new Date(balance.nextExpiryDate))
    : null;
  const balanceCardClassName = hasPoints
    ? 'bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 text-white'
    : 'bg-gray-100 text-gray-900';
  const returnToHref = `/dashboard/loyalty/${customer.customerId}${
    activeTab === 'redemptions' ? '?tab=redemptions' : ''
  }`;
  let activeTabContent: React.JSX.Element;
  if (activeTab === 'entries') {
    activeTabContent = renderEntriesTabContent({
      entries,
      locale,
      formatDateLong,
      isLoadingEntries,
      loadMoreEntries,
      loadMoreEntriesError,
      returnToHref,
      t,
    });
  } else {
    activeTabContent = renderRedemptionsTabContent({
      redemptions,
      formatDateLong,
      isLoadingRedemptions,
      loadMoreRedemptions,
      loadMoreRedemptionsError,
      returnToHref,
      t,
    });
  }

  async function loadMoreEntries(): Promise<void> {
    if (isLoadingEntries || entries.items.length >= entries.total) return;
    setIsLoadingEntries(true);
    setLoadMoreEntriesError(null);
    try {
      const next = await getCustomerLoyaltyEntries(customer.customerId, {
        page: entries.page + 1,
        limit: entries.limit,
      });
      setEntries((current) => ({
        ...next,
        items: [...current.items, ...next.items],
      }));
    } catch (err) {
      // Keep the current page when loading more fails; the load-more button stays visible
      // as the retry affordance.
      setLoadMoreEntriesError(resolveErrorMessageFromApiError(err, resolvedLocale));
    } finally {
      setIsLoadingEntries(false);
    }
  }

  async function loadMoreRedemptions(): Promise<void> {
    if (isLoadingRedemptions || redemptions.items.length >= redemptions.total) return;
    setIsLoadingRedemptions(true);
    setLoadMoreRedemptionsError(null);
    try {
      const next = await getCustomerLoyaltyRedemptions(customer.customerId, {
        page: redemptions.page + 1,
        limit: redemptions.limit,
      });
      setRedemptions((current) => ({
        ...next,
        items: [...current.items, ...next.items],
      }));
    } catch (err) {
      // Keep the current page when loading more fails; the load-more button stays visible
      // as the retry affordance.
      setLoadMoreRedemptionsError(resolveErrorMessageFromApiError(err, resolvedLocale));
    } finally {
      setIsLoadingRedemptions(false);
    }
  }

  return (
    <section className="w-full space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <header className="flex items-center gap-4">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className="bg-blue-600 text-sm font-bold text-white">
              {getInitials(customer.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-gray-900">{customer.name}</p>
            <p className="truncate text-sm text-gray-500">{customer.email}</p>
          </div>
        </header>

        <Card
          className={cn(
            'w-full max-w-md overflow-hidden rounded-2xl border-0 shadow-none lg:self-center',
            balanceCardClassName,
          )}
        >
          <div className="p-3.5 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-3xl font-extrabold leading-none sm:text-[2.25rem]">
                  {initialPoints}
                </p>
                <p
                  data-testid="loyalty-balance-label"
                  className="mt-1 text-xs font-medium uppercase tracking-[0.06em] opacity-80"
                >
                  {hasPoints ? t('balanceLabelActive') : t('balanceLabelEmpty')}
                </p>
              </div>

              <div className="space-y-1.5 sm:max-w-[16rem] sm:text-right">
                {hasPoints && nextExpiryLabel && balance.nextExpiryPoints !== null && (
                  <div className="inline-flex max-w-full items-start rounded-xl bg-white/15 px-2.5 py-1.5 text-left text-xs font-medium sm:ml-auto sm:text-sm">
                    <span className="mr-2 shrink-0">⚠️</span>
                    <span className="min-w-0">
                      {t('balanceExpiryLine', {
                        count: balance.nextExpiryPoints,
                        date: nextExpiryLabel,
                      })}
                    </span>
                  </div>
                )}

                {hasPoints && balance.conversionRate > 0 && (
                  <p className="text-xs font-medium opacity-90 sm:text-sm">
                    {t('balanceRateLine', {
                      pointsPerCurrencyUnit: balance.conversionRate,
                      price: formatMoney(1),
                      totalLabel: t('balanceTotalLabel'),
                      total: formatMoney(totalValue),
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-none">
        <div className="px-4 py-4 sm:px-5">
          <HistoryTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            entriesLabel={t('entriesTab')}
            redemptionsLabel={t('redemptionsTab')}
          />

          {activeTabContent}
        </div>
      </Card>
    </section>
  );
}
