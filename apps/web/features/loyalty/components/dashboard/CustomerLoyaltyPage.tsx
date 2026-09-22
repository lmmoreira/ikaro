'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  CustomerProfileResponse,
  EnrichedLoyaltyBalanceResponse,
  PaginatedLoyaltyEntriesResponse,
  PaginatedLoyaltyRedemptionsResponse,
} from '@ikaro/types';
import { Card } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import {
  getCustomerLoyaltyEntries,
  getCustomerLoyaltyRedemptions,
} from '@/features/loyalty/dashboard-api';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { HistoryTabs } from './LoyaltyHistoryHelpers';
import { CustomerLoyaltyEntriesTab } from './CustomerLoyaltyEntriesTab';
import { CustomerLoyaltyRedemptionsTab } from './CustomerLoyaltyRedemptionsTab';
import { CustomerLoyaltyHeader } from './CustomerLoyaltyHeader';

interface CustomerLoyaltyPageProps {
  readonly customer: CustomerProfileResponse;
  readonly balance: EnrichedLoyaltyBalanceResponse;
  readonly entries: PaginatedLoyaltyEntriesResponse;
  readonly redemptions: PaginatedLoyaltyRedemptionsResponse;
  readonly initialActiveTab?: 'entries' | 'redemptions';
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
  const activeTabContent =
    activeTab === 'entries' ? (
      <CustomerLoyaltyEntriesTab
        entries={entries}
        locale={locale}
        formatDateLong={formatDateLong}
        isLoadingEntries={isLoadingEntries}
        loadMoreEntries={loadMoreEntries}
        loadMoreEntriesError={loadMoreEntriesError}
        returnToHref={returnToHref}
        t={t}
      />
    ) : (
      <CustomerLoyaltyRedemptionsTab
        redemptions={redemptions}
        formatDateLong={formatDateLong}
        isLoadingRedemptions={isLoadingRedemptions}
        loadMoreRedemptions={loadMoreRedemptions}
        loadMoreRedemptionsError={loadMoreRedemptionsError}
        returnToHref={returnToHref}
        t={t}
      />
    );

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
      <CustomerLoyaltyHeader
        customer={customer}
        balance={balance}
        initialPoints={initialPoints}
        hasPoints={hasPoints}
        totalValue={totalValue}
        nextExpiryLabel={nextExpiryLabel}
        balanceCardClassName={balanceCardClassName}
        formatMoney={formatMoney}
        t={t}
      />

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
