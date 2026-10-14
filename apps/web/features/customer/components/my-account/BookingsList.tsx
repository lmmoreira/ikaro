'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Bell, ChevronRight, Repeat } from 'lucide-react';
import type { CustomerBookingListItem } from '@ikaro/types';
import type { AlertsSummary } from '@/features/booking/api/availability-alerts.server';
import type { RecurringSummary } from '@/features/booking/api/recurring-booking-schedules.server';
import { alertListPath } from '../../alert-model';
import { recurringScheduleListPath } from '../../recurring-schedule-model';
import { splitBookingSections } from '../../booking-sections';
import { NewReservationMenu } from '../NewReservationMenu';
import { BookingEmptyState } from './BookingEmptyState';
import { BookingListItem } from './BookingListItem';

interface BookingsListProps {
  readonly bookings: readonly CustomerBookingListItem[];
  /** `null` when the schedules read failed — the entry row is simply not shown. */
  readonly recurringSummary: RecurringSummary | null;
  /** `null` when the alerts read failed — the entry row is simply not shown. */
  readonly alertsSummary: AlertsSummary | null;
  readonly tenantSlug: string;
}

interface EntryRowProps {
  readonly rowTestId: 'recurring-entry-row' | 'alerts-entry-row';
  readonly countTestId: 'recurring-entry-count' | 'alerts-entry-count';
  readonly href: string;
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly count: string;
}

/** A link row above the booking list: a sibling list of the customer's, with its active count. */
function EntryRow({
  rowTestId,
  countTestId,
  href,
  icon,
  title,
  count,
}: EntryRowProps): React.JSX.Element {
  return (
    <Link
      href={href}
      data-testid={rowTestId}
      className="mt-3 flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-[2.125rem] w-[2.125rem] shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          {icon}
        </div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
      </div>
      <div className="flex items-center gap-2">
        <span
          data-testid={countTestId}
          className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
        >
          {count}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
      </div>
    </Link>
  );
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
  recurringSummary,
  alertsSummary,
  tenantSlug,
}: BookingsListProps): React.JSX.Element {
  const t = useTranslations('customer.bookings');
  const { upcoming, pending, history } = splitBookingSections(bookings);
  const isEmpty = upcoming.length === 0 && pending.length === 0 && history.length === 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>
        <div className="lg:hidden" data-testid="mobile-new-menu">
          <NewReservationMenu tenantSlug={tenantSlug} />
        </div>
      </div>

      {recurringSummary?.hasAny === true && (
        <EntryRow
          rowTestId="recurring-entry-row"
          countTestId="recurring-entry-count"
          href={recurringScheduleListPath(tenantSlug)}
          icon={<Repeat className="h-4 w-4" aria-hidden="true" />}
          title={t('recurringEntryTitle')}
          count={t('recurringEntryActive', { count: recurringSummary.activeCount })}
        />
      )}

      {alertsSummary?.hasAny === true && (
        <EntryRow
          rowTestId="alerts-entry-row"
          countTestId="alerts-entry-count"
          href={alertListPath(tenantSlug)}
          icon={<Bell className="h-4 w-4" aria-hidden="true" />}
          title={t('alertsEntryTitle')}
          count={t('alertsEntryActive', { count: alertsSummary.activeCount })}
        />
      )}

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
