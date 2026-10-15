'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { StaffBookingCardResponse } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { useBookingWhenLabel } from '@/features/booking/hooks/useBookingWhenLabel';
import { BookingCardShell } from './BookingCardShell';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import {
  BOOKING_STATUS_CLASSES,
  buildBookingStatusLabels,
} from '@/features/booking/model/booking-status';

export type BookingCardVariant = 'action-needed' | 'today' | 'upcoming';

interface BookingCardBaseProps {
  readonly booking: StaffBookingCardResponse;
  readonly emphasized?: boolean;
}

export interface ActionNeededBookingCardProps extends BookingCardBaseProps {
  readonly variant: 'action-needed';
  readonly onApprove: () => void | Promise<void>;
  readonly isApproving?: boolean;
}

export interface TodayBookingCardProps extends BookingCardBaseProps {
  readonly variant: 'today';
}

export interface UpcomingBookingCardProps extends BookingCardBaseProps {
  readonly variant: 'upcoming';
}

export type BookingCardProps =
  ActionNeededBookingCardProps | TodayBookingCardProps | UpcomingBookingCardProps;

// "Marcar concluído" on today's card, "Aprovar" on an action-needed one, nothing on an upcoming one,
// and nothing on a booking that needs a decision (M23-S46): its only actions are the decision ones,
// taken from the detail or from "Reservas a resolver".
function renderActions(
  props: BookingCardProps,
  approvalPending: boolean,
  t: (key: 'markCompleted' | 'approve') => string,
): React.ReactNode {
  if (props.booking.hasOpenException) return null;
  if (props.variant === 'today') {
    return (
      <Button asChild size="sm">
        <Link href={`/dashboard/bookings/${props.booking.bookingId}/complete`}>
          {t('markCompleted')}
        </Link>
      </Button>
    );
  }
  if (props.variant === 'action-needed') {
    return (
      <Button type="button" size="sm" disabled={approvalPending} onClick={props.onApprove}>
        {t('approve')}
      </Button>
    );
  }
  return null;
}

function BookingCardInner(props: BookingCardProps): React.JSX.Element {
  const { booking, variant, emphasized = false } = props;
  const t = useTranslations('dashboard.bookingCard');
  const { formatMoney, formatTime } = useFormatting();
  const whenLabel = useBookingWhenLabel();
  const scheduledAt = new Date(booking.scheduledAt);
  const statusLabel = buildBookingStatusLabels(t);
  const approvalPending = variant === 'action-needed' ? (props.isApproving ?? false) : false;
  const typeLabel = booking.isCustomer ? t('customerType') : t('guestType');
  const typeBadgeClass = booking.isCustomer
    ? 'bg-blue-100 text-blue-800'
    : 'bg-amber-100 text-amber-800';

  const timeLabel = variant === 'today' ? formatTime(scheduledAt) : whenLabel(scheduledAt);

  return (
    <BookingCardShell
      href={`/dashboard/bookings/${booking.bookingId}`}
      linkAriaLabel={t('viewDetailsAriaLabel', { name: booking.contactName })}
      name={booking.contactName}
      badges={
        <>
          <Badge className={`shrink-0 border-0 text-xs ${typeBadgeClass}`}>{typeLabel}</Badge>
          <Badge
            className={`shrink-0 text-xs ${BOOKING_STATUS_CLASSES[booking.status] ?? 'bg-gray-100 text-gray-600'}`}
          >
            {statusLabel[booking.status] ?? booking.status}
          </Badge>
          {booking.hasOpenException ? (
            <Badge
              data-testid="booking-needs-decision-pill"
              className="shrink-0 gap-1 border-0 bg-orange-100 text-xs text-orange-800"
            >
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {t('needsDecision')}
            </Badge>
          ) : null}
        </>
      }
      serviceLine={booking.serviceNames.join(', ')}
      timeLabel={timeLabel}
      priceLabel={`${formatMoney(booking.totalPrice.amount)} · ${formatDuration(booking.totalDurationMins)}`}
      actions={renderActions(props, approvalPending, t)}
      className={[
        'mb-3 transition-shadow',
        booking.status === 'INFO_REQUESTED' ? 'border-l-[3px] border-l-blue-600' : '',
        emphasized ? 'border-blue-500 bg-blue-50/60 shadow-sm' : '',
        variant === 'upcoming' && !emphasized ? 'opacity-70' : 'hover:shadow-md',
      ]
        .filter(Boolean)
        .join(' ')}
    />
  );
}

export function BookingCard(props: BookingCardProps): React.JSX.Element {
  return <BookingCardInner {...props} />;
}
