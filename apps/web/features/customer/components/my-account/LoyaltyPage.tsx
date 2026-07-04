'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type {
  CustomerLoyaltyBalanceResponse,
  CustomerLoyaltyEntriesResponse,
  CustomerLoyaltyRedemptionsResponse,
} from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

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
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>

      <div
        className={`mt-4 rounded-2xl p-5 text-white ${
          isEmpty ? 'bg-gray-300' : 'bg-gradient-to-br from-blue-600 to-blue-700'
        }`}
      >
        <p className="text-3xl font-bold">{balance.currentPoints}</p>
        <p className="text-sm font-medium opacity-90">{t('pointsActiveLabel')}</p>

        {!isEmpty && balance.nextExpiryDate !== null && balance.nextExpiryPoints !== null && (
          <p className="mt-3 text-xs font-medium opacity-90">
            {t('expiryWarning', {
              points: balance.nextExpiryPoints,
              date: formatDate(new Date(balance.nextExpiryDate)),
            })}
          </p>
        )}

        {!isEmpty && balance.conversionRate > 0 && (
          <p className="mt-2 text-xs opacity-90">
            {t('conversionRow', {
              rate: balance.conversionRate,
              unit: formatMoney(1),
              total: formatMoney(conversionTotal),
            })}
          </p>
        )}
      </div>

      {isEmpty ? (
        <div className="mt-6 flex flex-col items-center rounded-2xl border border-gray-100 bg-white px-6 py-12 text-center">
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
          <div className="mt-5 flex border-b border-gray-100" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'entries'}
              onClick={() => setActiveTab('entries')}
              className={`flex-1 border-b-2 pb-3 text-sm font-semibold transition-colors ${
                activeTab === 'entries'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-900/40'
              }`}
            >
              {t('tabEntries')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'redemptions'}
              onClick={() => setActiveTab('redemptions')}
              className={`flex-1 border-b-2 pb-3 text-sm font-semibold transition-colors ${
                activeTab === 'redemptions'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-900/40'
              }`}
            >
              {t('tabRedemptions')}
            </button>
          </div>

          {activeTab === 'entries' ? (
            <ul className="mt-3 flex flex-col gap-2">
              {entries.items.map((entry) => (
                <li
                  key={entry.entryId}
                  className={`flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 ${
                    entry.expired ? 'opacity-40' : ''
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{entry.serviceName}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                      <span>{formatDate(new Date(entry.earnedAt))}</span>
                      {entry.expired && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-500">
                          {t('expiredBadge')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-sm font-bold ${entry.expired ? 'text-gray-400' : 'text-green-600'}`}
                  >
                    +{entry.pointsEarned} pts
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {redemptions.items.length === 0 ? (
                <li className="rounded-xl border border-gray-100 bg-white p-4 text-center text-sm text-gray-500">
                  {t('noRedemptions')}
                </li>
              ) : (
                redemptions.items.map((redemption) => (
                  <li
                    key={redemption.redemptionId}
                    className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {redemption.bookingReference !== null
                          ? t('redemptionLabel', { reference: redemption.bookingReference })
                          : t('redemptionLabelGeneric')}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                        <span>{formatDate(new Date(redemption.redeemedAt))}</span>
                        <span>{t('savingsLabel', { amount: redemption.amountSaved })}</span>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-red-600">
                      −{redemption.pointsUsed} pts
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
