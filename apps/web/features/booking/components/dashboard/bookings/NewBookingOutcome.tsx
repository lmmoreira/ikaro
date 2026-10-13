'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { BookingResponse } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import type { StaffBookingFailureKind } from '@/features/booking/model/staff-booking-failure';
import { BookingOutcomeActionRail } from './BookingOutcomeActionRail';

type OutcomeTone = 'success' | 'danger';

const SECONDARY_BUTTON = 'w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50';

interface OutcomeShellProps {
  readonly tone: OutcomeTone;
  readonly title: string;
  readonly body: string;
  readonly recap: React.ReactNode;
  readonly actions: React.ReactNode;
}

function OutcomeShell({ tone, title, body, recap, actions }: OutcomeShellProps): React.JSX.Element {
  const success = tone === 'success';
  return (
    <div className="grid gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_22rem] lg:pb-0">
      <div className="min-w-0 space-y-4">
        <Card
          className={success ? 'border-green-200 bg-green-50/80' : 'border-red-200 bg-red-50/80'}
        >
          <CardContent className="p-4">
            <p
              data-testid="outcome-banner-title"
              className={`text-sm font-bold uppercase tracking-[0.07em] ${
                success ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {title}
            </p>
            <p
              className={`mt-2 text-sm leading-6 ${success ? 'text-green-700/90' : 'text-red-700/90'}`}
            >
              {body}
            </p>
          </CardContent>
        </Card>
        {recap}
      </div>
      <BookingOutcomeActionRail>
        <Card>
          <CardContent className="space-y-3 p-4">{actions}</CardContent>
        </Card>
      </BookingOutcomeActionRail>
    </div>
  );
}

interface CreatedOutcomeProps {
  readonly booking: BookingResponse;
  readonly recipientName: string;
  readonly recap: React.ReactNode;
  readonly whenText: string;
}

// 201: the booking exists, already APPROVED, and occupies the slot.
export function NewBookingCreatedOutcome({
  booking,
  recipientName,
  recap,
  whenText,
}: CreatedOutcomeProps): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.outcome');

  return (
    <OutcomeShell
      tone="success"
      title={t('createdTitle')}
      body={t('createdBody', { when: whenText, name: recipientName })}
      recap={recap}
      actions={
        <>
          <Button asChild className="w-full">
            <Link href={`/dashboard/bookings/${booking.bookingId}`}>{t('viewBooking')}</Link>
          </Button>
          <Button asChild className={SECONDARY_BUTTON}>
            <Link href="/dashboard/bookings/new">{t('createAnother')}</Link>
          </Button>
          <Button asChild className={SECONDARY_BUTTON}>
            <Link href="/dashboard/bookings">{t('backToAgenda')}</Link>
          </Button>
        </>
      }
    />
  );
}

interface FailureOutcomeProps {
  readonly kind: StaffBookingFailureKind;
  readonly recipientName: string;
  readonly message: string;
  readonly recap: React.ReactNode;
  readonly onChooseDate: () => void;
  readonly onRetry: () => void;
}

// A failure that lands on the confirmation: nothing was created and what staff chose is kept.
// A slot conflict never gets here — it returns to the date step (shared error routing).
export function NewBookingFailureOutcome({
  kind,
  recipientName,
  message,
  recap,
  onChooseDate,
  onRetry,
}: FailureOutcomeProps): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.outcome');
  const customerProblem = kind === 'phone' || kind === 'customerNotFound';

  return (
    <OutcomeShell
      tone="danger"
      title={t(`${kind}.title`, { name: recipientName })}
      body={kind === 'generic' ? message : t(`${kind}.body`, { name: recipientName })}
      recap={recap}
      actions={
        <>
          {kind === 'window' && (
            <Button
              type="button"
              className="w-full"
              data-testid="outcome-choose-date"
              onClick={onChooseDate}
            >
              {t('chooseOtherDate')}
            </Button>
          )}
          {customerProblem && (
            <Button asChild className="w-full">
              <Link href="/dashboard/bookings/new" data-testid="outcome-choose-customer">
                {t('chooseOtherCustomer')}
              </Link>
            </Button>
          )}
          {kind === 'generic' && (
            <Button type="button" className="w-full" data-testid="outcome-retry" onClick={onRetry}>
              {t('retry')}
            </Button>
          )}
          <Button asChild className={SECONDARY_BUTTON}>
            <Link href="/dashboard/bookings">{t('backToAgenda')}</Link>
          </Button>
        </>
      }
    />
  );
}
