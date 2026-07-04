'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Calendar, Star } from 'lucide-react';
import type { CustomerBookingListItem, CustomerLoyaltyBalanceResponse } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { countActiveBookings, selectHomePreview } from '../../booking-sections';
import { BookingEmptyState } from './BookingEmptyState';
import { BookingListItem } from './BookingListItem';

interface HomeDashboardProps {
  readonly bookings: readonly CustomerBookingListItem[];
  readonly loyaltyBalance: CustomerLoyaltyBalanceResponse;
  readonly userName: string | null;
  readonly tenantSlug: string;
}

export function HomeDashboard({
  bookings,
  loyaltyBalance,
  userName,
  tenantSlug,
}: HomeDashboardProps): React.JSX.Element {
  const t = useTranslations('customer.home');
  const { formatDate } = useFormatting();
  const preview = selectHomePreview([...bookings]);

  return (
    <div className="w-full">
      {userName !== null && (
        <h1 className="text-lg font-bold text-gray-900">{t('greeting', { name: userName })}</h1>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100">
            <Star className="h-[18px] w-[18px] fill-amber-500 text-amber-500" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-semibold text-gray-500">{t('points')}</p>
            <p className="text-[1.1875rem] font-bold leading-tight text-gray-900">
              {t('pointsValue', { points: loyaltyBalance.currentPoints })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
            <Calendar className="h-[18px] w-[18px] text-blue-600" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-semibold text-gray-500">{t('bookings')}</p>
            <p className="text-[1.1875rem] font-bold leading-tight text-gray-900">
              {t('bookingsTotal', { count: countActiveBookings(bookings) })}
            </p>
          </div>
        </div>
      </div>

      {loyaltyBalance.nextExpiryDate !== null && loyaltyBalance.nextExpiryPoints !== null && (
        <Link
          href={`/${tenantSlug}/my-account/loyalty`}
          className="mt-3 block rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100"
        >
          {t('expiryStrip', {
            points: loyaltyBalance.nextExpiryPoints,
            date: formatDate(new Date(loyaltyBalance.nextExpiryDate)),
          })}
        </Link>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-gray-500">{t('upcomingTitle')}</h2>
        {preview.length === 0 ? (
          <div className="mt-2">
            <BookingEmptyState tenantSlug={tenantSlug} />
          </div>
        ) : (
          <>
            <ul className="mt-2 flex flex-col gap-2">
              {preview.map((item) => (
                <BookingListItem key={item.bookingId} item={item} tenantSlug={tenantSlug} />
              ))}
            </ul>
            <Link
              href={`/${tenantSlug}/my-account/bookings`}
              className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline"
            >
              {t('viewAll')}
            </Link>
          </>
        )}
      </section>

      <Link
        href={`/${tenantSlug}/booking`}
        className="mt-6 block rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700 lg:hidden"
      >
        {t('newBooking')}
      </Link>
    </div>
  );
}
