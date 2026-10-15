'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Bell, Calendar, Repeat, Star } from 'lucide-react';
import type {
  CustomerBookingListItem,
  CustomerLoyaltyBalanceResponse,
  RecurringBookingScheduleListItem,
} from '@ikaro/types';
import { toISODateInTimezone } from '@/shared/lib/formatting/date-utils';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { alertListPath } from '../../alert-model';
import { countActiveBookings, selectHomePreview } from '../../booking-sections';
import { selectRenewalCandidate } from '../../home-widgets';
import { recurringScheduleListPath } from '../../recurring-schedule-model';
import { NewReservationMenu } from '../NewReservationMenu';
import { BookingEmptyState } from './BookingEmptyState';
import { BookingListItem } from './BookingListItem';
import { HomeCountTile } from './HomeCountTile';
import { HomeRenewalCard } from './HomeRenewalCard';

interface HomeDashboardProps {
  readonly bookings: readonly CustomerBookingListItem[];
  readonly loyaltyBalance: CustomerLoyaltyBalanceResponse;
  readonly userName: string | null;
  readonly tenantSlug: string;
  /**
   * The customer's running recurring schedules; `null` when that optional read failed (no
   * "Recorrências" tile, no "Renovar" card).
   */
  readonly recurringSchedules: readonly RecurringBookingScheduleListItem[] | null;
  /** How many availability alerts are active; `null` when that optional read failed (no tile). */
  readonly activeAlertCount: number | null;
}

export function HomeDashboard({
  bookings,
  loyaltyBalance,
  userName,
  tenantSlug,
  recurringSchedules,
  activeAlertCount,
}: HomeDashboardProps): React.JSX.Element {
  const t = useTranslations('customer.home');
  const { formatDate, timezone } = useFormatting();
  const preview = selectHomePreview(bookings);
  const recurringCount = recurringSchedules?.length ?? 0;
  const renewal =
    recurringSchedules === null
      ? null
      : selectRenewalCandidate(recurringSchedules, toISODateInTimezone(new Date(), timezone));

  return (
    <div className="w-full">
      {userName !== null && (
        <h1 className="text-lg font-bold text-gray-900">{t('greeting', { name: userName })}</h1>
      )}

      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
        <HomeCountTile
          href={`/${tenantSlug}/my-account/loyalty`}
          label={t('points')}
          value={t('pointsValue', { points: loyaltyBalance.currentPoints })}
          valueTestId="home-points-value"
          iconBackground="bg-amber-100"
          icon={
            <Star className="h-[18px] w-[18px] fill-amber-500 text-amber-500" aria-hidden="true" />
          }
        />
        <HomeCountTile
          href={`/${tenantSlug}/my-account/bookings`}
          label={t('bookings')}
          value={t('bookingsTotal', { count: countActiveBookings(bookings) })}
          valueTestId="home-bookings-value"
          iconBackground="bg-blue-50"
          icon={<Calendar className="h-[18px] w-[18px] text-blue-600" aria-hidden="true" />}
        />
        {recurringCount > 0 && (
          <HomeCountTile
            href={recurringScheduleListPath(tenantSlug)}
            label={t('recurring')}
            value={t('recurringValue', { count: recurringCount })}
            valueTestId="home-recurring-value"
            iconBackground="bg-blue-50"
            icon={<Repeat className="h-[18px] w-[18px] text-blue-600" aria-hidden="true" />}
          />
        )}
        {activeAlertCount !== null && activeAlertCount > 0 && (
          <HomeCountTile
            href={alertListPath(tenantSlug)}
            label={t('alerts')}
            value={t('alertsValue', { count: activeAlertCount })}
            valueTestId="home-alerts-value"
            iconBackground="bg-blue-50"
            icon={<Bell className="h-[18px] w-[18px] text-blue-600" aria-hidden="true" />}
          />
        )}
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

      {renewal !== null && <HomeRenewalCard selection={renewal} tenantSlug={tenantSlug} />}

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

      <div className="mt-6 lg:hidden" data-testid="mobile-new-menu">
        <NewReservationMenu tenantSlug={tenantSlug} fullWidth />
      </div>
    </div>
  );
}
