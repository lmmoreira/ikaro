'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
  readonly title: string;
  readonly items: readonly CustomerBookingListItem[];
  readonly tenantSlug: string;
}

function BookingSection({ title, items, tenantSlug }: BookingSectionProps): React.JSX.Element {
  return (
    <section className="mt-6 first:mt-0">
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
  const { upcoming, pending, history } = splitBookingSections([...bookings]);
  const isEmpty = upcoming.length === 0 && pending.length === 0 && history.length === 0;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>

      <Link
        href={`/${tenantSlug}/my-account/loyalty`}
        className="mt-3 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm hover:bg-blue-100"
      >
        <span className="font-semibold text-blue-900">
          {t('pointsActive', { points: loyaltyBalance.currentPoints })}
        </span>
        {loyaltyBalance.nextExpiryDate !== null && loyaltyBalance.nextExpiryPoints !== null && (
          <span className="text-xs text-blue-700">
            {t('expiryStrip', {
              points: loyaltyBalance.nextExpiryPoints,
              date: formatDate(new Date(loyaltyBalance.nextExpiryDate)),
            })}
          </span>
        )}
      </Link>

      {isEmpty ? (
        <div className="mt-6">
          <BookingEmptyState tenantSlug={tenantSlug} />
        </div>
      ) : (
        <div className="mt-4">
          {upcoming.length > 0 && (
            <BookingSection
              title={t('sectionUpcoming', { count: upcoming.length })}
              items={upcoming}
              tenantSlug={tenantSlug}
            />
          )}
          {pending.length > 0 && (
            <BookingSection
              title={t('sectionPending', { count: pending.length })}
              items={pending}
              tenantSlug={tenantSlug}
            />
          )}
          {history.length > 0 && (
            <BookingSection
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
