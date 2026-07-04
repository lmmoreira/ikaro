'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import type { CustomerBookingListItem, CustomerLoyaltyBalanceResponse } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { splitBookingSections } from '../../booking-sections';
import { BookingEmptyState } from './BookingEmptyState';
import { BookingListItem } from './BookingListItem';

interface BookingsListProps {
  readonly bookings: readonly CustomerBookingListItem[];
  readonly loyaltyBalance: CustomerLoyaltyBalanceResponse;
  readonly tenantSlug: string;
}

interface BookingSectionProps {
  readonly testId: 'section-upcoming' | 'section-pending' | 'section-history';
  readonly title: string;
  readonly items: readonly CustomerBookingListItem[];
  readonly tenantSlug: string;
}

function BookingSection({
  testId,
  title,
  items,
  tenantSlug,
}: BookingSectionProps): React.JSX.Element {
  return (
    <section data-testid={testId} className="mt-6 first:mt-0">
      <h2 className="text-sm font-semibold text-gray-500">{title}</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <BookingListItem key={item.bookingId} item={item} tenantSlug={tenantSlug} />
        ))}
      </ul>
    </section>
  );
}

export function BookingsList({
  bookings,
  loyaltyBalance,
  tenantSlug,
}: BookingsListProps): React.JSX.Element {
  const t = useTranslations('customer.bookings');
  const { formatDate } = useFormatting();
  const { upcoming, pending, history } = splitBookingSections(bookings);
  const isEmpty = upcoming.length === 0 && pending.length === 0 && history.length === 0;

  return (
    <div className="w-full">
      <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>

      <Link
        href={`/${tenantSlug}/my-account/loyalty`}
        className="mt-3 flex items-center justify-between rounded-xl border border-blue-50 bg-white px-4 py-3 shadow-sm"
      >
        <div>
          <p className="text-lg font-extrabold text-gray-900">
            {t('pointsValue', { points: loyaltyBalance.currentPoints })}
          </p>
          <p className="text-xs text-gray-500">{t('pointsActiveLabel')}</p>
        </div>
        <div className="flex items-center gap-2">
          {loyaltyBalance.nextExpiryDate !== null && loyaltyBalance.nextExpiryPoints !== null && (
            <span className="rounded text-xs text-amber-800 bg-amber-100 px-2 py-0.5">
              {t('expiryStrip', {
                points: loyaltyBalance.nextExpiryPoints,
                date: formatDate(new Date(loyaltyBalance.nextExpiryDate)),
              })}
            </span>
          )}
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
        </div>
      </Link>

      {isEmpty ? (
        <div className="mt-6">
          <BookingEmptyState tenantSlug={tenantSlug} />
        </div>
      ) : (
        <div className="mt-4">
          {upcoming.length > 0 && (
            <BookingSection
              testId="section-upcoming"
              title={t('sectionUpcoming', { count: upcoming.length })}
              items={upcoming}
              tenantSlug={tenantSlug}
            />
          )}
          {pending.length > 0 && (
            <BookingSection
              testId="section-pending"
              title={t('sectionPending', { count: pending.length })}
              items={pending}
              tenantSlug={tenantSlug}
            />
          )}
          {history.length > 0 && (
            <BookingSection
              testId="section-history"
              title={t('sectionHistory', { count: history.length })}
              items={history}
              tenantSlug={tenantSlug}
            />
          )}
        </div>
      )}
    </div>
  );
}
