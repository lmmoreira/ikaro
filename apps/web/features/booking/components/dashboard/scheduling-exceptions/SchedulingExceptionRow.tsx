'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { SchedulingExceptionItem } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useBookingWhenLabel } from '@/features/booking/hooks/useBookingWhenLabel';
import {
  BOOKING_STATUS_CLASSES,
  buildBookingStatusLabels,
} from '@/features/booking/model/booking-status';
import {
  isReschedulable,
  summarizeAlternatives,
} from '@/features/booking/model/scheduling-exception-view';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { BookingCardShell } from '@/features/booking/components/dashboard/bookings/BookingCardShell';

export type SchedulingExceptionRowOutcome =
  { readonly kind: 'resolved' } | { readonly kind: 'open'; readonly reason: string };

interface SchedulingExceptionRowProps {
  readonly item: SchedulingExceptionItem;
  readonly selected?: boolean;
  // Omitted in the result list, where a resolved entry has nothing to select.
  readonly onToggleSelected?: (id: string) => void;
  readonly onReassign?: (id: string) => void;
  readonly onCancel?: (id: string) => void;
  // Set in the result list: a resolved pill, or the reason an entry stayed open.
  readonly outcome?: SchedulingExceptionRowOutcome;
}

export function SchedulingExceptionRow({
  item,
  selected = false,
  onToggleSelected,
  onReassign,
  onCancel,
  outcome,
}: SchedulingExceptionRowProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedulingExceptionsPage');
  const cardT = useTranslations('dashboard.bookingCard');
  const { formatMoney } = useFormatting();
  const whenLabel = useBookingWhenLabel();
  const booking = item.booking;

  // The booking could not be read: nothing to show or act on but the fact itself.
  if (!booking) {
    return (
      <Card className="mb-3" data-testid="scheduling-exception-unavailable">
        <CardContent className="p-4">
          <p className="text-sm font-semibold text-gray-900">{t('unavailableBooking')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('unavailableBookingHint')}</p>
        </CardContent>
      </Card>
    );
  }

  const statusLabel = buildBookingStatusLabels(cardT);
  const typeBadgeClass = booking.isCustomer
    ? 'bg-blue-100 text-blue-800'
    : 'bg-amber-100 text-amber-800';
  const alternatives = summarizeAlternatives(item);
  const names = alternatives.names.join(', ');
  const alternativesNames =
    alternatives.more > 0 ? t('alternativesMore', { names, count: alternatives.more }) : names;
  const alternativesText = t(
    item.alternatives.length === 1 ? 'alternativeOne' : 'alternativeMany',
    {
      names: alternativesNames,
    },
  );

  const interactive = !outcome || outcome.kind === 'open';
  const showActions = interactive && (onReassign || onCancel);

  return (
    <BookingCardShell
      href={`/dashboard/bookings/${item.affectedId}`}
      linkAriaLabel={t('viewBookingAria', { name: booking.contactName })}
      name={booking.contactName}
      leading={
        onToggleSelected && interactive ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelected(item.id)}
            aria-label={t('selectEntryAria', { name: booking.contactName })}
            data-testid="scheduling-exception-checkbox"
            className="h-[1.125rem] w-[1.125rem] cursor-pointer accent-blue-600"
          />
        ) : null
      }
      badges={
        <>
          <Badge className={`shrink-0 border-0 text-xs ${typeBadgeClass}`}>
            {booking.isCustomer ? cardT('customerType') : cardT('guestType')}
          </Badge>
          {outcome?.kind === 'resolved' ? (
            <Badge className="shrink-0 border-0 bg-green-100 text-xs text-green-800">
              {t('resolvedBadge')}
            </Badge>
          ) : (
            <Badge
              className={`shrink-0 text-xs ${BOOKING_STATUS_CLASSES[booking.status as keyof typeof BOOKING_STATUS_CLASSES] ?? 'bg-gray-100 text-gray-600'}`}
            >
              {statusLabel[booking.status as keyof typeof statusLabel] ?? booking.status}
            </Badge>
          )}
        </>
      }
      serviceLine={booking.serviceNames.join(', ')}
      timeLabel={whenLabel(new Date(booking.scheduledAt))}
      priceLabel={`${formatMoney(booking.totalPrice.amount)} · ${formatDuration(booking.totalDurationMins)}`}
      className={`mb-3 transition-shadow hover:shadow-md ${selected ? 'border-blue-500 bg-blue-50/60 shadow-sm' : ''}`}
      actions={
        showActions ? (
          <>
            {onReassign ? (
              <Button type="button" size="sm" onClick={() => onReassign(item.id)}>
                {t('reassign')}
              </Button>
            ) : null}
            {isReschedulable(item) ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/dashboard/scheduling-exceptions/${item.id}/reschedule`}>
                  {t('reschedule')}
                </Link>
              </Button>
            ) : null}
            {onCancel ? (
              <Button type="button" size="sm" variant="outline" onClick={() => onCancel(item.id)}>
                {t('cancel')}
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {outcome?.kind === 'open' ? (
        <p className="mt-1.5 text-xs font-semibold text-red-700" data-testid="still-open-reason">
          {t('stillOpenReason', { reason: outcome.reason })}
        </p>
      ) : outcome?.kind === 'resolved' ? null : (
        <p className="mt-1.5 text-xs text-gray-500">
          {t('resourceDeactivated', { resource: booking.resourceName ?? '—' })}
          {' · '}
          {item.alternatives.length === 0 ? (
            <span className="text-amber-700">{t('noAlternative')}</span>
          ) : (
            <span className="text-green-700">{alternativesText}</span>
          )}
        </p>
      )}
    </BookingCardShell>
  );
}
