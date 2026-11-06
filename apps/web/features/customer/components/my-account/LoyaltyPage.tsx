'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type {
  CustomerLoyaltyBalanceResponse,
  CustomerLoyaltyEntriesResponse,
  CustomerLoyaltyRedemptionsResponse,
} from '@ikaro/types';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { LoyaltyEntriesPanel } from './LoyaltyEntriesPanel';
import { LoyaltyRedemptionsPanel } from './LoyaltyRedemptionsPanel';

interface LoyaltyPageProps {
  readonly balance: CustomerLoyaltyBalanceResponse;
  readonly entries: CustomerLoyaltyEntriesResponse;
  readonly redemptions: CustomerLoyaltyRedemptionsResponse;
  readonly tenantSlug: string;
}

type LoyaltyTab = 'entries' | 'redemptions';

export function LoyaltyPage({
  balance,
  entries,
  redemptions,
  tenantSlug,
}: LoyaltyPageProps): React.JSX.Element {
  const t = useTranslations('customer.loyalty');
  const { formatDate, formatMoney } = useFormatting();
  const [activeTab, setActiveTab] = useState<LoyaltyTab>('entries');

  const isEmpty = balance.currentPoints === 0 && entries.total === 0;
  const conversionTotal =
    balance.conversionRate > 0 ? balance.currentPoints / balance.conversionRate : 0;

  return (
    <div className="w-full">
      <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>

      <div
        className={`mt-4 flex items-center gap-4 rounded-xl p-4 text-white ${
          isEmpty ? 'bg-gray-300' : 'bg-gradient-to-br from-blue-600 to-blue-700'
        }`}
      >
        <p data-testid="loyalty-balance-points" className="text-3xl font-extrabold leading-none">
          {balance.currentPoints}
        </p>

        <div className="min-w-0 flex-1 border-l border-white/20 pl-4">
          <p className="text-xs font-medium opacity-90">{t('pointsActiveLabel')}</p>

          {!isEmpty && balance.nextExpiryDate !== null && balance.nextExpiryPoints !== null && (
            <p className="mt-1 text-xs opacity-80">
              {t('expiryWarning', {
                points: balance.nextExpiryPoints,
                date: formatDate(new Date(balance.nextExpiryDate)),
              })}
            </p>
          )}

          {!isEmpty && balance.conversionRate > 0 && (
            <p className="mt-1 text-xs opacity-80">
              {t('conversionRow', {
                rate: balance.conversionRate,
                unit: formatMoney(1),
                total: formatMoney(conversionTotal),
              })}
            </p>
          )}
        </div>
      </div>

      {isEmpty ? (
        <div
          data-testid="loyalty-empty-state"
          className="mt-6 flex flex-col items-center rounded-2xl border border-gray-100 bg-white px-6 py-12 text-center"
        >
          <p className="text-base font-semibold text-gray-900">{t('emptyTitle')}</p>
          <p className="mt-1 max-w-sm text-sm text-gray-500">{t('emptyBody')}</p>
          <Link
            href={`/${tenantSlug}/booking`}
            className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('emptyCta')}
          </Link>
        </div>
      ) : (
        <>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as LoyaltyTab)}>
            <TabsList className="mt-5 border-gray-100">
              {(['entries', 'redemptions'] as const).map((tab) => (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  // The panels are separate components that own their `role="tabpanel"` and ids.
                  id={`loyalty-tab-${tab}`}
                  aria-controls={`loyalty-panel-${tab}`}
                  className="flex-1 px-0 pb-3 pt-0 text-gray-900/40 hover:text-gray-900/40"
                >
                  {t(tab === 'entries' ? 'tabEntries' : 'tabRedemptions')}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {activeTab === 'entries' ? (
            <LoyaltyEntriesPanel entries={entries} tenantSlug={tenantSlug} />
          ) : (
            <LoyaltyRedemptionsPanel redemptions={redemptions} tenantSlug={tenantSlug} />
          )}
        </>
      )}
    </div>
  );
}
