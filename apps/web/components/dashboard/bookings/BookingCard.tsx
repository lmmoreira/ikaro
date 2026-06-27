'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { StaffBookingCardResponse } from '@ikaro/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatDuration } from '@/lib/formatting/format-duration';
import { useFormatting } from '@/lib/formatting/use-formatting';
import { addDays, toDateKeyInTimezone } from '@/lib/utils/date-utils';

export type BookingCardVariant = 'action-needed' | 'today' | 'upcoming';

export interface BookingCardProps {
  readonly booking: StaffBookingCardResponse;
  readonly variant: BookingCardVariant;
  readonly emphasized?: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  INFO_REQUESTED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
  COMPLETED: 'bg-slate-100 text-slate-600',
};

function BookingCardInner({
  booking,
  variant,
  emphasized = false,
}: BookingCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingCard');
  const { formatMoney, formatTime, formatDateLong, timezone } = useFormatting();
  const scheduledAt = new Date(booking.scheduledAt);

  const STATUS_LABEL: Record<string, string> = {
    PENDING: t('statusPending'),
    INFO_REQUESTED: t('statusInfoRequested'),
    APPROVED: t('statusApproved'),
    REJECTED: t('statusRejected'),
    CANCELLED: t('statusCancelled'),
    COMPLETED: t('statusCompleted'),
  };

  const timeLabel =
    variant === 'today'
      ? formatTime(scheduledAt)
      : (() => {
          const now = new Date();
          const todayKey = toDateKeyInTimezone(now, timezone);
          const tomorrowKey = toDateKeyInTimezone(addDays(now, 1), timezone);
          const scheduledKey = toDateKeyInTimezone(scheduledAt, timezone);

          const prefix =
            scheduledKey === todayKey
              ? t('today')
              : scheduledKey === tomorrowKey
                ? t('tomorrow')
                : formatDateLong(scheduledAt);

          return `${prefix} · ${formatTime(scheduledAt)}`;
        })();

  const card = (
    <Card
      className={[
        'mb-3 transition-shadow',
        booking.status === 'INFO_REQUESTED' ? 'border-l-[3px] border-l-blue-600' : '',
        emphasized ? 'border-blue-500 bg-blue-50/60 shadow-sm' : '',
        variant === 'upcoming' && !emphasized ? 'opacity-70' : 'hover:shadow-md',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <CardContent className="p-4">
        <div className="mb-1 flex items-start justify-between gap-2">
          <span className="truncate text-sm font-semibold text-gray-900">
            {booking.contactName}
          </span>
          <Badge
            className={`shrink-0 text-xs ${STATUS_BADGE[booking.status] ?? 'bg-gray-100 text-gray-600'}`}
          >
            {STATUS_LABEL[booking.status] ?? booking.status}
          </Badge>
        </div>

        <p className="mb-1 truncate text-xs text-gray-500">{booking.serviceNames.join(', ')}</p>

        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>{timeLabel}</span>
          <span>
            {formatMoney(booking.totalPrice.amount)} · {formatDuration(booking.totalDurationMins)}
          </span>
        </div>

        {variant === 'today' && (
          <div className="relative z-10 mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              {t('markCompleted')}
            </button>
          </div>
        )}

        {variant === 'action-needed' && (
          <div className="relative z-10 mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              {t('approve')}
            </button>
            <button
              type="button"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {t('viewDetails')}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (variant === 'upcoming') return card;

  return (
    <div className="relative">
      <Link
        href={`/dashboard/bookings/${booking.bookingId}`}
        className="absolute inset-0"
        aria-label={t('viewDetailsAriaLabel', { name: booking.contactName })}
      />
      {card}
    </div>
  );
}

export function BookingCard(props: BookingCardProps): React.JSX.Element {
  return <BookingCardInner {...props} />;
}
