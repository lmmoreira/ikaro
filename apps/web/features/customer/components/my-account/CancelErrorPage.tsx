'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { digitsOnly } from '@/shared/utils/digits-only';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';

interface CancelErrorPageProps {
  readonly booking: CustomerBookingDetailResponse;
  readonly tenantSlug: string;
  readonly whatsapp: string | null;
  /** Where the customer came from (e.g. a recurring schedule's page) — the back link returns there. */
  readonly returnTo?: string | null;
}

export function CancelErrorPage({
  booking,
  tenantSlug,
  whatsapp,
  returnTo = null,
}: CancelErrorPageProps): React.JSX.Element {
  const t = useTranslations('customer.cancelError');
  const { formatMoney, formatTime, formatDateLong } = useFormatting();
  const topbarStatus = useCustomerTopbarStatus();
  const setBookingStatus = topbarStatus?.setBookingStatus;
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;

  const serviceNames = booking.lines.map((line) => line.serviceName).join(', ');
  const scheduledAt = booking.scheduledAt === null ? null : new Date(booking.scheduledAt);
  const backHref = returnTo ?? `/${tenantSlug}/my-account/bookings/${booking.bookingId}`;
  const deadline = booking.cancellableUntil === null ? null : new Date(booking.cancellableUntil);

  useEffect(() => {
    setBookingStatus?.(booking.status);
    setBackHrefOverride?.(backHref);
    setBackLabelOverride?.(returnTo === null ? t('backToBooking') : t('backToSchedule'));
    return () => {
      setBookingStatus?.(null);
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [
    backHref,
    booking.status,
    returnTo,
    setBackHrefOverride,
    setBackLabelOverride,
    setBookingStatus,
    t,
    tenantSlug,
  ]);

  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>
      <p className="text-sm text-gray-700">{t('body')}</p>
      {deadline !== null && (
        <p className="text-sm text-gray-500">
          {t('deadlineNote', {
            date: formatDateLong(deadline),
            time: formatTime(deadline),
          })}
        </p>
      )}

      <div className="rounded-xl border border-gray-100 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">{serviceNames}</p>
        {scheduledAt !== null && (
          <p className="mt-1 text-sm text-gray-500">
            {formatDateLong(scheduledAt)} · {formatTime(scheduledAt)}
          </p>
        )}
        <p className="mt-1 text-sm font-medium text-gray-900">
          {formatMoney(booking.totalPrice.amount)}
        </p>
      </div>

      <p className="text-sm text-gray-500">{t('contactNote')}</p>

      {whatsapp !== null && (
        <a
          href={`https://wa.me/${digitsOnly(whatsapp)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-green-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-green-700"
        >
          {t('whatsappCta')}
        </a>
      )}

      <Link
        href={backHref}
        className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        {t('backButton')}
      </Link>
    </div>
  );
}
