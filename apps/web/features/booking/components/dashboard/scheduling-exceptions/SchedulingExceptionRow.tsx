'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { SchedulingExceptionBookingSummary, SchedulingExceptionItem } from '@ikaro/types';
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
import { appendReturnTo } from '@/features/booking/model/booking-navigation';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { BookingCardShell } from '@/features/booking/components/dashboard/bookings/BookingCardShell';

const WORKLIST_HREF = '/dashboard/scheduling-exceptions';

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

// The booking could not be read: nothing to show or act on but the fact itself.
function UnavailableCard(): React.JSX.Element {
  const t = useTranslations('dashboard.schedulingExceptionsPage');
  return (
    <Card className="mb-3" data-testid="scheduling-exception-unavailable">
      <CardContent className="p-4">
        <p className="text-sm font-semibold text-gray-900">{t('unavailableBooking')}</p>
        <p className="mt-1 text-xs text-gray-500">{t('unavailableBookingHint')}</p>
      </CardContent>
    </Card>
  );
}

interface RowPillsProps {
  readonly booking: SchedulingExceptionBookingSummary;
  readonly resolved: boolean;
}

// Cliente/Visitante, then the booking's status — or "Resolvida" once the entry was resolved.
function RowPills({ booking, resolved }: RowPillsProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedulingExceptionsPage');
  const cardT = useTranslations('dashboard.bookingCard');
  const statusLabel = buildBookingStatusLabels(cardT);
  const typeClass = booking.isCustomer
    ? 'bg-blue-100 text-blue-800'
    : 'bg-amber-100 text-amber-800';
  const statusClass =
    BOOKING_STATUS_CLASSES[booking.status as keyof typeof BOOKING_STATUS_CLASSES] ??
    'bg-gray-100 text-gray-600';

  return (
    <>
      <Badge className={`shrink-0 border-0 text-xs ${typeClass}`}>
        {booking.isCustomer ? cardT('customerType') : cardT('guestType')}
      </Badge>
      {resolved ? (
        <Badge className="shrink-0 border-0 bg-green-100 text-xs text-green-800">
          {t('resolvedBadge')}
        </Badge>
      ) : (
        <Badge className={`shrink-0 text-xs ${statusClass}`}>
          {statusLabel[booking.status as keyof typeof statusLabel] ?? booking.status}
        </Badge>
      )}
    </>
  );
}

interface RowInfoLineProps {
  readonly item: SchedulingExceptionItem;
  readonly resourceName: string | null;
  readonly outcome?: SchedulingExceptionRowOutcome;
}

// Under the time row: why the entry stayed open (result list), nothing once resolved, otherwise
// the deactivated resource and its stored alternatives.
function RowInfoLine({ item, resourceName, outcome }: RowInfoLineProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.schedulingExceptionsPage');
  if (outcome?.kind === 'resolved') return null;
  if (outcome?.kind === 'open') {
    return (
      <p className="mt-1.5 text-xs font-semibold text-red-700" data-testid="still-open-reason">
        {t('stillOpenReason', { reason: outcome.reason })}
      </p>
    );
  }

  const alternatives = summarizeAlternatives(item);
  const names = alternatives.names.join(', ');
  const listed =
    alternatives.more > 0 ? t('alternativesMore', { names, count: alternatives.more }) : names;
  const alternativesText = t(
    item.alternatives.length === 1 ? 'alternativeOne' : 'alternativeMany',
    {
      names: listed,
    },
  );

  return (
    <p className="mt-1.5 text-xs text-gray-500">
      {t('resourceDeactivated', { resource: resourceName ?? '—' })}
      {' · '}
      {item.alternatives.length === 0 ? (
        <span className="text-amber-700">{t('noAlternative')}</span>
      ) : (
        <span className="text-green-700">{alternativesText}</span>
      )}
    </p>
  );
}

interface RowActionsProps {
  readonly item: SchedulingExceptionItem;
  readonly onReassign?: (id: string) => void;
  readonly onCancel?: (id: string) => void;
}

// Reatribuir, Reagendar (a confirmed booking only: a link to the entry's own route) and Cancelar.
function RowActions({ item, onReassign, onCancel }: RowActionsProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedulingExceptionsPage');
  return (
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
  );
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
  const { formatMoney } = useFormatting();
  const whenLabel = useBookingWhenLabel();
  const booking = item.booking;
  if (!booking) return <UnavailableCard />;

  // A resolved entry has nothing left to select or act on.
  const interactive = outcome?.kind !== 'resolved';
  const checkbox =
    onToggleSelected && interactive ? (
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelected(item.id)}
        aria-label={t('selectEntryAria', { name: booking.contactName })}
        data-testid="scheduling-exception-checkbox"
        className="h-[1.125rem] w-[1.125rem] cursor-pointer accent-blue-600"
      />
    ) : null;
  const actions =
    interactive && (onReassign || onCancel) ? (
      <RowActions item={item} onReassign={onReassign} onCancel={onCancel} />
    ) : null;

  return (
    <BookingCardShell
      // returnTo makes the detail page's back arrow come back here, not to the booking queue.
      href={appendReturnTo(`/dashboard/bookings/${item.affectedId}`, WORKLIST_HREF)}
      linkAriaLabel={t('viewBookingAria', { name: booking.contactName })}
      name={booking.contactName}
      leading={checkbox}
      badges={<RowPills booking={booking} resolved={outcome?.kind === 'resolved'} />}
      serviceLine={booking.serviceNames.join(', ')}
      timeLabel={whenLabel(new Date(booking.scheduledAt))}
      priceLabel={`${formatMoney(booking.totalPrice.amount)} · ${formatDuration(booking.totalDurationMins)}`}
      className={`mb-3 transition-shadow hover:shadow-md ${selected ? 'border-blue-500 bg-blue-50/60 shadow-sm' : ''}`}
      actions={actions}
    >
      <RowInfoLine item={item} resourceName={booking.resourceName} outcome={outcome} />
    </BookingCardShell>
  );
}
