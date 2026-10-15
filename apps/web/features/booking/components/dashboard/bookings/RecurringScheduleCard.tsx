'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { useStaffCustomer } from '@/features/customer/hooks/useStaffCustomer';
import { useRecurrenceText } from '@/features/customer/components/my-account/use-recurrence-text';
import {
  isApprovalHoldExpired,
  maxOccurrenceCount,
  recurringScheduleStaffPath,
} from '@/features/booking/model/recurring-approval';
import { BookingCardShell } from './BookingCardShell';

interface RecurringScheduleCardProps {
  readonly schedule: RecurringBookingScheduleListItem;
}

// A recurring-schedule request waiting for a decision, in the Agenda's "Precisa de ação" block
// (UC-071, M23-S13). It reads like a booking card but is marked as a recurrence (teal badge and left
// border) and has no quick "Aprovar": one decision creates every reservation of the term, so the
// only way to decide is the detail screen the whole card and "Ver pedido" lead to.
export function RecurringScheduleCard({ schedule }: RecurringScheduleCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingQueue');
  const typeT = useTranslations('dashboard.bookingCard');
  const { formatTime } = useFormatting();
  const { recurrenceLine, formatDateKey } = useRecurrenceText();
  // The schedule carries only the customer's id; a card whose read is pending or failed still
  // works, it just names the customer generically.
  const customer = useStaffCustomer(schedule.customerId);
  const name = customer.data?.name ?? t('recurrenceCustomerFallback');
  const href = recurringScheduleStaffPath(schedule.id);

  return (
    <div data-testid="recurring-schedule-card" data-schedule-id={schedule.id}>
      <BookingCardShell
        href={href}
        linkAriaLabel={t('recurrenceViewAriaLabel', { name })}
        name={name}
        badges={
          <>
            <Badge className="shrink-0 border-0 bg-blue-100 text-xs text-blue-800">
              {typeT('customerType')}
            </Badge>
            <Badge className="shrink-0 border-0 bg-teal-100 text-xs text-teal-800">
              {t('recurrenceBadge')}
            </Badge>
          </>
        }
        serviceLine={`${schedule.serviceName} · ${recurrenceLine(schedule.recurrence)}`}
        timeLabel={t('recurrenceTerm', {
          start: formatDateKey(schedule.startsOn),
          end: formatDateKey(schedule.endsOn),
          count: maxOccurrenceCount(schedule),
        })}
        priceLabel=""
        actions={
          <Button asChild size="sm">
            <Link href={href}>{t('recurrenceView')}</Link>
          </Button>
        }
        className="mb-3 border-l-[3px] border-l-teal-700 transition-shadow hover:shadow-md"
      >
        {schedule.approvalHoldExpiresAt ? (
          <p
            className={`mt-2 text-xs font-semibold ${isApprovalHoldExpired(schedule) ? 'text-red-700' : 'text-amber-800'}`}
            data-testid="recurring-card-deadline"
          >
            {isApprovalHoldExpired(schedule)
              ? t('recurrenceHoldExpired')
              : t('recurrenceDecideBy', {
                  time: formatTime(new Date(schedule.approvalHoldExpiresAt)),
                })}
          </p>
        ) : null}
      </BookingCardShell>
    </div>
  );
}
